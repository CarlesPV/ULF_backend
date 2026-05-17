import * as functions from "firebase-functions";
import * as geofire from "geofire-common";
import { admin } from "../shared/firebase";
import { PostReportPayload, Center } from "../shared/types";
import { getHaversineDistance, isPointInPolygon } from "../shared/utils";

// Cache en memoria para minimizar lecturas a la base de datos
const centersCache: Map<string, Center> = new Map();

/*
    Función para crear un nuevo reporte de objeto perdido o encontrado.
*/
export const createPostReport = functions.https.onCall(async (request) => {
    // 1. Validación de Autenticación usando el objeto 'request'
    if (!request.auth || !request.auth.token.email_verified) {
        throw new functions.https.HttpsError("permission-denied", "Debes verificar tu correo para publicar.");
    }

    // 2. Casteo de los datos a nuestra interfaz definida para mayor seguridad y claridad
    const data = request.data as PostReportPayload;
    const uid = request.auth.uid;

    const { center_id, type, title, description, category, lat, lng, photo_path } = data;

    // 3. Validación de datos mínimos requeridos (Zero Trust)
    const allowedCategories = ["accessories", "clothes", "devices", "wallets", "keys", "bags", "study", "others"];
    
    if (!center_id || !type || !category || !title) {
        throw new functions.https.HttpsError("invalid-argument", "Datos básicos incompletos.");
    }

    // Validación explícita de coordenadas para evitar ceros falsos o nulos
    if (lat === null || lat === undefined || lng === null || lng === undefined) {
        throw new functions.https.HttpsError("invalid-argument", "Coordenadas geográficas requeridas (lat/lng).");
    }

    if (typeof lat !== "number" || typeof lng !== "number") {
        throw new functions.https.HttpsError("invalid-argument", "Las coordenadas deben ser números válidos.");
    }

    if (!allowedCategories.includes(category)) {
        throw new functions.https.HttpsError("invalid-argument", "Categoría no permitida.");
    }

    // 3.5 Validación de límites geográficos (Bounding Box y Radio Haversine)
    let centerData = centersCache.get(center_id);

    if (!centerData) {
        const centerSnap = await admin.database().ref(`centers/${center_id}`).once("value");
        if (!centerSnap.exists()) {
            throw new functions.https.HttpsError("not-found", "El centro especificado no existe.");
        }
        centerData = centerSnap.val() as Center;
        centersCache.set(center_id, centerData);
    }

    const { bounds, location, radius_meters, boundaries } = centerData;

    if (!location || location.lat === undefined || location.lng === undefined) {
        console.error(`ERROR CRÍTICO: El centro ${center_id} no tiene ubicación configurada.`);
        throw new functions.https.HttpsError("internal", "Error de configuración del centro (ubicación faltante).");
    }

    // 0. Validación por Polígono (Prioritaria si existe)
    if (boundaries && boundaries.length > 0) {
        if (!isPointInPolygon({ lat, lng }, boundaries)) {
            throw new functions.https.HttpsError(
                "out-of-range", 
                "La ubicación está fuera de los límites (boundaries) del centro."
            );
        }
    } else {
        // Fallback a validaciones antiguas si no hay polígono definido
    }

    // Validación por Bounding Box (rápida)
    if (bounds) {
        const isOutOfRange = 
            lat < bounds.latMin || 
            lat > bounds.latMax || 
            lng < bounds.lngMin || 
            lng > bounds.lngMax;

        if (isOutOfRange) {
            throw new functions.https.HttpsError(
                "out-of-range", 
                "La ubicación seleccionada está fuera del campus (límites rectangulares)."
            );
        }
    }

    // Validación por Radio Haversine (precisa)
    const distance = getHaversineDistance(lat, lng, location.lat, location.lng);
    const buffer = 50; // 50 metros de margen de error para GPS
    
    if (distance > (radius_meters + buffer)) {
        throw new functions.https.HttpsError(
            "out-of-range", 
            `Ubicación demasiado lejana del centro (${Math.round(distance)}m). El máximo permitido es ${radius_meters + buffer}m.`
        );
    }

    // 4. Generar Geohash para futuras consultas espaciales
    const geohash = geofire.geohashForLocation([lat, lng]);

    const postsRef = admin.database().ref("posts");
    const newPostRef = postsRef.push();
    const postId = newPostRef.key;

    const payload = {
        id: postId,
        user_id: uid,
        center_id: center_id,
        type: type, // 'lost' o 'found'
        title: title,
        description: description || "",
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

    try {
        await newPostRef.set(payload);
        return { success: true, post_id: postId };
    } catch (error) {
        console.error("Error guardando post:", error);
        throw new functions.https.HttpsError("internal", "Error al procesar el reporte.");
    }
});
