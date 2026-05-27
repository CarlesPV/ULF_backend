import { onObjectFinalized } from "firebase-functions/v2/storage";
import { admin } from "../shared/firebase";
import * as crypto from "crypto";
import * as sharp from "sharp";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";

/**
 * Trigger de Firebase Storage v2 que se activa automáticamente al completarse la subida de un archivo (onObjectFinalized)
 * en la ruta `users/{userId}/profile_image`.
 *
 * Propósito y flujo de sincronización:
 * 1. Escucha las subidas o actualizaciones en `users/{userId}/profile_image`.
 * 2. Valida si la imagen ya ha sido optimizada para evitar bucles de ejecución.
 * 3. Descarga la imagen y utiliza `sharp` para redimensionarla (máx 500x500px) y convertirla a WebP.
 * 4. Sobrescribe la imagen original por la versión optimizada WebP.
 * 5. Genera o extrae un token de descarga persistente para Firebase Storage.
 * 6. Actualiza atómicamente el nodo del usuario en Realtime Database `/users/{userId}` con la URL generada y el timestamp.
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

    // Evitar bucles infinitos si la imagen ya fue procesada
    const metadata = event.data.metadata || {};
    if (metadata.optimized === "true" || event.data.contentType === "image/webp") {
        return null;
    }

    const bucket = admin.storage().bucket(bucketName);
    const file = bucket.file(filePath);
    const tempFilePath = path.join(os.tmpdir(), `raw_profile_${userId}_${Date.now()}`);
    const optimizedFilePath = path.join(os.tmpdir(), `opt_profile_${userId}_${Date.now()}.webp`);

    try {
        await file.download({ destination: tempFilePath });

        // Redimensionar a max 500x500px y convertir a WebP
        await sharp(tempFilePath)
            .resize(500, 500, { fit: "inside", withoutEnlargement: true })
            .toFormat("webp")
            .toFile(optimizedFilePath);

        // Generar un token único y persistente si no existe en los metadatos
        let downloadToken = metadata.firebaseStorageDownloadTokens;
        if (!downloadToken) {
            downloadToken = crypto.randomUUID();
        }

        // Sobrescribir el archivo original con la versión optimizada
        await bucket.upload(optimizedFilePath, {
            destination: filePath,
            metadata: {
                contentType: "image/webp",
                cacheControl: "public, max-age=31536000, s-maxage=31536000",
                metadata: {
                    optimized: "true",
                    firebaseStorageDownloadTokens: downloadToken
                }
            }
        });

        // Generar la URL de descarga pública y persistente con cache-busting
        const timestamp = Date.now();
        const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(filePath)}?alt=media&token=${downloadToken}&v=${timestamp}`;

        // Actualización atómica en Realtime Database
        await admin.database().ref(`users/${userId}`).update({
            photoUrl: publicUrl,
            photoUpdatedAt: admin.database.ServerValue.TIMESTAMP,
            updated_at: admin.database.ServerValue.TIMESTAMP
        });

        console.log(`[onProfileImageUploaded] URL de perfil sincronizada con éxito para el usuario ${userId}: ${publicUrl}`);
    } catch (error) {
        console.error(`[onProfileImageUploaded] Error al procesar la imagen de perfil para el usuario ${userId}:`, error);
    } finally {
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
        if (fs.existsSync(optimizedFilePath)) fs.unlinkSync(optimizedFilePath);
    }

    return null;
});
