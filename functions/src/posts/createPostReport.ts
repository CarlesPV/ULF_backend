import * as functions from "firebase-functions";
import * as geofire from "geofire-common";
import { admin } from "../shared/firebase";
import { PostReportPayload, Center } from "../shared/types";
import { getHaversineDistance } from "../shared/utils";
import { I18N_STRINGS } from "../shared/i18n";

// Margen de tolerancia de 50 metros para compensar punto flotante y GPS (según roadmap.md)
const LOCATION_TOLERANCE_METERS = 50;

// Cache en memoria para minimizar lecturas a la base de datos
const centersCache: Map<string, Center> = new Map();

/**
 * Crea e inicializa una nueva publicación (reporte) de objeto perdido o encontrado en el sistema.
 * 
 * Esta función de Cloud Call implementa un enfoque de validación defensivo (Zero Trust) y geovallado (Geofencing):
 * 1. Comprueba que el usuario de la llamada cuente con sesión activa y correo institucional verificado.
 * 2. Realiza validaciones estrictas sobre campos mandatorios, formato e integridad de coordenadas y categorías permitidas.
 * 3. Recupera y cachea localmente en memoria (`centersCache`) la información del centro universitario para optimizar las cuotas de lectura de base de datos.
 * 4. Geovallado por Radio Haversine: Calcula la distancia exacta del post a la ubicación central del campus.
 *    Aplica un margen de tolerancia de 50 metros (`LOCATION_TOLERANCE_METERS`) para mitigar las limitaciones matemáticas de precisión 
 *    del punto flotante y las pequeñas desviaciones inherentes a los sensores GPS de los terminales móviles.
 * 5. Si el objeto supera el radio geográfico permitido, deniega la inserción lanzando un error `'out-of-range'`.
 * 6. Genera de forma automatizada un geohash espacial para agilizar consultas geográficas.
 * 7. Registra y escribe atómicamente el documento en la ruta `/posts/{postId}`.
 * 
 * @param request - Objeto de petición que implementa la interfaz `PostReportPayload`:
 *   - center_id: Identificador único del centro educativo en el que se extravió/halló el objeto.
 *   - type: Tipo de publicación ("lost" o "found").
 *   - title: Título conciso del reporte.
 *   - description: (Opcional) Descripción detallada del objeto.
 *   - category: Categoría del objeto (debe pertenecer a `allowedCategories`).
 *   - lat: Latitud geográfica exacta de la ubicación del objeto.
 *   - lng: Longitud geográfica exacta de la ubicación del objeto.
 *   - photo_path: (Opcional) Ruta de almacenamiento del archivo de imagen asociado.
 * 
 * @returns Un objeto que indica el éxito del registro y el identificador único (`post_id`) generado.
 * 
 * @throws {HttpsError}
 *   - 'permission-denied': Si el correo del emisor no está verificado.
 *   - 'invalid-argument': Si faltan campos estructurales obligatorios, el formato de coordenadas es inválido o la categoría no está permitida.
 *   - 'not-found': Si el centro educativo especificado no está registrado en el sistema.
 *   - 'out-of-range': Si la posición geográfica del reporte se ubica fuera del radio autorizado del campus.
 *   - 'internal': Si el centro carece de coordenadas de configuración o en caso de error de escritura en Realtime Database.
 */
export const createPostReport = functions.https.onCall(async (request) => {
    // Validar autenticación de usuario y estado de verificación del correo electrónico
    if (!request.auth || !request.auth.token.email_verified) {
        throw new functions.https.HttpsError("permission-denied", I18N_STRINGS.errors.unverified_email);
    }

    const data = request.data as PostReportPayload;
    const uid = request.auth.uid;

    const { center_id, type, title, description, category, lat, lng, photo_path } = data;

    const allowedCategories = ["accessories", "clothes", "devices", "wallets", "keys", "bags", "study", "others"];
    
    // Validación Zero Trust de campos mandatorios
    if (!center_id || !type || !category || !title) {
        throw new functions.https.HttpsError("invalid-argument", I18N_STRINGS.errors.incomplete_data);
    }

    if (type !== "lost" && type !== "found") {
        throw new functions.https.HttpsError("invalid-argument", I18N_STRINGS.errors.invalid_argument);
    }

    // Validación exhaustiva de las coordenadas geográficas enviadas
    if (lat === null || lat === undefined || lng === null || lng === undefined) {
        throw new functions.https.HttpsError("invalid-argument", I18N_STRINGS.errors.coords_required);
    }

    if (typeof lat !== "number" || typeof lng !== "number") {
        throw new functions.https.HttpsError("invalid-argument", I18N_STRINGS.errors.coords_invalid);
    }

    if (!allowedCategories.includes(category)) {
        throw new functions.https.HttpsError("invalid-argument", I18N_STRINGS.errors.category_not_allowed);
    }

    // Comprobar la existencia del centro y recuperar su geolocalización (con soporte de caché local)
    let centerData = centersCache.get(center_id);

    if (!centerData) {
        const centerSnap = await admin.database().ref(`centers/${center_id}`).once("value");
        if (!centerSnap.exists()) {
            throw new functions.https.HttpsError("not-found", I18N_STRINGS.errors.center_not_found);
        }
        centerData = centerSnap.val() as Center;
        centersCache.set(center_id, centerData);
    }

    const { location, radius_meters } = centerData;

    if (!location || location.lat === undefined || location.lng === undefined) {
        console.error(`ERROR CRÍTICO: El centro ${center_id} no tiene ubicación configurada.`);
        throw new functions.https.HttpsError("internal", I18N_STRINGS.errors.center_config_error);
    }

    // NOTA DE DISEÑO: Se desestima el geovallado por límites de polígono exactos debido a que
    // sus aristas rígidas no toleran las imprecisiones de punto flotante de los terminales
    // y pequeños retardos del sensor GPS. Se prioriza el radio Haversine + tolerancia de 50 metros.
    const distance = getHaversineDistance(lat, lng, location.lat, location.lng);
    const maxAllowedDistance = radius_meters + LOCATION_TOLERANCE_METERS;
    
    functions.logger.info(`[Geovallado createPostReport] Post: ${title} | Distancia: ${distance.toFixed(2)}m | Radio: ${radius_meters}m | Tolerancia: ${LOCATION_TOLERANCE_METERS}m | Max permitido: ${maxAllowedDistance}m`);

    if (distance > maxAllowedDistance) {
        throw new functions.https.HttpsError(
            "out-of-range", 
            I18N_STRINGS.errors.out_of_bounds_location
        );
    }

    // Generar codificación Geohash espacial para optimizar consultas espaciales futuras en el Feed
    const geohash = geofire.geohashForLocation([lat, lng]);

    const postsRef = admin.database().ref("posts");
    const newPostRef = postsRef.push();
    const postId = newPostRef.key;

    const payload: any = {
        id: postId,
        user_id: uid,
        center_id: center_id,
        type: type,
        title: title,
        category: category,
        status: "active",
        coords: {
            lat: lat,
            lng: lng,
            geohash: geohash
        },
        photo_path: photo_path || "",
        created_at: admin.database.ServerValue.TIMESTAMP,
        updated_at: admin.database.ServerValue.TIMESTAMP,
        is_deleted: false
    };

    if (description && description.trim().length > 0) {
        payload.description = description.trim();
    }

    try {
        await newPostRef.set(payload);
        return { success: true, post_id: postId };
    } catch (error) {
        console.error("Error guardando post:", error);
        throw new functions.https.HttpsError("internal", I18N_STRINGS.errors.db_write_error);
    }
});
