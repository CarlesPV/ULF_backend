import { admin } from "./firebase";
import { I18N_STRINGS } from "./i18n";

/**
 * Tipo de notificación para matches
 */
export enum NotificationType {
    MATCH_FOUND = "match_found",
    MATCH_ALERT = "match_alert"
}

/**
 * Estructura de datos para una notificación
 */
export interface NotificationPayload {
    type: NotificationType;
    title: string;
    body: string;
    data: {
        matchPostId: string;
        matchTitle: string;
        matchScore: number;
        matchPhotoUrl?: string;
        timestamp: number;
    };
}

/**
 * Envía una notificación push FCM a un usuario
 * @param userId - UID del usuario receptor
 * @param payload - Datos de la notificación
 * @returns true si se envió al menos a un dispositivo, false si no hay tokens
 */
export async function sendNotificationToUser(
    userId: string,
    payload: NotificationPayload
): Promise<boolean> {
    try {
        // 1. Obtener todos los tokens FCM del usuario
        const tokensSnapshot = await admin
            .database()
            .ref(`users/${userId}/fcm_tokens`)
            .once("value");

        if (!tokensSnapshot.exists()) {
            console.log(`No FCM tokens found for user ${userId}`);
            return false;
        }

        const tokens = Object.keys(tokensSnapshot.val());
        if (tokens.length === 0) return false;

        // 2. Preparar el mensaje para FCM
        const message = {
            notification: {
                title: payload.title,
                body: payload.body,
            },
            data: {
                type: payload.type,
                matchPostId: payload.data.matchPostId,
                matchTitle: payload.data.matchTitle,
                matchScore: payload.data.matchScore.toString(),
                matchPhotoUrl: payload.data.matchPhotoUrl || "",
                timestamp: payload.data.timestamp.toString(),
            },
        };

        // 3. Enviar a todos los tokens en paralelo
        const sendPromises = tokens.map((token) =>
            admin
                .messaging()
                .send({
                    token,
                    ...message,
                })
                .catch((error) => {
                    // Log del error pero continuar con otros tokens
                    console.error(`Error enviando notificación a token ${token}:`, error);
                    // Opcionalmente, eliminar tokens inválidos
                    if (
                        error.code === "messaging/invalid-registration-token" ||
                        error.code === "messaging/registration-token-not-registered"
                    ) {
                        return admin
                            .database()
                            .ref(`users/${userId}/fcm_tokens/${token}`)
                            .remove();
                    }
                })
        );

        const results = await Promise.all(sendPromises);
        const successCount = results.filter((r) => r).length;

        if (successCount > 0) {
            console.log(`Notificación enviada a ${successCount} dispositivos del usuario ${userId}`);
            return true;
        }

        return false;
    } catch (error) {
        console.error(`Error al enviar notificación a usuario ${userId}:`, error);
        return false;
    }
}

/**
 * Notifica a un usuario sobre un match encontrado
 * @param userId - UID del usuario que recibirá la notificación
 * @param matchPost - Datos del post que coincide
 * @param matchScore - Score de la coincidencia
 */
export async function notifyMatchFound(
    userId: string,
    matchPost: {
        id: string;
        title: string;
        description: string;
        photo_url?: string;
    },
    matchScore: number
): Promise<boolean> {
    const payload: NotificationPayload = {
        type: NotificationType.MATCH_FOUND,
        title: I18N_STRINGS.notifications?.match_found_title || "¡Coincidencia encontrada!",
        body:
            I18N_STRINGS.notifications?.match_found_body ||
            `Se encontró un objeto que podría coincidir: "${matchPost.title}"`,
        data: {
            matchPostId: matchPost.id,
            matchTitle: matchPost.title,
            matchScore,
            matchPhotoUrl: matchPost.photo_url,
            timestamp: Date.now(),
        },
    };

    return sendNotificationToUser(userId, payload);
}

/**
 * Notifica a múltiples usuarios sobre matches encontrados
 * @param userIds - Array de UIDs de usuarios a notificar
 * @param matchPost - Datos del post que coincide
 * @param matchScore - Score de la coincidencia
 */
export async function notifyMultipleUsersOfMatch(
    userIds: string[],
    matchPost: {
        id: string;
        title: string;
        description: string;
        photo_url?: string;
    },
    matchScore: number
): Promise<{ success: number; failed: number }> {
    const promises = userIds.map((userId) => notifyMatchFound(userId, matchPost, matchScore));
    const results = await Promise.all(promises);

    const success = results.filter((r) => r).length;
    const failed = results.filter((r) => !r).length;

    console.log(`Notificación de match: ${success} éxito, ${failed} fallos`);
    return { success, failed };
}
