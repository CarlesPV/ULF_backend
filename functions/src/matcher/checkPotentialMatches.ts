import * as functions from "firebase-functions";
import { admin } from "../shared/firebase";
import { DEFAULT_LANGUAGE, translateText } from "../shared/translate";
import { I18N_STRINGS } from "../shared/i18n";

export const checkPotentialMatches = functions.https.onCall(async (request) => {
    const { center_id, category, type, color, description } = request.data;

    if (!request.auth || !request.auth.token.email_verified) {
        throw new functions.https.HttpsError("permission-denied", I18N_STRINGS.errors.unverified_email);
    }
    if (!center_id || !category || !type) {
        throw new functions.https.HttpsError("invalid-argument", I18N_STRINGS.errors.incomplete_data);
    }

    const targetType = (type === "found") ? "lost" : "found";

    // 1. Consultar solo IDs de posts activos usando el índice
    const activeRefs = await admin.database().ref(`active_posts/${center_id}`).once("value");
    if (!activeRefs.exists()) return { matches: [] };

    const activeIds = Object.keys(activeRefs.val());

    // 2. Traer solo el contenido de esos posts concurrentemente
    const postPromises = activeIds.map(id => admin.database().ref(`posts/${id}`).once("value"));
    const postSnapshots = await Promise.all(postPromises);

    // 3. Preparar términos de búsqueda y traducción
    let searchTerms = `${color || ""} ${description || ""}`.trim();
    let searchWords: string[] = [];
    
    if (searchTerms !== "") {
        let translation = searchTerms;
        try {
            translation = await translateText(searchTerms, DEFAULT_LANGUAGE);
        } catch (error) {
            console.error("Error en traducción:", error);
        }
        searchWords = translation.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3);
    }

    // 4. Filtrado y Scoring
    const potentialMatches: any[] = [];
    
    for (const snap of postSnapshots) {
        if (!snap.exists()) continue;
        const post = snap.val();

        if (post.type === targetType && post.category === category && !post.is_deleted) {
            let score = 1.0;
            const targetDesc = post.translated_description || post.description?.toLowerCase() || "";

            if (searchWords.length > 0 && targetDesc) {
                let matchCount = 0;
                for (const word of searchWords) {
                    if (targetDesc.includes(word)) matchCount++;
                }
                score += (matchCount * 0.5);
            }

            potentialMatches.push({
                id: post.id,
                title: post.title,
                description: post.description,
                score: score,
                photo_path: post.photo_path,
                photo_url: post.photo_url || ""
            });
        }
    }

    return { matches: potentialMatches.sort((a, b) => b.score - a.score).slice(0, 5) };
});