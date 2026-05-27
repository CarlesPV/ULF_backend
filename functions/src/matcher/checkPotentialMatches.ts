import * as functions from "firebase-functions";
import { admin } from "../shared/firebase";
import { DEFAULT_LANGUAGE, translateText } from "../shared/translate";
import { I18N_STRINGS } from "../shared/i18n";
import { calculateMatchScore, SCORE_THRESHOLDS } from "../shared/matchingUtils";

export const checkPotentialMatches = functions.https.onCall(async (request) => {
    const { center_id, category, type, description, title, location, postImageUrl, created_at } = request.data;

    if (!request.auth || !request.auth.token.email_verified) {
        throw new functions.https.HttpsError("permission-denied", I18N_STRINGS.errors.unverified_email);
    }
    const callerUid = request.auth.uid;
    if (!center_id || !category || !type) {
        throw new functions.https.HttpsError("invalid-argument", I18N_STRINGS.errors.incomplete_data);
    }

    const targetType = (type === "found") ? "lost" : "found";

    const activeRefs = await admin.database().ref(`active_posts/${center_id}/${targetType}`).once("value");
    if (!activeRefs.exists()) return { matches: [], autoMatched: false };

    const activeIds = Object.keys(activeRefs.val());
    const postSnapshots = await Promise.all(
        activeIds.map(id => admin.database().ref(`posts/${id}`).once("value"))
    );

    const rawText = `${title || ""} ${description || ""} ${location || ""}`.trim();
    let translatedTitle = title || "";
    let translatedDesc = description || "";

    if (rawText) {
        try {
            if (title) translatedTitle = await translateText(title, DEFAULT_LANGUAGE);
            if (description) translatedDesc = await translateText(description, DEFAULT_LANGUAGE);
        } catch (error) {
            console.error("Error en traducción:", error);
        }
    }

    const sourcePost = {
        title,
        description,
        translated_title: translatedTitle.toLowerCase(),
        translated_description: translatedDesc.toLowerCase(),
        postImageUrl,
        imageUrl: request.data.imageUrl,
        photo_url: request.data.photo_url,
        created_at,
        category
    };

    const potentialMatches: any[] = [];

    for (const snap of postSnapshots) {
        if (!snap.exists()) continue;
        const post = snap.val();

        // Filtros obligatorios (hard filters) — no contribuyen al score
        if (post.type !== targetType || post.is_deleted) continue;

        // Excluir publicaciones del propio usuario
        if (post.user_id === callerUid) continue;

        const score = calculateMatchScore(sourcePost, post);

        // Filtrar por score mínimo
        if (score < SCORE_THRESHOLDS.MIN_MATCH_SCORE) continue;

        potentialMatches.push({
            id: post.id,
            user_id: post.user_id,
            title: post.title,
            description: post.description,
            score: Math.round(score * 1000) / 1000,
            photo_path: post.photo_path,
            postImageUrl: post.postImageUrl || post.imageUrl || post.photo_url || "",
            created_at: post.created_at || post.date || 0
        });
    }

    const sortedMatches = potentialMatches.sort((a, b) => {
        if (Math.abs(b.score - a.score) > 0.001) return b.score - a.score;
        return (b.created_at || 0) - (a.created_at || 0);
    });

    return {
        matches: sortedMatches
            .slice(0, 5)
            .map(({ created_at, user_id, ...rest }) => rest),
        autoMatched: false
    };
});