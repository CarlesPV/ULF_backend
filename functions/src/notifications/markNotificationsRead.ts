import * as functions from "firebase-functions";
import { admin } from "../shared/firebase";
import { I18N_STRINGS } from "../shared/i18n";

/**
 * Marca una, varias o todas las notificaciones del usuario autenticado como leídas.
 * 
 * Acepta en request.data:
 * - `notificationId`: (Opcional) ID de una única notificación a marcar.
 * - `notificationIds`: (Opcional) Array de IDs de notificaciones a marcar de forma masiva.
 * - `all`: (Opcional) Booleano que si es true, o si no se proveen IDs, marca todas las notificaciones del usuario.
 * 
 * @param request - Parámetros de la llamada callable.
 * @returns Un objeto que indica el éxito de la operación.
 * @throws {HttpsError}
 */
export const markNotificationsRead = functions.https.onCall(async (request) => {
    // Validar autenticación de usuario (Zero Trust)
    if (!request.auth) {
        throw new functions.https.HttpsError(
            "unauthenticated",
            I18N_STRINGS.errors.unauthorized
        );
    }

    const uid = request.auth.uid;
    if (!uid || typeof uid !== "string") {
        throw new functions.https.HttpsError(
            "unauthenticated",
            I18N_STRINGS.errors.unauthorized
        );
    }

    const { notificationId, notificationIds, all } = request.data || {};
    const MAX_NOTIFICATION_IDS = 500;

    const sanitizeId = (id: any): string => {
        if (typeof id !== "string" || !/^[a-zA-Z0-9\-_]+$/.test(id)) {
            throw new functions.https.HttpsError(
                "invalid-argument",
                I18N_STRINGS.errors.invalid_argument
            );
        }
        return id;
    };

    try {
        const notifsRef = admin.database().ref(`users/${uid}/notifications`);

        // Determinar si debemos marcar todas las notificaciones como leídas
        const shouldMarkAll = all === true || (!notificationId && !notificationIds);

        if (shouldMarkAll) {
            const snapshot = await notifsRef.once("value");
            if (snapshot.exists()) {
                const updates: { [key: string]: boolean } = {};
                snapshot.forEach((child) => {
                    const notifId = child.key;
                    if (notifId) {
                        updates[`users/${uid}/notifications/${notifId}/read`] = true;
                    }
                });

                if (Object.keys(updates).length > 0) {
                    await admin.database().ref().update(updates);
                }
            }
            return { success: true };
        }

        // Si se especifican IDs particulares
        let idsToMark: string[] = [];
        if (notificationIds) {
            if (!Array.isArray(notificationIds)) {
                throw new functions.https.HttpsError(
                    "invalid-argument",
                    I18N_STRINGS.errors.invalid_argument
                );
            }
            idsToMark = [...new Set(notificationIds.map(sanitizeId))];
        } else if (notificationId) {
            idsToMark = [sanitizeId(notificationId)];
        }

        if (idsToMark.length === 0 || idsToMark.length > MAX_NOTIFICATION_IDS) {
            throw new functions.https.HttpsError(
                "invalid-argument",
                I18N_STRINGS.errors.invalid_argument
            );
        }

        const existingNotifications = await notifsRef.once("value");
        const existingNotificationsValue = existingNotifications.val() || {};

        // Operación batch atómica sobre rutas absolutas de RTDB.
        const updates: { [key: string]: boolean } = {};
        for (const notifId of idsToMark) {
            if (!Object.prototype.hasOwnProperty.call(existingNotificationsValue, notifId)) {
                throw new functions.https.HttpsError(
                    "not-found",
                    I18N_STRINGS.errors.item_not_found
                );
            }
            updates[`users/${uid}/notifications/${notifId}/read`] = true;
        }

        await admin.database().ref().update(updates);

        return { success: true };

    } catch (error) {
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        console.error(`Error al marcar notificaciones como leídas para el usuario ${uid}:`, error);
        throw new functions.https.HttpsError(
            "internal",
            I18N_STRINGS.errors.internal_error
        );
    }
});
