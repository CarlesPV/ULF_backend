import { onObjectFinalized } from "firebase-functions/v2/storage";
import { admin } from "../shared/firebase";
import { DEFAULT_LANGUAGE, translateLabels } from "../shared/translate";
import { visionClient } from "../shared/vision";
import * as sharp from "sharp";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";

/*
    TRIGGER: Al subir una imagen a Storage:
      - Si es de un post ('posts/'): Analiza con Vision API para extraer labels.
      - Si es de perfil ('users/'): Reescala a 512x512, convierte a WebP, 
        y actualiza la photoUrl del usuario en la base de datos.
*/
export const onImageUploaded = onObjectFinalized(async (event) => {
    const filePath = event.data.name; 

    if (filePath.startsWith("posts/") && event.data.contentType !== "image/webp") {
        return handlePostImage(event);
    }

    if (filePath.startsWith("users/") && filePath.endsWith("/profile_image") && event.data.contentType !== "image/webp") {
        return handleProfileImage(event);
    }

    return null;
});

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
                cacheControl: "public,max-age=31536000"
            }
        });

        const file = bucket.file(destination);
        await file.makePublic();
        const publicUrl = `https://storage.googleapis.com/${bucketName}/${destination}`;

        await admin.database().ref(`users/${userId}`).update({
            photoUrl: publicUrl
        });

        await bucket.file(filePath).delete();
        console.log(`Foto de perfil optimizada para ${userId}: ${publicUrl}`);
    } catch (error) {
        console.error("Error procesando foto de perfil:", error);
    } finally {
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
        if (fs.existsSync(optimizedFilePath)) fs.unlinkSync(optimizedFilePath);
    }
}

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
        // 1. Descargar imagen original
        await bucket.file(filePath).download({ destination: tempFilePath });

        // 2. Optimización con Sharp (max 1080x1080, WebP)
        await sharp(tempFilePath)
            .resize(1080, 1080, { fit: "inside", withoutEnlargement: true })
            .toFormat("webp")
            .toFile(optimizedFilePath);

        // 3. Subir optimizada
        const destination = `posts/${postId}/${fileName}.webp`;
        await bucket.upload(optimizedFilePath, {
            destination,
            metadata: {
                contentType: "image/webp",
                cacheControl: "public,max-age=31536000"
            }
        });

        const file = bucket.file(destination);
        await file.makePublic();
        const publicUrl = `https://storage.googleapis.com/${bucketName}/${destination}`;

        // 4. Vision API (usamos la optimizada para ahorrar ancho de banda/procesamiento si es posible, 
        // o la local que ya tenemos)
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

        // 5. Actualizar Realtime Database
        await admin.database().ref(`posts/${postId}`).update({
            imageUrl: publicUrl,
            vision_labels: translatedLabels
        });

        // 6. Eliminar original
        await bucket.file(filePath).delete();
        console.log(`Imagen de post optimizada y analizada para ${postId}: ${publicUrl}`);

    } catch (error) {
        console.error(`Error procesando imagen de post (${filePath}):`, error);
    } finally {
        // Limpieza de archivos temporales
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
        if (fs.existsSync(optimizedFilePath)) fs.unlinkSync(optimizedFilePath);
    }
    return null;
}
