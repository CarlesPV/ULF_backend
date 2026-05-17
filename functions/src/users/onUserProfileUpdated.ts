import { onValueUpdated } from "firebase-functions/v2/database";
import { db } from "../shared/firebase";

/**
 * Trigger de Realtime Database v2 que se activa automáticamente al modificarse el perfil de un usuario en `/users/{userId}`.
 * 
 * Propósito y flujo de sincronización denormalizada:
 * 1. Compara de forma defensiva los datos anteriores y posteriores para detectar si el nombre (`name`) o la foto de perfil (`photoUrl`) han cambiado.
 * 2. Si no hay alteraciones en ninguno de estos dos atributos críticos, aborta el flujo inmediatamente para ahorrar recursos.
 * 3. Consulta la ruta `/user_chats/{userId}` para recopilar las claves de todas las sesiones de chat activas en las que participa el usuario.
 * 4. Propagación Atómica Multirruta: Prepara un único bloque de escritura en base de datos (`db.ref().update`) que actualiza 
 *    la información de perfil desnormalizada (`usersInfo`) en cada chat, garantizando la consistencia visual e inmediata de la bandeja de entrada del Frontend.
 * 
 * @param event - Evento disparado por la actualización del perfil del usuario.
 */
export const onUserProfileUpdated = onValueUpdated("/users/{userId}", async (event) => {
    const userId = event.params.userId;
    const before = event.data.before.val();
    const after = event.data.after.val();

    if (!after) return; // Evitar procesamiento en caso de borrado de usuario

    const nameChanged = before?.name !== after?.name;
    const photoChanged = before?.photoUrl !== after?.photoUrl;

    if (!nameChanged && !photoChanged) return;

    try {
        // Consultar los chats activos del usuario indexados en user_chats
        const userChatsSnap = await db.ref(`user_chats/${userId}`).once("value");
        if (!userChatsSnap.exists()) return;

        const chatIds = Object.keys(userChatsSnap.val());
        const updates: { [key: string]: any } = {};

        // Organizar la propagación de metadatos desnormalizados
        chatIds.forEach((chatId) => {
            if (nameChanged) {
                updates[`chats/${chatId}/usersInfo/${userId}/displayName`] = after.name || "Usuario";
            }
            if (photoChanged) {
                updates[`chats/${chatId}/usersInfo/${userId}/photoUrl`] = after.photoUrl || null;
            }
        });

        if (Object.keys(updates).length > 0) {
            await db.ref().update(updates);
            console.log(`[Consistencia Sincronizada] Perfil de ${userId} actualizado en ${chatIds.length} chats.`);
        }
    } catch (error) {
        console.error(`Error sincronizando perfil del usuario ${userId}:`, error);
    }
});
