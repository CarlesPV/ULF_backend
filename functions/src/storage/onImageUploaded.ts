import { onObjectFinalized } from "firebase-functions/v2/storage";
import { admin } from "../shared/firebase";
import { DEFAULT_LANGUAGE, translateLabels } from "../shared/translate";
import { visionClient } from "../shared/vision";
import * as sharp from "sharp";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import * as crypto from "crypto";

/**
 * Trigger de Firebase Storage v2 que se activa automáticamente al completarse la subida de un archivo (onObjectFinalized).
 * 
 * Implementa el flujo de trabajo optimizado para publicaciones (`posts/`):
 * Optimiza la resolución (máx 1080px de ancho), la convierte a formato WebP,
 * genera una versión miniatura (thumbnail) de 200x200px en WebP,
 * y ejecuta Google Cloud Vision API para extraer etiquetas semánticas.
 * Finalmente, actualiza el post en la base de datos con las URLs y etiquetas.
 * 
 * @param event - Evento disparado por Firebase Storage al persistir un nuevo archivo.
 */
export const onImageUploaded = onObjectFinalized(async (event) => {
    const filePath = event.data.name; 
    const metadata = (event.data.metadata || {}) as any;

    // Evitar bucles infinitos si la imagen ya fue procesada por el backend
    if (metadata.processed === "true" || metadata.optimized === "true") {
        return null;
    }

    // Filtrar imágenes de publicaciones (procesar nuevas subidas y actualizaciones)
    if (filePath.startsWith("posts/")) {
        // Evitar procesar thumbnails como imágenes principales de posts
        const fileName = filePath.split("/").pop() || "";
        if (!fileName.startsWith("thumb_")) {
            return handlePostImage(event);
        }
    }

    return null;
});

/**
 * Optimiza la imagen de un objeto reportado, genera un thumbnail y extrae sus propiedades visuales por visión por computadora.
 * 
 * Acciones y optimizaciones técnicas:
 * 1. Descarga la imagen original.
 * 2. Comprime a WebP bajo una resolución máxima de 1080x1080 píxeles.
 * 3. Crea un thumbnail de 200x200px en formato WebP.
 * 4. Sube la imagen optimizada (sobrescribiendo la original) y el thumbnail, ambos con Cache-Control agresivo de 1 año.
 * 5. Ejecuta detección de etiquetas visuales con Google Cloud Vision API sobre el archivo original.
 * 6. Traduce las etiquetas al idioma de referencia.
 * 7. Actualiza el post en Realtime Database con postImageUrl, postThumbnailUrl y vision_labels.
 * 8. Elimina de forma limpia los archivos temporales locales creados.
 * 
 * @param event - Metadatos del objeto subido a Storage.
 */
async function handlePostImage(event: any) {
    const filePath = event.data.name;
    const bucketName = event.data.bucket;
    const pathParts = filePath.split("/");

    if (pathParts.length < 3) return null;
    const postId = pathParts[1];
    const fileName = pathParts[pathParts.length - 1];

    const bucket = admin.storage().bucket(bucketName);
    const tempFilePath = path.join(os.tmpdir(), `raw_${postId}_${Date.now()}`);
    const optimizedFilePath = path.join(os.tmpdir(), `opt_${postId}_${Date.now()}.webp`);
    const thumbnailFilePath = path.join(os.tmpdir(), `thumb_${postId}_${Date.now()}.webp`);

    try {
        await bucket.file(filePath).download({ destination: tempFilePath });

        // 1. Optimizar imagen principal: máx 1080px de ancho y formato WebP
        await sharp(tempFilePath)
            .resize(1080, undefined, { fit: "inside", withoutEnlargement: true })
            .toFormat("webp")
            .toFile(optimizedFilePath);

        // 2. Crear miniatura (thumbnail): 200x200px en formato WebP
        await sharp(tempFilePath)
            .resize(200, 200, { fit: "cover" })
            .toFormat("webp")
            .toFile(thumbnailFilePath);

        // Generar o reutilizar el token de descarga de la imagen principal
        let mainToken = event.data.metadata?.firebaseStorageDownloadTokens;
        if (!mainToken) {
            mainToken = crypto.randomUUID();
        }
        const thumbToken = crypto.randomUUID();

        // 3. Subir imagen principal optimizada
        await bucket.upload(optimizedFilePath, {
            destination: filePath,
            metadata: {
                contentType: "image/webp",
                cacheControl: "public, max-age=31536000, s-maxage=31536000",
                metadata: {
                    optimized: "true",
                    firebaseStorageDownloadTokens: mainToken
                }
            }
        });

        // 4. Subir thumbnail optimizado
        const thumbDestination = `posts/${postId}/thumb_${fileName}`;
        await bucket.upload(thumbnailFilePath, {
            destination: thumbDestination,
            metadata: {
                contentType: "image/webp",
                cacheControl: "public, max-age=31536000, s-maxage=31536000",
                metadata: {
                    optimized: "true",
                    firebaseStorageDownloadTokens: thumbToken
                }
            }
        });

        const mainUrl = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(filePath)}?alt=media&token=${mainToken}`;
        const thumbUrl = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(thumbDestination)}?alt=media&token=${thumbToken}`;

        let translatedLabels: string[] = [];
        try {
            // Analizar la imagen para detectar sus características visuales (Vision API)
            const imageRequest = {
                image: { content: fs.readFileSync(tempFilePath) }
            };

            let labels = [];
            if (process.env.FUNCTIONS_EMULATOR === "true") {
                labels = [{ description: "mock label" }];
            } else {
                const visionResponse = await visionClient.labelDetection(imageRequest);
                labels = visionResponse[0]?.labelAnnotations || [];
            }

            if (labels.length > 0) {
                const labelDescriptions = labels
                    .map((label: any) => label.description)
                    .filter((desc: any) => desc && typeof desc === "string");
                
                const translationText = labelDescriptions.join(", ");
                translatedLabels = await translateLabels(translationText, DEFAULT_LANGUAGE);
            }
        } catch (visionError) {
            console.error(`Error en Vision API o traducción para post ${postId}:`, visionError);
        }

        // Hacer un update parcial en RTDB
        await admin.database().ref("posts/" + postId).update({
            postImageUrl: mainUrl,
            postThumbnailUrl: thumbUrl,
            vision_labels: translatedLabels,
            updated_at: admin.database.ServerValue.TIMESTAMP
        });

        console.log(`Etiquetas de Vision extraídas y actualizadas para el post ${postId}`);
    } catch (error) {
        console.error(`Error procesando imagen de post (${filePath}):`, error);
    } finally {
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
        if (fs.existsSync(optimizedFilePath)) fs.unlinkSync(optimizedFilePath);
        if (fs.existsSync(thumbnailFilePath)) fs.unlinkSync(thumbnailFilePath);
    }
    return null;
}
