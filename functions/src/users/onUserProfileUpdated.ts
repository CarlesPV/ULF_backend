import { onValueUpdated } from "firebase-functions/v2/database";
import { db } from "../shared/firebase";
import { deleteFileFromStorageUrl } from "../shared/utils";

/**
 * Trigger de Realtime Database v2 que se activa automáticamente al modificarse el perfil de un usuario en `/users/{userId}`.
 * 
 * Propósito y flujo de sincronización denormalizada y limpieza de Storage:
 * 1. Limpieza de Storage: Si se elimina físicamente el usuario, si se marca como soft-delete o si cambia su foto de perfil,
 *    se elimina la imagen anterior/eliminada del almacenamiento para evitar archivos huérfanos.
 * 2. Compara de forma defensiva los datos anteriores y posteriores para detectar si el nombre (`name`) o la foto de perfil (`photoUrl`) han cambiado.
 * 3. Si no hay alteraciones en ninguno de estos dos atributos críticos, aborta el flujo inmediatamente para ahorrar recursos.
 * 4. Consulta la ruta `/user_chats/{userId}` para recopilar las claves de todas las sesiones de chat activas en las que participa el usuario.
 * 5. Propagación Atómica Multirruta: Prepara un único bloque de escritura en base de datos (`db.ref().update`) que actualiza 
 *    la información de perfil desnormalizada (`usersInfo`) en cada chat, garantizando la consistencia visual e inmediata de la bandeja de entrada del Frontend.
 * 
 * @param event - Evento disparado por la actualización del perfil del usuario.
 */
export const onUserProfileUpdated = onValueUpdated("/users/{userId}", async (event) => {
    const userId = event.params.userId;
    const before = event.data.before.val();
    const after = event.data.after.val();

    // Caso A: Si el usuario es eliminado físicamente de la base de datos, borrar su foto de perfil
    if (!after) {
        if (before?.photoUrl) {
            await deleteFileFromStorageUrl(before.photoUrl);
        }
        return;
    }

    const nameChanged = before?.name !== after?.name;
    const beforePhoto = before?.photoUrl;
    const afterPhoto = after?.photoUrl;
    const photoChanged = beforePhoto !== afterPhoto;

    const tasks: Promise<any>[] = [];

    // Caso B: Si cambió la foto de perfil, borrar la anterior para no dejarla huérfana
    if (photoChanged && beforePhoto) {
        tasks.push(deleteFileFromStorageUrl(beforePhoto));
    }

    // Caso C: Si el usuario es marcado como eliminado (soft delete), borrar su foto actual de perfil de Storage
    if (after.is_deleted === true && before.is_deleted === false && afterPhoto) {
        tasks.push(deleteFileFromStorageUrl(afterPhoto));
    }

    if (!nameChanged && !photoChanged) {
        if (tasks.length > 0) {
            await Promise.all(tasks);
        }
        return;
    }

    try {
        // Consultar los chats activos del usuario indexados en user_chats
        const userChatsSnap = await db.ref(`user_chats/${userId}`).once("value");
        if (userChatsSnap.exists()) {
            const chatIds = Object.keys(userChatsSnap.val());
            const updates: { [key: string]: any } = {};

            // Organizar la propagación de metadatos desnormalizados
            chatIds.forEach((chatId) => {
                if (nameChanged) {
                    updates[`chats/${chatId}/usersInfo/${userId}/displayName`] = after.name || "Usuario";
                }
                if (photoChanged) {
                    updates[`chats/${chatId}/usersInfo/${userId}/photoUrl`] = afterPhoto || null;
                }
            });

            if (Object.keys(updates).length > 0) {
                await db.ref().update(updates);
                console.log(`[Consistencia Sincronizada] Perfil de ${userId} actualizado en ${chatIds.length} chats.`);
            }
        }
    } catch (error) {
        console.error(`Error sincronizando perfil del usuario ${userId}:`, error);
    }

    if (tasks.length > 0) {
        await Promise.all(tasks);
    }
});
