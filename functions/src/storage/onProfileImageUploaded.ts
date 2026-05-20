import { onObjectFinalized } from "firebase-functions/v2/storage";
import { admin } from "../shared/firebase";
import * as crypto from "crypto";

/**
 * Trigger de Firebase Storage v2 que se activa automáticamente al completarse la subida de un archivo (onObjectFinalized)
 * en la ruta `users/{userId}/profile_image`.
 *
 * Propósito y flujo de sincronización:
 * 1. Escucha las subidas o actualizaciones en `users/{userId}/profile_image`.
 * 2. Genera o extrae un token de descarga persistente para Firebase Storage.
 * 3. Actualiza atómicamente el nodo del usuario en Realtime Database `/users/{userId}` con la URL generada y el timestamp.
 *
 * @param event - Evento de Firebase Storage
 */
export const onProfileImageUploaded = onObjectFinalized(async (event) => {
    const filePath = event.data.name;

    // Verificar que el archivo está en la ruta users/{userId}/profile_image
    const pathParts = filePath.split("/");
    if (pathParts.length !== 3 || pathParts[0] !== "users" || pathParts[2] !== "profile_image") {
        return null;
    }

    const userId = pathParts[1];
    const bucketName = event.data.bucket;

    try {
        const bucket = admin.storage().bucket(bucketName);
        const file = bucket.file(filePath);

        // Generar un token único y persistente si no existe en los metadatos
        let downloadToken = event.data.metadata?.firebaseStorageDownloadTokens;
        if (!downloadToken) {
            downloadToken = crypto.randomUUID();
            await file.setMetadata({
                metadata: {
                    firebaseStorageDownloadTokens: downloadToken
                }
            });
        }

        // Generar la URL de descarga pública y persistente
        const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(filePath)}?alt=media&token=${downloadToken}`;

        // Actualización atómica en Realtime Database
        await admin.database().ref(`users/${userId}`).update({
            photoUrl: publicUrl,
            updated_at: admin.database.ServerValue.TIMESTAMP
        });

        console.log(`[onProfileImageUploaded] URL de perfil sincronizada con éxito para el usuario ${userId}: ${publicUrl}`);
    } catch (error) {
        console.error(`[onProfileImageUploaded] Error al procesar la imagen de perfil para el usuario ${userId}:`, error);
    }

    return null;
});
