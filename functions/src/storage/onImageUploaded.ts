import { onObjectFinalized } from "firebase-functions/v2/storage";
import { admin } from "../shared/firebase";
import { TARGET_LANGUAGE, translateClient } from "../shared/translate";
import { visionClient } from "../shared/vision";

/*
    TRIGGER: Al subir una imagen a Storage:
      - Si pertenece a un post (ruta comienza con 'posts/'), analiza la imagen usando Vision API.
      - Extrae los labels detectados, los traduce al idioma común ('en'),
        y guarda las palabras clave en el campo 'vision_labels' del post en RTDB.
    Esto mejora el matching de posts usando características visuales detectadas automáticamente.
*/
export const onImageUploaded = onObjectFinalized(async (event) => {
    const filePath = event.data.name; // Ruta completa del archivo en Storage
    const bucket = event.data.bucket; // Bucket del Storage

    // 1. Verificar que la imagen pertenece a un post
    if (!filePath.startsWith("posts/")) {
        return null; // No es una imagen de post, ignorar
    }

    try {
        // Extraer el postId de la ruta (ej: posts/{postId}/image.jpg)
        const pathParts = filePath.split("/");
        if (pathParts.length < 3) {
            console.warn(`Ruta de imagen inválida: ${filePath}`);
            return null;
        }
        const postId = pathParts[1];

        // 2. Usar Cloud Vision para detectar labels en la imagen
        const imageRequest = {
            image: {
                source: {
                    gcsImageUri: `gs://${bucket}/${filePath}`
                }
            }
        };

        const visionResponse = await visionClient.labelDetection(imageRequest);
        const labels = visionResponse[0]?.labelAnnotations || [];

        if (labels.length === 0) {
            console.log(`No se detectaron labels en la imagen ${filePath}`);
            return null;
        }

        // 3. Extraer descripciones de los labels detectados
        const labelDescriptions = labels
            .map((label: any) => label.description)
            .filter((desc: any) => desc && typeof desc === "string");

        if (labelDescriptions.length === 0) {
            return null;
        }

        // 4. Traducir los labels al idioma común ('en')
        let translatedLabels: string[] = [];
        try {
            const translationText = labelDescriptions.join(", ");
            const [translation] = await translateClient.translate(translationText, TARGET_LANGUAGE);
            // Dividir por comas y limpiar espacios
            translatedLabels = translation
                .split(",")
                .map((label: string) => label.trim().toLowerCase())
                .filter((label: string) => label.length > 0);
        } catch (translationError) {
            console.error(`Error traduciendo labels para imagen ${filePath}:`, translationError);
            // Fallback: usar los labels originales en minúsculas
            translatedLabels = labelDescriptions
                .map((label: string) => label.toLowerCase())
                .filter((label: string) => label.length > 0);
        }

        // 5. Guardar los vision_labels en el nodo del post
        try {
            await admin.database()
                .ref(`posts/${postId}/vision_labels`)
                .set(translatedLabels);
            console.log(`Vision labels guardados para post ${postId}: ${translatedLabels.join(", ")}`);
        } catch (dbError) {
            console.error(`Error guardando vision_labels en RTDB para post ${postId}:`, dbError);
            // Continuar sin interrumpir aunque falle la escritura en RTDB
        }

        return null;
    } catch (error) {
        console.error(`Error procesando imagen de Storage (${filePath}):`, error);
        // No interrumpir el flujo principal si falla el análisis de Vision
        return null;
    }
});
