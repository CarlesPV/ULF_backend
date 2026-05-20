import { admin } from "./firebase";
import { getNotificationString } from "./i18n";
import { SupportedLanguage } from "./types";

/**
 * Clasificación de tipos de notificación push soportados por el sistema de emparejamiento.
 */
export enum NotificationType {
    MATCH_FOUND = "match_found",
    MATCH_ALERT = "match_alert",
    NEW_MESSAGE = "new_message"
}

/**
 * Representa la estructura de datos obligatoria para construir una notificación push en FCM y guardar In-App.
 */
export interface NotificationPayload {
    type: NotificationType | string;
    title: string;
    body: string;
    data: {
        matchPostId?: string;
        matchTitle?: string;
        matchScore?: number;
        matchPhotoUrl?: string;
        timestamp: number;
        chatId?: string;
        messageId?: string;
        [key: string]: any;
    };
}

/**
 * Transmite una notificación push a través de Firebase Cloud Messaging (FCM) a todos los dispositivos registrados de un usuario.
 * 
 * Este método implementa la siguiente lógica atómica y robusta:
 * 1. Consulta la base de datos en `/users/{userId}/fcm_tokens` para obtener todos los tokens activos asociados al usuario.
 * 2. Prepara la estructura del mensaje FCM serializando campos numéricos y objetos de datos.
 * 3. Realiza la transmisión de forma concurrente para optimizar los tiempos de respuesta.
 * 4. Gestión de Limpieza: Captura y maneja de forma segura las excepciones individuales por dispositivo. Si un token ha expirado 
 *    o es inválido (`messaging/invalid-registration-token` o `messaging/registration-token-not-registered`), 
 *    procede a removerlo automáticamente de la base de datos para evitar envíos infructuosos futuros.
 * 
 * @param userId - Identificador único del usuario destinatario.
 * @param payload - Objeto con los metadatos y contenido textual estructurado para la notificación.
 * 
 * @returns Promesa que resuelve a `true` si la notificación se transmitió exitosamente a al menos un dispositivo; de lo contrario `false`.
 */
export async function sendNotificationToUser(
    userId: string,
    payload: NotificationPayload
): Promise<boolean> {
    try {
        const settingsSnap = await admin
            .database()
            .ref(`users/${userId}/settings/pushNotificationsEnabled`)
            .once("value");
        const userSettings = { pushNotificationsEnabled: settingsSnap.val() };
        if (userSettings.pushNotificationsEnabled === false) {
            return false;
        }

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

        const message = {
            notification: {
                title: payload.title,
                body: payload.body,
            },
            data: {
                type: payload.data.type || payload.type,
                postId: payload.data.postId || "",
                matchPostId: payload.data.matchPostId || "",
                matchTitle: payload.data.matchTitle || "",
                matchScore: payload.data.matchScore !== undefined ? payload.data.matchScore.toString() : "",
                matchPhotoUrl: payload.data.matchPhotoUrl || "",
                timestamp: payload.data.timestamp ? payload.data.timestamp.toString() : Date.now().toString(),
                chatId: payload.data.chatId || "",
                messageId: payload.data.messageId || "",
            },
        };

        // Enviar a todos los tokens concurrentemente manejando los errores individuales
        const sendPromises = tokens.map((token) =>
            admin
                .messaging()
                .send({
                    token,
                    ...message,
                })
                .catch((error) => {
                    console.error(`Error enviando notificación a token ${token}:`, error);
                    // Depurar tokens inactivos del almacenamiento de forma automática
                    if (
                        error.code === "messaging/invalid-registration-token" ||
                        error.code === "messaging/registration-token-not-registered"
                    ) {
                        return admin
                            .database()
                            .ref(`users/${userId}/fcm_tokens/${token}`)
                            .remove();
                    }
                    return null;
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
 * Prepara y envía una alerta localizada al propietario de un objeto cuando se encuentra un match semántico compatible.
 * 
 * Flujo de ejecución:
 * 1. Consulta la configuración de idioma del destinatario de manera defensiva bajo `/users/{userId}/settings/language`.
 * 2. Si el idioma no se encuentra configurado o no pertenece a los soportados, realiza fallback automático a español ("es").
 * 3. Obtiene el título y descripción localizados correspondientes al idioma resuelto desde el módulo `i18n`.
 * 4. Invoca la transmisión push llamando a `sendNotificationToUser`.
 * 
 * @param userId - Identificador único del usuario receptor.
 * @param matchPost - Propiedades básicas del objeto compatible recién indexado.
 * @param matchScore - Puntuación de similitud semántica calculada para el emparejamiento.
 * 
 * @returns Promesa que indica el éxito de la transmisión.
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
    let lang: SupportedLanguage = "es";
    try {
        const userSnap = await admin.database().ref(`users/${userId}`).once("value");
        if (userSnap.exists()) {
            const userVal = userSnap.val() || {};
            const settings = userVal.settings || {};
            const val = userVal.preferredLanguage || settings.preferredLanguage || userVal.language || settings.language;
            if (val === "ca" || val === "es" || val === "en") {
                lang = val;
            }
        }
    } catch (error) {
        console.error(`Error obteniendo idioma preferido del usuario ${userId}:`, error);
    }

    const payload: NotificationPayload = {
        type: NotificationType.MATCH_FOUND,
        title: getNotificationString("match_found_title", lang),
        body: getNotificationString("match_found_body", lang),
        data: {
            type: "match",
            postId: matchPost.id,
            matchPostId: matchPost.id,
            matchTitle: matchPost.title,
            matchScore,
            matchPhotoUrl: matchPost.photo_url,
            timestamp: Date.now(),
        },
    };

    try {
        await saveInAppNotification(userId, payload, lang);
    } catch (error) {
        console.error(`Error al guardar la notificación in-app para el usuario ${userId}:`, error);
    }

    return sendNotificationToUser(userId, payload);
}

/**
 * Despega y distribuye concurrentemente alertas de coincidencia a múltiples usuarios sugeridos.
 * 
 * @param userIds - Arreglo con los identificadores únicos de los usuarios a notificar.
 * @param matchPost - Datos del post compatible que activa la notificación de match.
 * @param matchScore - Puntuación calculada del emparejamiento.
 * 
 * @returns Promesa que resuelve a un desglose con la cantidad de notificaciones completadas y fallidas.
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

/**
 * Guarda una notificación in-app en la base de datos Realtime Database (RTDB) para la bandeja de alertas del cliente.
 * 
 * Escribe en `/users/{userId}/notifications/{pushId}` un objeto con la información de la notificación y su estado.
 * 
 * @param userId - Identificador del usuario destinatario.
 * @param payload - Contenido y datos de la notificación.
 * @param lang - Idioma de la notificación (es, en, ca).
 * 
 * @returns El identificador único generado para la notificación.
 */
export async function saveInAppNotification(
    userId: string,
    payload: NotificationPayload,
    lang: SupportedLanguage
): Promise<string> {
    try {
        const notifRef = admin.database().ref(`users/${userId}/notifications`).push();
        const pushId = notifRef.key;
        if (!pushId) {
            throw new Error("No se pudo generar un ID único para la notificación");
        }

        const notification = {
            id: pushId,
            type: payload.type,
            title: payload.title,
            body: payload.body,
            read: false,
            timestamp: payload.data.timestamp || Date.now(),
            data: payload.data,
        };

        await notifRef.set(notification);
        return pushId;
    } catch (error) {
        console.error(`Error al guardar la notificación in-app para el usuario ${userId}:`, error);
        throw error;
    }
}
