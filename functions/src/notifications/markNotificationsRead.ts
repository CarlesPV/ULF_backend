import * as functions from "firebase-functions";
import { admin } from "../shared/firebase";
import { I18N_STRINGS } from "../shared/i18n";

/**
 * Marca una o todas las notificaciones del usuario autenticado como leídas.
 * 
 * Si se proporciona `notificationId`, marca únicamente esa notificación específica.
 * Si no se proporciona, marca todas las notificaciones del usuario como leídas.
 * 
 * @param request - Contiene `notificationId` opcional en request.data.
 * @returns Un objeto que indica el éxito de la operación.
 * @throws {HttpsError}
 */
export const markNotificationsRead = functions.https.onCall(async (request) => {
    // Validar autenticación de usuario
    if (!request.auth) {
        throw new functions.https.HttpsError(
            "unauthenticated",
            I18N_STRINGS.errors.unauthorized
        );
    }

    const uid = request.auth.uid;
    const { notificationId } = request.data || {};

    try {
        if (notificationId) {
            if (typeof notificationId !== "string") {
                throw new functions.https.HttpsError(
                    "invalid-argument",
                    I18N_STRINGS.errors.invalid_argument
                );
            }

            const notifRef = admin.database().ref(`users/${uid}/notifications/${notificationId}`);
            const snapshot = await notifRef.once("value");

            if (!snapshot.exists()) {
                throw new functions.https.HttpsError(
                    "not-found",
                    I18N_STRINGS.errors.item_not_found
                );
            }

            await notifRef.update({ read: true });
            return { success: true, message: "Notificación marcada como leída." };
        } else {
            const notifsRef = admin.database().ref(`users/${uid}/notifications`);
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
