import { onValueCreated } from "firebase-functions/v2/database";
import { admin } from "../shared/firebase";
import { getNotificationString } from "../shared/i18n";
import { SupportedLanguage } from "../shared/types";

/**
 * Trigger de Realtime Database que se ejecuta al crearse un nuevo mensaje en la ruta `/messages/{chatId}/{messageId}`.
 * 
 * Este trigger realiza las siguientes acciones de forma atómica y asíncrona:
 * 1. Valida que el mensaje contenga el texto y el timestamp correspondientes.
 * 2. Trunca el texto del mensaje a un máximo de 40 caracteres para almacenarlo como vista previa en el chat padre.
 * 3. Actualiza de manera atómica (`update` en RTDB):
 *    - El nodo del chat padre (`/chats/{chatId}`) con el texto abreviado y la hora del último mensaje.
 *    - El índice de chats de cada miembro (`/user_chats/{memberId}/{chatId}`) para ordenar la bandeja de entrada en tiempo real.
 * 4. Envía notificaciones push de forma asíncrona a todos los miembros del chat, excluyendo al remitente del mensaje:
 *    - Recupera las preferencias del usuario (`settings`) para validar si tiene habilitadas las notificaciones push.
 *    - Identifica el idioma preferido del destinatario para resolver el título localizado ("new_message_title") a través de `getNotificationString`.
 *    - Envía la notificación en segundo plano a todos los tokens FCM registrados (`/users/{memberId}/fcm_tokens`).
 *    - Realiza una limpieza automática eliminando tokens de registro inválidos (`messaging/invalid-registration-token`).
 * 
 * @param event - Evento disparado por Realtime Database al crear un nodo bajo `/messages/{chatId}/{messageId}`.
 */
export const onMessageCreated = onValueCreated("/messages/{chatId}/{messageId}", async (event: any) => {
    const snapshot = event.data;
    const message = snapshot.val();

    // Validar la integridad del mensaje y sus campos obligatorios
    if (!message || message.timestamp === undefined) {
        return null;
    }

    const isImage = message.messageType === "image";
    if (!isImage && !message.text) {
        return null;
    }
    if (isImage && !message.imageUrl) {
        return null;
    }

    const { chatId } = event.params;
    const senderId = message.sender_id;

    // Truncar la vista previa del mensaje para no sobrecargar el nodo principal del chat
    let lastMessage = "";
    if (isImage) {
        lastMessage = "📷 Imagen";
    } else {
        lastMessage = message.text || "";
        if (lastMessage.length > 40) {
            lastMessage = lastMessage.substring(0, 40) + "...";
        }
    }

    try {
        // Recuperar los miembros actuales del chat
        const chatSnap = await admin.database().ref(`chats/${chatId}/members`).once("value");
        if (!chatSnap.exists()) {
            return null;
        }

        const members = chatSnap.val();
        const memberIds = Object.keys(members);

        // Preparar la actualización atómica múltiple en Realtime Database
        const updates: any = {};
        
        // Actualizar el nodo principal del chat con la información del último mensaje enviado
        updates[`chats/${chatId}/last_message`] = lastMessage;
        updates[`chats/${chatId}/last_message_time`] = message.timestamp;

        // Actualizar el índice temporal de chats de cada usuario para ordenar sus bandejas de entrada en tiempo real
        for (const memberId of memberIds) {
            updates[`user_chats/${memberId}/${chatId}`] = message.timestamp;
        }

        // Ejecutar las actualizaciones de forma atómica para conservar la consistencia de datos
        await admin.database().ref().update(updates);

        // Enviar notificaciones push asíncronas a los participantes (excluyendo al emisor del mensaje)
        try {
            const notificationPromises = memberIds
                .filter(memberId => memberId !== senderId)
                .map(async (memberId) => {
                    try {
                        // Obtener los ajustes de notificación e idioma de preferencia del destinatario
                        const userSettingsSnap = await admin.database()
                            .ref(`users/${memberId}/settings`)
                            .once("value");
                        const settings = userSettingsSnap.val() || {};

                        if (settings.push_notifications !== true) {
                            return;
                        }

                        // Internacionalización (i18n): Obtener la cadena en el idioma correspondiente (es, ca, en)
                        const userLang: SupportedLanguage = settings.language || "en";
                        const notificationTitle = getNotificationString("new_message_title", userLang);

                        // Consultar los tokens de Firebase Cloud Messaging (FCM) registrados por el usuario
                        const fcmTokensSnap = await admin.database()
                            .ref(`users/${memberId}/fcm_tokens`)
                            .once("value");

                        if (!fcmTokensSnap.exists()) {
                            return;
                        }

                        const fcmTokens = Object.keys(fcmTokensSnap.val());

                        // Transmitir la notificación a todos los dispositivos del usuario de forma concurrente
                        return Promise.all(
                            fcmTokens.map((token) =>
                                admin.messaging().send({
                                    token: token,
                                    notification: {
                                        title: notificationTitle,
                                        body: isImage 
                                            ? getNotificationString("new_image_body", userLang)
                                            : message.text.substring(0, 100) // Limitar la vista en la barra de notificaciones
                                    },
                                    data: {
                                        chatId: chatId,
                                        messageId: event.params.messageId
                                    }
                                }).catch((error) => {
                                    console.warn(`Error enviando notificación al token ${token}:`, error);
                                    // Limpieza de tokens obsoletos o inválidos para liberar almacenamiento
                                    if (error.code === "messaging/invalid-registration-token") {
                                        return admin.database()
                                            .ref(`users/${memberId}/fcm_tokens/${token}`)
                                            .remove();
                                    }
                                    return null;
                                })
                            )
                        );
                    } catch (memberError) {
                        console.error(`Error procesando notificaciones para usuario ${memberId}:`, memberError);
                        return null;
                    }
                });

            // Resolver todas las promesas de envío sin interrumpir la ejecución del trigger
            await Promise.all(notificationPromises).catch((error) => {
                console.error("Error en el envío masivo de notificaciones:", error);
            });
        } catch (notificationError) {
            console.error(`Error en el subsistema de notificaciones del chat ${chatId}:`, notificationError);
        }

        return null;
    } catch (error) {
        console.error(`Error al actualizar el chat ${chatId}:`, error);
        return null;
    }
});