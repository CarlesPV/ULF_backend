import * as functions from "firebase-functions";
import { admin } from "../shared/firebase";
import { TARGET_LANGUAGE, translateClient } from "../shared/translate";

/*
    Función para verificar posibles coincidencias entre publicaciones de objetos perdidos y encontrados
    VERSIÓN MEJORADA: Ahora busca coincidencias basadas en descripciones traducidas (multiidioma)
*/
export const checkPotentialMatches = functions.https.onCall(async (request) => {
    const { center_id, category, type, color, description } = request.data;

    if (!request.auth || !request.auth.token.email_verified) {
        throw new functions.https.HttpsError("permission-denied", "Debes verificar tu correo para buscar coincidencias.");
    }

    if (!center_id || !category || !type) {
        throw new functions.https.HttpsError("invalid-argument", "Faltan criterios de búsqueda.");
    }

    const targetType = (type === "found") ? "lost" : "found";
    const postsRef = admin.database().ref("posts");
    const snapshot = await postsRef.orderByChild("center_id").equalTo(center_id).once("value");

    if (!snapshot.exists()) return { matches: [] };

    const allPosts = snapshot.val();
    const potentialMatches: any[] = [];

    // 1. Unir el color y la descripción de búsqueda
    let searchTerms = "";
    if (color) searchTerms += color + " ";
    if (description) searchTerms += description;

    // 2. Traducir los términos de búsqueda al idioma común
    let searchWords: string[] = [];
    if (searchTerms.trim() !== "") {
        try {
            const [translation] = await translateClient.translate(searchTerms.trim(), TARGET_LANGUAGE);
            // Dividir en palabras y filtrar palabras muy cortas (conectores)
            searchWords = translation.toLowerCase().split(/\s+/).filter(w => w.length > 3);
        } catch (error) {
            console.error("Error en la traducción en tiempo real:", error);
            // Fallback: usar los términos originales si falla la API
            searchWords = searchTerms.toLowerCase().split(/\s+/).filter(w => w.length > 3);
        }
    }

    // 3. Fase de refinamiento en memoria
    for (const id in allPosts) {
        const post = allPosts[id];

        if (
            post.status === "active" &&
            post.type === targetType &&
            post.category === category &&
            post.is_deleted === false
        ) {
            // Relevancia base
            let score = 1.0;

            // Evaluamos coincidencias contra la descripción ya traducida del post
            const targetDesc = post.translated_description || post.description?.toLowerCase() || "";

            if (searchWords.length > 0 && targetDesc) {
                let matchCount = 0;
                for (const word of searchWords) {
                    if (targetDesc.includes(word)) {
                        matchCount++;
                    }
                }
                // Aumentamos el score de forma proporcional a las palabras que hicieron "match"
                score += (matchCount * 0.5);
            }

            potentialMatches.push({
                id: post.id,
                title: post.title,
                score: score,
                photo_path: post.photo_path
            });
        }
    }

    return {
        matches: potentialMatches.sort((a, b) => b.score - a.score).slice(0, 5)
    };
});
