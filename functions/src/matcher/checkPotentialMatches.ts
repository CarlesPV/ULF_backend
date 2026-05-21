import * as functions from "firebase-functions";
import { admin } from "../shared/firebase";
import { DEFAULT_LANGUAGE, translateText } from "../shared/translate";
import { I18N_STRINGS } from "../shared/i18n";

const SCORE_THRESHOLDS = {
    MIN_MATCH_SCORE: 0.5,
    TITLE_MAX: 1.0,
    DESCRIPTION_MAX: 0.5,
    IMAGE_BONUS: 0.25,
    DATE_MAX: 0.2,
};

const STOP_WORDS = new Set([
    "the", "and", "for", "but", "not", "con", "del", "una", "los", "las",
    "por", "que", "els", "les", "per", "sus", "com", "out", "you", "him",
    "her", "its", "our", "are", "was", "has", "had", "bin", "with", "this",
    "that", "from", "have", "they", "will", "been", "were", "what", "when"
]);

/**
 * Tokeniza y filtra stop words de un texto traducido.
 */
function tokenize(text: string): string[] {
    return text
        .toLowerCase()
        .split(/\s+/)
        .filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

/**
 * Ratio de palabras de `queryTokens` que aparecen en `targetText`.
 * Retorna un valor entre 0 y 1.
 */
function keywordMatchRatio(queryTokens: string[], targetText: string): number {
    if (queryTokens.length === 0 || !targetText) return 0;
    const matches = queryTokens.filter(w => targetText.includes(w)).length;
    return matches / queryTokens.length;
}

/**
 * Score por proximidad temporal entre dos timestamps (ms).
 * Usa decaimiento exponencial: máximo SCORE si mismo día, ~0 si > 30 días.
 */
function dateProximityScore(ts1: number, ts2: number, maxScore: number): number {
    if (!ts1 || !ts2) return 0;
    const diffDays = Math.abs(ts1 - ts2) / (1000 * 60 * 60 * 24);
    // e^(-0.1 * días): baja suavemente. A 7 días → ~0.5 del máximo, a 30 días → ~0.05
    return maxScore * Math.exp(-0.1 * diffDays);
}

export const checkPotentialMatches = functions.https.onCall(async (request) => {
    const { center_id, category, type, description, title, location, postImageUrl, created_at } = request.data;

    if (!request.auth || !request.auth.token.email_verified) {
        throw new functions.https.HttpsError("permission-denied", I18N_STRINGS.errors.unverified_email);
    }
    if (!center_id || !category || !type) {
        throw new functions.https.HttpsError("invalid-argument", I18N_STRINGS.errors.incomplete_data);
    }

    const targetType = (type === "found") ? "lost" : "found";

    const activeRefs = await admin.database().ref(`active_posts/${center_id}/${targetType}`).once("value");
    if (!activeRefs.exists()) return { matches: [] };

    const activeIds = Object.keys(activeRefs.val());
    const postSnapshots = await Promise.all(
        activeIds.map(id => admin.database().ref(`posts/${id}`).once("value"))
    );

    // Traducir y tokenizar título + descripción + location del post origen
    const rawText = `${title || ""} ${description || ""} ${location || ""}`.trim();
    let titleTokens: string[] = [];
    let descTokens: string[] = [];
    let locationTokens: string[] = [];

    if (rawText) {
        let translatedTitle = title || "";
        let translatedDesc = description || "";
        let translatedLocation = location || "";

        try {
            if (title) translatedTitle = await translateText(title, DEFAULT_LANGUAGE);
            if (description) translatedDesc = await translateText(description, DEFAULT_LANGUAGE);
            if (location) translatedLocation = await translateText(location, DEFAULT_LANGUAGE);
        } catch (error) {
            console.error("Error en traducción:", error);
        }

        titleTokens = tokenize(translatedTitle);
        descTokens = tokenize(translatedDesc);
        locationTokens = tokenize(translatedLocation);
    }

    const hasSourceImage = !!(postImageUrl || request.data.imageUrl || request.data.photo_url);

    const potentialMatches: any[] = [];

    for (const snap of postSnapshots) {
        if (!snap.exists()) continue;
        const post = snap.val();

        // Filtros obligatorios (hard filters) — no contribuyen al score
        if (post.type !== targetType || post.category !== category || post.is_deleted) continue;

        let score = 0;

        // 1. TÍTULO — ratio de coincidencia (0 a TITLE_MAX)
        const targetTitleText = (post.translated_title || post.title || "").toLowerCase();
        const titleRatio = keywordMatchRatio(titleTokens, targetTitleText);
        score += titleRatio * SCORE_THRESHOLDS.TITLE_MAX;

        // 2. DESCRIPCIÓN — ratio de coincidencia, capped a DESCRIPTION_MAX
        const targetDescText = (post.translated_description || post.description || "").toLowerCase();
        const descRatio = keywordMatchRatio(descTokens, targetDescText);
        score += Math.min(descRatio * SCORE_THRESHOLDS.DESCRIPTION_MAX * 2, SCORE_THRESHOLDS.DESCRIPTION_MAX);

        // 3. IMAGEN — bonus si ambos posts tienen imagen
        const hasTargetImage = !!(post.postImageUrl || post.imageUrl || post.photo_url || post.photo_path);
        if (hasSourceImage && hasTargetImage) {
            score += SCORE_THRESHOLDS.IMAGE_BONUS;
        }

        // 4. FECHA — proximidad temporal con decaimiento exponencial
        const sourceTs = typeof created_at === "number" ? created_at : 0;
        const targetTs = typeof post.created_at === "number" ? post.created_at : (post.date || 0);
        score += dateProximityScore(sourceTs, targetTs, SCORE_THRESHOLDS.DATE_MAX);

        // Filtrar por score mínimo
        if (score < SCORE_THRESHOLDS.MIN_MATCH_SCORE) continue;

        potentialMatches.push({
            id: post.id,
            title: post.title,
            description: post.description,
            score: Math.round(score * 1000) / 1000,
            photo_path: post.photo_path,
            postImageUrl: post.postImageUrl || post.imageUrl || post.photo_url || "",
            created_at: post.created_at || post.date || 0
        });
    }

    return {
        matches: potentialMatches
            .sort((a, b) => {
                if (Math.abs(b.score - a.score) > 0.001) return b.score - a.score;
                return (b.created_at || 0) - (a.created_at || 0);
            })
            .slice(0, 5)
            .map(({ created_at, ...rest }) => rest)
    };
});