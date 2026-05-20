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
                        updates[`${notifId}/read`] = true;
                    }
                });

                if (Object.keys(updates).length > 0) {
                    await notifsRef.update(updates);
                }
            }
            return { success: true, message: "Todas las notificaciones marcadas como leídas." };
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
            idsToMark = notificationIds.map(sanitizeId);
        } else if (notificationId) {
            idsToMark = [sanitizeId(notificationId)];
        }

        if (idsToMark.length === 0) {
            throw new functions.https.HttpsError(
                "invalid-argument",
                I18N_STRINGS.errors.invalid_argument
            );
        }

        // Comprobar la propiedad y existencia de cada ID especificado antes de proceder (Zero Trust)
        const updates: { [key: string]: boolean } = {};
        for (const notifId of idsToMark) {
            try {
                const notifSnap = await admin.database().ref(`users/${uid}/notifications/${notifId}`).once("value");
                if (notifSnap.exists()) {
                    updates[`${notifId}/read`] = true;
                } else {
                    console.warn(`Notificación ${notifId} no encontrada para el usuario ${uid}, se omite del lote.`);
                }
            } catch (err) {
                console.error(`Error al comprobar la notificación ${notifId}:`, err);
            }
        }

        // Operación Batch / Actualización atómica de múltiples paths en RTDB
        if (Object.keys(updates).length > 0) {
            await notifsRef.update(updates);
        }

        return { success: true, message: "Notificaciones marcadas como leídas." };

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
