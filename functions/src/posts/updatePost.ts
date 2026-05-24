import * as functions from "firebase-functions";
import * as geofire from "geofire-common";
import { admin } from "../shared/firebase";
import { I18N_STRINGS } from "../shared/i18n";
import { getHaversineDistance } from "../shared/utils";
import { Center } from "../shared/types";

const LOCATION_TOLERANCE_METERS = 50;
const SAFE_POST_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const centersCache: Map<string, Center> = new Map();
/**
 * Actualiza los detalles de una publicación de objeto perdido o encontrado de forma segura.
 * Incluye validaciones defensivas de autoría, geovallado y registro de borrado diferido para imágenes.
 */
export const updatePost = functions.https.onCall(async (request) => {
    // 1. Validar autenticación
    if (!request.auth || !request.auth.token.email_verified) {
        throw new functions.https.HttpsError("permission-denied", I18N_STRINGS.errors.unverified_email);
    }

    // 2. Validar token de App Check si no estamos en el emulador o en pruebas unitarias
    if (process.env.FUNCTIONS_EMULATOR !== "true" && process.env.NODE_ENV !== "test" && !request.app) {
        throw new functions.https.HttpsError("failed-precondition", I18N_STRINGS.errors.unauthorized);
    }

    const { postId, updates } = request.data || {};

    // Validar identificador del post
    if (
        typeof postId !== "string" ||
        postId.trim().length === 0 ||
        !SAFE_POST_ID_PATTERN.test(postId.trim())
    ) {
        throw new functions.https.HttpsError("invalid-argument", I18N_STRINGS.errors.invalid_argument);
    }

    if (!updates || typeof updates !== "object") {
        throw new functions.https.HttpsError("invalid-argument", I18N_STRINGS.errors.invalid_argument);
    }

    const normalizedPostId = postId.trim();
    const postRef = admin.database().ref(`posts/${normalizedPostId}`);
    const postSnap = await postRef.once("value");

    if (!postSnap.exists()) {
        throw new functions.https.HttpsError("not-found", I18N_STRINGS.errors.item_not_found);
    }

    const post = postSnap.val();

    // Validar que el usuario es el creador del post
    if (post.user_id !== request.auth.uid) {
        throw new functions.https.HttpsError("permission-denied", I18N_STRINGS.errors.unauthorized);
    }

    const allowedKeys = ["title", "description", "category", "coords", "imageUrl", "postImageUrl", "photo_path", "type", "center_id", "status"];
    const updatePayload: any = {};

    for (const key of Object.keys(updates)) {
        if (!allowedKeys.includes(key)) {
            throw new functions.https.HttpsError("invalid-argument", I18N_STRINGS.errors.invalid_argument);
        }
    }

    if (updates.title !== undefined) {
        if (typeof updates.title !== "string" || updates.title.trim().length === 0) {
            throw new functions.https.HttpsError("invalid-argument", I18N_STRINGS.errors.invalid_argument);
        }
        updatePayload.title = updates.title.trim();
    }

    if (updates.description !== undefined) {
        if (updates.description !== null && typeof updates.description !== "string") {
            throw new functions.https.HttpsError("invalid-argument", I18N_STRINGS.errors.invalid_argument);
        }
        updatePayload.description = updates.description ? updates.description.trim() : "";
    }

    if (updates.category !== undefined) {
        const allowedCategories = ["accessories", "clothes", "devices", "wallets", "keys", "bags", "study", "others"];
        if (typeof updates.category !== "string" || !allowedCategories.includes(updates.category)) {
            throw new functions.https.HttpsError("invalid-argument", I18N_STRINGS.errors.category_not_allowed);
        }
        updatePayload.category = updates.category;
    }

    if (updates.status !== undefined) {
        const allowedStatuses = ["active", "matched", "returned", "rejected"];
        if (typeof updates.status !== "string" || !allowedStatuses.includes(updates.status)) {
            throw new functions.https.HttpsError("invalid-argument", I18N_STRINGS.errors.invalid_argument);
        }
        updatePayload.status = updates.status;
    }

    const centerId = updates.center_id !== undefined ? updates.center_id : post.center_id;

    if (updates.coords !== undefined) {
        const coords = updates.coords;
        if (!coords || typeof coords !== "object" || typeof coords.lat !== "number" || typeof coords.lng !== "number") {
            throw new functions.https.HttpsError("invalid-argument", I18N_STRINGS.errors.coords_invalid);
        }

        // Validación de Geovallado
        let centerData = centersCache.get(centerId);
        if (!centerData) {
            const centerSnap = await admin.database().ref(`centers/${centerId}`).once("value");
            if (!centerSnap.exists()) {
                throw new functions.https.HttpsError("not-found", I18N_STRINGS.errors.center_not_found);
            }
            centerData = centerSnap.val() as Center;
            centersCache.set(centerId, centerData);
        }

        const { location, radius_meters } = centerData;
        if (!location || location.lat === undefined || location.lng === undefined) {
            throw new functions.https.HttpsError("internal", I18N_STRINGS.errors.center_config_error);
        }

        const distance = getHaversineDistance(coords.lat, coords.lng, location.lat, location.lng);
        const maxAllowedDistance = radius_meters + LOCATION_TOLERANCE_METERS;

        if (distance > maxAllowedDistance) {
            throw new functions.https.HttpsError("out-of-range", I18N_STRINGS.errors.out_of_bounds_location);
        }

        const geohash = geofire.geohashForLocation([coords.lat, coords.lng]);
        updatePayload.coords = {
            lat: coords.lat,
            lng: coords.lng,
            geohash: geohash
        };
    }

    if (updates.imageUrl !== undefined) {
        if (updates.imageUrl !== null && typeof updates.imageUrl !== "string") {
            throw new functions.https.HttpsError("invalid-argument", I18N_STRINGS.errors.invalid_argument);
        }
        updatePayload.imageUrl = updates.imageUrl || "";
    }

    if (updates.postImageUrl !== undefined) {
        if (updates.postImageUrl !== null && typeof updates.postImageUrl !== "string") {
            throw new functions.https.HttpsError("invalid-argument", I18N_STRINGS.errors.invalid_argument);
        }
        updatePayload.postImageUrl = updates.postImageUrl || "";
    }

    if (updates.photo_path !== undefined) {
        if (updates.photo_path !== null && typeof updates.photo_path !== "string") {
            throw new functions.https.HttpsError("invalid-argument", I18N_STRINGS.errors.invalid_argument);
        }
        updatePayload.photo_path = updates.photo_path || "";
    }

    if (updates.type !== undefined) {
        if (updates.type !== "lost" && updates.type !== "found") {
            throw new functions.https.HttpsError("invalid-argument", I18N_STRINGS.errors.invalid_argument);
        }
        updatePayload.type = updates.type;
    }

    if (updates.center_id !== undefined) {
        if (updates.coords === undefined) {
            let centerData = centersCache.get(updates.center_id);
            if (!centerData) {
                const centerSnap = await admin.database().ref(`centers/${updates.center_id}`).once("value");
                if (!centerSnap.exists()) {
                    throw new functions.https.HttpsError("not-found", I18N_STRINGS.errors.center_not_found);
                }
                centerData = centerSnap.val() as Center;
                centersCache.set(updates.center_id, centerData);
            }
        }
        updatePayload.center_id = updates.center_id;
    }

    if (Object.keys(updatePayload).length === 0) {
        return { success: true };
    }

    updatePayload.updated_at = admin.database.ServerValue.TIMESTAMP;

    await postRef.update(updatePayload);

    return { success: true };
});
