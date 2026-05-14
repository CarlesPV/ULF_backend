import { onObjectFinalized } from "firebase-functions/v2/storage";
import { admin } from "../shared/firebase";
import { TARGET_LANGUAGE, translateClient } from "../shared/translate";
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

    if (filePath.startsWith("posts/")) {
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

    try {
        const pathParts = filePath.split("/");
        if (pathParts.length < 3) return null;
        const postId = pathParts[1];

        const imageRequest = {
            image: { source: { gcsImageUri: `gs://${bucketName}/${filePath}` } }
        };

        const visionResponse = await visionClient.labelDetection(imageRequest);
        const labels = visionResponse[0]?.labelAnnotations || [];

        if (labels.length === 0) return null;

        const labelDescriptions = labels
            .map((label: any) => label.description)
            .filter((desc: any) => desc && typeof desc === "string");

        let translatedLabels: string[] = [];
        try {
            const translationText = labelDescriptions.join(", ");
            const [translation] = await translateClient.translate(translationText, TARGET_LANGUAGE);
            translatedLabels = translation
                .split(",")
                .map((label: string) => label.trim().toLowerCase())
                .filter((label: string) => label.length > 0);
        } catch (translationError) {
            translatedLabels = labelDescriptions.map((label: string) => label.toLowerCase());
        }

        await admin.database()
            .ref(`posts/${postId}/vision_labels`)
            .set(translatedLabels);

        return null;
    } catch (error) {
        console.error(`Error procesando imagen de post (${filePath}):`, error);
        return null;
    }
}
