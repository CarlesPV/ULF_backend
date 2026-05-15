import { onValueUpdated } from "firebase-functions/v2/database";
import { db } from "../shared/firebase";

/**
 * TRIGGER: Al actualizar un perfil de usuario:
 * Sincroniza el nombre y la foto en todos los chats activos del usuario para mantener la denormalización.
 */
export const onUserProfileUpdated = onValueUpdated("/users/{userId}", async (event) => {
    const userId = event.params.userId;
    const before = event.data.before.val();
    const after = event.data.after.val();

    if (!after) return; // Borrado de usuario, no sincronizar aquí

    const nameChanged = before?.name !== after?.name;
    const photoChanged = before?.photoUrl !== after?.photoUrl;

    if (!nameChanged && !photoChanged) return;

    try {
        // 1. Obtener los IDs de los chats del usuario desde el índice user_chats
        const userChatsSnap = await db.ref(`user_chats/${userId}`).once("value");
        if (!userChatsSnap.exists()) return;

        const chatIds = Object.keys(userChatsSnap.val());
        const updates: { [key: string]: any } = {};

        // 2. Preparar actualización atómica
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
            console.log(`[Sync] Perfil de ${userId} actualizado en ${chatIds.length} chats.`);
        }
    } catch (error) {
        console.error(`Error sincronizando perfil del usuario ${userId}:`, error);
    }
});
