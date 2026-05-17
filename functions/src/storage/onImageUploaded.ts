import { onObjectFinalized } from "firebase-functions/v2/storage";
import { admin } from "../shared/firebase";
import { DEFAULT_LANGUAGE, translateLabels } from "../shared/translate";
import { visionClient } from "../shared/vision";
import * as sharp from "sharp";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";

/**
 * Trigger de Firebase Storage v2 que se activa automáticamente al completarse la subida de un archivo (onObjectFinalized).
 * 
 * Implementa dos flujos de trabajo optimizados según la ubicación del archivo:
 * 1. Publicaciones (`posts/`): Optimiza la resolución, la convierte a formato WebP y ejecuta Google Cloud Vision API 
 *    para extraer etiquetas semánticas y actualizar el post en la base de datos.
 * 2. Perfiles de usuario (`users/`): Reescala la imagen del avatar del usuario a un tamaño estándar (512x512), 
 *    la convierte a WebP para minimizar el consumo de datos y actualiza de forma sincronizada el enlace del usuario.
 * 
 * @param event - Evento disparado por Firebase Storage al persistir un nuevo archivo.
 */
export const onImageUploaded = onObjectFinalized(async (event) => {
    const filePath = event.data.name; 

    // Filtrar imágenes de publicaciones que no han sido convertidas aún
    if (filePath.startsWith("posts/") && event.data.contentType !== "image/webp") {
        return handlePostImage(event);
    }

    // Filtrar fotos de perfil en formato original
    if (filePath.startsWith("users/") && filePath.endsWith("/profile_image") && event.data.contentType !== "image/webp") {
        return handleProfileImage(event);
    }

    return null;
});

/**
 * Procesa, redimensiona y optimiza la imagen de avatar para un usuario.
 * 
 * Acciones y optimizaciones técnicas:
 * 1. Descarga la imagen original en bruto a un directorio de trabajo temporal (`os.tmpdir`).
 * 2. Usa la librería `sharp` para reescalar la imagen dentro de una caja de 512x512 píxeles sin deformarla.
 * 3. La comprime a formato WebP reduciendo sustancialmente el ancho de banda necesario para el renderizado móvil.
 * 4. Sube la imagen optimizada a `users/{userId}/profile_image.webp` asignándole una política de caché pública de 1 hora
 *    (`public, max-age=3600, s-maxage=3600`) para mitigar peticiones duplicadas e innecesarias al servidor.
 * 5. Registra la URL persistente generada en la base de datos en `/users/{userId}/photoUrl`.
 * 6. Elimina de forma limpia todos los archivos temporales locales creados en el proceso.
 * 
 * @param event - Metadatos del objeto subido a Storage.
 */
async function handleProfileImage(event: any) {
    const filePath = event.data.name;
    const bucketName = event.data.bucket;
    const userId = filePath.split("/")[1];
    
    const bucket = admin.storage().bucket(bucketName);
    const tempFilePath = path.join(os.tmpdir(), `raw_${userId}_${Date.now()}`);
    const optimizedFilePath = path.join(os.tmpdir(), `optimized_${userId}_${Date.now()}.webp`);

    try {
        await bucket.file(filePath).download({ destination: tempFilePath });

        await sharp(tempFilePath)
            .resize(512, 512, { fit: "inside", withoutEnlargement: true })
            .toFormat("webp")
            .toFile(optimizedFilePath);

        const destination = `users/${userId}/profile_image.webp`;
        await bucket.upload(optimizedFilePath, {
            destination,
            metadata: { 
                contentType: "image/webp",
                cacheControl: "public, max-age=3600, s-maxage=3600"
            }
        });

        // Crear una URL pública en formato Firebase Storage estándar compatible con el cliente
        const timestamp = Date.now();
        const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(destination)}?alt=media&t=${timestamp}`;

        await admin.database().ref(`users/${userId}`).update({
            photoUrl: publicUrl,
            photoUpdatedAt: timestamp
        });

        // Borrar la foto original en bruto para liberar espacio en disco
        await bucket.file(filePath).delete();
        console.log(`Foto de perfil optimizada para ${userId}: ${publicUrl}`);
    } catch (error) {
        console.error("Error procesando foto de perfil:", error);
    } finally {
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
        if (fs.existsSync(optimizedFilePath)) fs.unlinkSync(optimizedFilePath);
    }
}

/**
 * Optimiza la imagen de un objeto reportado y extrae sus propiedades visuales por visión por computadora.
 * 
 * Acciones y optimizaciones técnicas:
 * 1. Descarga la imagen original y la comprime a WebP bajo una resolución máxima de 1080x1080 píxeles.
 * 2. Asigna una política de almacenamiento en caché agresiva de 1 hora (`public, max-age=3600`).
 * 3. Ejecuta detección de etiquetas visuales enviando el buffer de bytes optimizado directamente a Google Cloud Vision API.
 * 4. Traduce automáticamente las etiquetas encontradas al idioma de referencia (`DEFAULT_LANGUAGE`)
 *    para soportar búsquedas e indexaciones consistentes.
 * 5. Registra el enlace de la imagen (`postImageUrl`) y las etiquetas identificadas (`vision_labels`)
 *    en la publicación de Realtime Database.
 * 6. Limpia la base de almacenamiento eliminando el archivo fuente original en bruto.
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

    try {
        await bucket.file(filePath).download({ destination: tempFilePath });

        await sharp(tempFilePath)
            .resize(1080, 1080, { fit: "inside", withoutEnlargement: true })
            .toFormat("webp")
            .toFile(optimizedFilePath);

        const destination = `posts/${postId}/${fileName}.webp`;
        await bucket.upload(optimizedFilePath, {
            destination,
            metadata: {
                contentType: "image/webp",
                cacheControl: "public, max-age=3600, s-maxage=3600"
            }
        });

        const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(destination)}?alt=media`;

        // Analizar la imagen convertida para detectar sus características visuales y clasificar el objeto
        const imageRequest = {
            image: { content: fs.readFileSync(optimizedFilePath) }
        };

        const visionResponse = await visionClient.labelDetection(imageRequest);
        const labels = visionResponse[0]?.labelAnnotations || [];
        let translatedLabels: string[] = [];

        if (labels.length > 0) {
            const labelDescriptions = labels
                .map((label: any) => label.description)
                .filter((desc: any) => desc && typeof desc === "string");
            
            const translationText = labelDescriptions.join(", ");
            translatedLabels = await translateLabels(translationText, DEFAULT_LANGUAGE);
        }

        // Persistir en la base de datos sincronizando los campos estandarizados del post
        await admin.database().ref(`posts/${postId}`).update({
            postImageUrl: publicUrl,
            imageUrl: publicUrl,
            vision_labels: translatedLabels
        });

        await bucket.file(filePath).delete();
        console.log(`Imagen de post optimizada y analizada para ${postId}: ${publicUrl}`);

    } catch (error) {
        console.error(`Error procesando imagen de post (${filePath}):`, error);
    } finally {
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
        if (fs.existsSync(optimizedFilePath)) fs.unlinkSync(optimizedFilePath);
    }
    return null;
}
