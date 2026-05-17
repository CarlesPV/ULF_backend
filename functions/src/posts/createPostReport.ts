import * as functions from "firebase-functions";
import * as geofire from "geofire-common";
import { admin } from "../shared/firebase";
import { PostReportPayload, Center } from "../shared/types";
import { getHaversineDistance, isPointInPolygon } from "../shared/utils";
import { I18N_STRINGS } from "../shared/i18n";

// Cache en memoria para minimizar lecturas a la base de datos
const centersCache: Map<string, Center> = new Map();

/*
    Función para crear un nuevo reporte de objeto perdido o encontrado.
*/
export const createPostReport = functions.https.onCall(async (request) => {
    // 1. Validación de Autenticación usando el objeto 'request'
    if (!request.auth || !request.auth.token.email_verified) {
        throw new functions.https.HttpsError("permission-denied", I18N_STRINGS.errors.unverified_email);
    }

    // 2. Casteo de los datos a nuestra interfaz definida para mayor seguridad y claridad
    const data = request.data as PostReportPayload;
    const uid = request.auth.uid;

    const { center_id, type, title, description, category, lat, lng, photo_path } = data;

    // 3. Validación de datos mínimos requeridos (Zero Trust)
    const allowedCategories = ["accessories", "clothes", "devices", "wallets", "keys", "bags", "study", "others"];
    
    if (!center_id || !type || !category || !title) {
        throw new functions.https.HttpsError("invalid-argument", I18N_STRINGS.errors.incomplete_data);
    }

    // Validación explícita de coordenadas para evitar ceros falsos o nulos
    if (lat === null || lat === undefined || lng === null || lng === undefined) {
        throw new functions.https.HttpsError("invalid-argument", I18N_STRINGS.errors.coords_required);
    }

    if (typeof lat !== "number" || typeof lng !== "number") {
        throw new functions.https.HttpsError("invalid-argument", I18N_STRINGS.errors.coords_invalid);
    }

    if (!allowedCategories.includes(category)) {
        throw new functions.https.HttpsError("invalid-argument", I18N_STRINGS.errors.category_not_allowed);
    }

    // 3.5 Validación de límites geográficos (Bounding Box y Radio Haversine)
    let centerData = centersCache.get(center_id);

    if (!centerData) {
        const centerSnap = await admin.database().ref(`centers/${center_id}`).once("value");
        if (!centerSnap.exists()) {
            throw new functions.https.HttpsError("not-found", I18N_STRINGS.errors.center_not_found);
        }
        centerData = centerSnap.val() as Center;
        centersCache.set(center_id, centerData);
    }

    const { bounds, location, radius_meters, boundaries } = centerData;

    if (!location || location.lat === undefined || location.lng === undefined) {
        console.error(`ERROR CRÍTICO: El centro ${center_id} no tiene ubicación configurada.`);
        throw new functions.https.HttpsError("internal", I18N_STRINGS.errors.center_config_error);
    }

    // 0. Validación por Polígono (Prioritaria si existe)
    if (boundaries && boundaries.length > 0) {
        if (!isPointInPolygon({ lat, lng }, boundaries)) {
            throw new functions.https.HttpsError(
                "out-of-range", 
                I18N_STRINGS.errors.out_of_bounds_location
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
                I18N_STRINGS.errors.out_of_bounds_location
            );
        }
    }

    // Validación por Radio Haversine (precisa) con 5% de margen de tolerancia
    const distance = getHaversineDistance(lat, lng, location.lat, location.lng);
    const maxAllowedDistance = radius_meters * 1.05;
    
    if (distance > maxAllowedDistance) {
        throw new functions.https.HttpsError(
            "out-of-range", 
            I18N_STRINGS.errors.out_of_bounds_location
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
        throw new functions.https.HttpsError("internal", I18N_STRINGS.errors.db_write_error);
    }
});
