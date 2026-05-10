import { onValueCreated } from "firebase-functions/v2/database";
import { admin } from "../shared/firebase";

/*
    TRIGGER: Al crear un mensaje:
      - Actualiza el nodo padre del chat (/chats/{chatId}) con el último mensaje y su timestamp.
      - Actualiza el nodo índice del usuario (/user_chats/{uid}/{chatId}) con el timestamp para reflejar cambios en tiempo real.
      - Envía notificaciones push a todos los miembros del chat (excepto el remitente)
        que tengan push_notifications habilitado en su perfil.
    Esto permite ordenar la bandeja de entrada sin descargar la colección completa de mensajes.
*/
export const onMessageCreated = onValueCreated("/messages/{chatId}/{messageId}", async (event: any) => {
    const snapshot = event.data;
    const message = snapshot.val();

    // Validar que exista el mensaje y tenga los campos requeridos
    if (!message?.text || message.timestamp === undefined) {
        return null;
    }

    const { chatId } = event.params;
    const senderId = message.sender_id;

    // Truncar el mensaje a 40 caracteres si es necesario
    let lastMessage = message.text;
    if (lastMessage.length > 40) {
        lastMessage = lastMessage.substring(0, 40) + "...";
    }

    try {
        // 1. Obtener los miembros del chat
        const chatSnap = await admin.database().ref(`chats/${chatId}/members`).once("value");
        if (!chatSnap.exists()) {
            return null; // No hay miembros registrados
        }

        const members = chatSnap.val(); // { uid: true, ... }
        const memberIds = Object.keys(members);

        // 2. Preparar actualización atómica múltiple (Mejora de rendimiento y tiempo real)
        const updates: any = {};
        
        // A) Actualizar el chat padre
        updates[`chats/${chatId}/last_message`] = lastMessage;
        updates[`chats/${chatId}/last_message_time`] = message.timestamp;

        // B) Actualizar el índice de la bandeja de cada miembro para el tiempo real del Frontend
        for (const memberId of memberIds) {
            updates[`user_chats/${memberId}/${chatId}`] = message.timestamp;
        }

        // Ejecutar todas las actualizaciones a la vez
        await admin.database().ref().update(updates);

        // 3. Enviar notificaciones push a los miembros del chat
        try {
            // Para cada miembro (excepto el remitente), enviar notificación si lo tiene habilitado
            const notificationPromises = memberIds
                .filter(memberId => memberId !== senderId) // Excluir al remitente
                .map(async (memberId) => {
                    try {
                        // Verificar si el usuario tiene push_notifications habilitado
                        const userSettingsSnap = await admin.database()
                            .ref(`users/${memberId}/settings/push_notifications`)
                            .once("value");

                        if (userSettingsSnap.val() !== true) {
                            return; // Usuario no tiene notificaciones habilitadas
                        }

                        // Obtener todos los tokens FCM del usuario
                        const fcmTokensSnap = await admin.database()
                            .ref(`users/${memberId}/fcm_tokens`)
                            .once("value");

                        if (!fcmTokensSnap.exists()) {
                            return; // Usuario no tiene tokens registrados
                        }

                        const fcmTokens = Object.keys(fcmTokensSnap.val());

                        // Enviar notificación a cada token
                        return Promise.all(
                            fcmTokens.map((token) =>
                                admin.messaging().send({
                                    token: token,
                                    notification: {
                                        title: "Nuevo mensaje",
                                        body: message.text.substring(0, 100) // Limitar a 100 caracteres para notificación
                                    },
                                    data: {
                                        chatId: chatId,
                                        messageId: event.params.messageId
                                    }
                                }).catch((error) => {
                                    console.warn(`Error enviando notificación al token ${token}:`, error);
                                    // Opcionalmente, eliminar tokens inválidos
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
                        // No interrumpir el flujo principal si falla para un miembro
                        return null;
                    }
                });

            // Esperar a que todas las notificaciones se envíen (sin bloquear el resultado)
            await Promise.all(notificationPromises).catch((error) => {
                console.error("Error en el envío de notificaciones:", error);
            });
        } catch (notificationError) {
            console.error(`Error en el sistema de notificaciones para chat ${chatId}:`, notificationError);
            // No interrumpir el flujo si falla el sistema de notificaciones
        }

        return null;
    } catch (error) {
        console.error(`Error updating chat ${chatId}:`, error);
        return null;
    }
});