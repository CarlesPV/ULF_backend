import { onValueDeleted } from "firebase-functions/v2/database";
import { deleteFileFromStorageUrl } from "../shared/utils";

/**
 * Trigger de Realtime Database v2 que se activa automáticamente al eliminarse físicamente un mensaje en `/messages/{chatId}/{messageId}`.
 * 
 * Propósito:
 * Si el mensaje eliminado es de tipo "image" y posee una URL de Storage (`imageUrl`), elimina el archivo del Storage
 * de manera asíncrona y segura para evitar imágenes huérfanas en el sistema.
 */
export const onMessageDeleted = onValueDeleted("/messages/{chatId}/{messageId}", async (event: any) => {
    const before = event.data.val();
    if (!before) return null;

    if (before.type === "image" && before.imageUrl) {
        try {
            await deleteFileFromStorageUrl(before.imageUrl);
            console.log(`[Message Delete] Imagen de mensaje eliminada para chat ${event.params.chatId}, mensaje ${event.params.messageId}`);
        } catch (error) {
            console.error(`[Message Delete] Error eliminando imagen de Storage del mensaje ${event.params.messageId}:`, error);
        }
    }

    return null;
});
