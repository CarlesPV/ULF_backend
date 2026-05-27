import * as functions from "firebase-functions";
import { admin } from "../shared/firebase";
import { DEFAULT_LANGUAGE, translateText } from "../shared/translate";
import { I18N_STRINGS } from "../shared/i18n";
import { notifyMatchFound } from "../shared/notifications";

const SCORE_THRESHOLDS = {
    MIN_MATCH_SCORE: 0.80,
    TITLE_MAX: 1.0,
    DESCRIPTION_MAX: 0.5,
    IMAGE_BONUS: 0.25,
    DATE_MAX: 0.2,
    CATEGORY_BONUS: 0.1,
};

const STOP_WORDS = new Set([
    "the", "and", "for", "but", "not", "con", "del", "una", "los", "las",
    "por", "que", "els", "les", "per", "sus", "com", "out", "you", "him",
    "her", "its", "our", "are", "was", "has", "had", "bin", "with", "this",
    "that", "from", "have", "they", "will", "been", "were", "what", "when"
]);

/**
 * Normaliza el texto a minúsculas, sin acentos y sin signos de puntuación.
 */
function normalizeText(text: string): string {
    if (!text) return "";
    return text
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // elimina acentos (diacríticos)
        .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"'¿¡]/g, " ") // elimina signos de puntuación
        .replace(/\s+/g, " ")
        .trim();
}

/**
 * Tokeniza y filtra stop words de un texto normalizado.
 */
function tokenizeNormalized(text: string): string[] {
    const normalized = normalizeText(text);
    return normalized
        .split(/\s+/)
        .filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

/**
 * Calcula la distancia de Levenshtein entre dos cadenas de texto.
 */
function getLevenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];
    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }
    return matrix[b.length][a.length];
}

/**
 * Determina si dos palabras son similares según su longitud y distancia de Levenshtein.
 */
function areWordsSimilar(w1: string, w2: string): boolean {
    if (w1 === w2) return true;
    if (w2.includes(w1) || w1.includes(w2)) return true;
    const distance = getLevenshteinDistance(w1, w2);
    const maxLen = Math.max(w1.length, w2.length);
    if (maxLen <= 5) {
        return distance <= 1;
    } else {
        return distance <= 2;
    }
}

/**
 * Ratio de palabras de `queryTokens` que aparecen con similitud en `targetText`.
 * Retorna un valor entre 0 y 1.
 */
function fuzzyKeywordMatchRatio(queryTokens: string[], targetText: string): number {
    if (queryTokens.length === 0 || !targetText) return 0;
    const targetTokens = tokenizeNormalized(targetText);
    if (targetTokens.length === 0) return 0;

    let matchCount = 0;
    for (const qToken of queryTokens) {
        const hasMatch = targetTokens.some(tToken => areWordsSimilar(qToken, tToken));
        if (hasMatch) {
            matchCount++;
        }
    }
    return matchCount / queryTokens.length;
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
    const sourcePostId = request.data.id || request.data.postId || request.data.post_id;
    const callerLang = request.data.lang || "es";

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

    // Traducir y tokenizar título + descripción + location del post origen
    const rawText = `${title || ""} ${description || ""} ${location || ""}`.trim();
    let titleTokens: string[] = [];
    let descTokens: string[] = [];

    if (rawText) {
        let translatedTitle = title || "";
        let translatedDesc = description || "";

        try {
            if (title) translatedTitle = await translateText(title, DEFAULT_LANGUAGE);
            if (description) translatedDesc = await translateText(description, DEFAULT_LANGUAGE);
        } catch (error) {
            console.error("Error en traducción:", error);
        }

        titleTokens = tokenizeNormalized(translatedTitle);
        descTokens = tokenizeNormalized(translatedDesc);
    }

    const hasSourceImage = !!(postImageUrl || request.data.imageUrl || request.data.photo_url);

    const potentialMatches: any[] = [];

    for (const snap of postSnapshots) {
        if (!snap.exists()) continue;
        const post = snap.val();

        // Filtros obligatorios (hard filters) — no contribuyen al score
        if (post.type !== targetType || post.is_deleted) continue;

        // Excluir publicaciones del propio usuario
        if (post.user_id === callerUid) continue;

        let score = 0;

        // 1. TÍTULO — ratio de coincidencia (0 a TITLE_MAX)
        const targetTitleText = post.translated_title || post.title || "";
        const titleRatio = fuzzyKeywordMatchRatio(titleTokens, targetTitleText);
        score += titleRatio * SCORE_THRESHOLDS.TITLE_MAX;

        // 2. DESCRIPCIÓN — ratio de coincidencia, capped a DESCRIPTION_MAX
        const targetDescText = post.translated_description || post.description || "";
        const descRatio = fuzzyKeywordMatchRatio(descTokens, targetDescText);
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

        // 5. CATEGORÍA — bonus por coincidencia de categoría
        if (post.category === category) {
            score += SCORE_THRESHOLDS.CATEGORY_BONUS;
        }

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

    let autoMatched = false;
    const bestMatch = sortedMatches[0];
    if (bestMatch && bestMatch.score >= 0.80 && sourcePostId && bestMatch.id) {
        try {
            const sourcePostSnap = await admin.database().ref(`posts/${sourcePostId}`).once("value");
            if (sourcePostSnap.exists()) {
                try {
                    const updates: { [key: string]: any } = {};
                    updates[`/posts/${sourcePostId}/status`] = "matched";
                    updates[`/posts/${sourcePostId}/updated_at`] = admin.database.ServerValue.TIMESTAMP;
                    updates[`/posts/${bestMatch.id}/status`] = "matched";
                    updates[`/posts/${bestMatch.id}/updated_at`] = admin.database.ServerValue.TIMESTAMP;

                    console.log(`Ejecutando update atómico para posts ${sourcePostId} y ${bestMatch.id}:`, updates);
                    await admin.database().ref().update(updates);
                    console.log(`Smart Matcher exitoso: posts ${sourcePostId} y ${bestMatch.id} actualizados a 'matched'`);
                    autoMatched = true;
                } catch (error) {
                    console.error("Error en transacción atómica de matching:", error);
                }

                if (autoMatched) {
                    // Delay de 2 segundos antes de enviar las notificaciones
                    await new Promise(resolve => setTimeout(resolve, 2000));

                    // Disparar notificaciones a ambos usuarios
                    const targetUserId = bestMatch.user_id;
                    const targetTitle = bestMatch.title || "Objeto";
                    const targetDesc = bestMatch.description || "";
                    const targetPhotoUrl = bestMatch.postImageUrl || "";

                    await Promise.all([
                        notifyMatchFound(
                            targetUserId,
                            {
                                id: sourcePostId,
                                title: title || "Objeto",
                                description: description || "",
                                photo_url: postImageUrl || request.data.imageUrl || request.data.photo_url || ""
                            },
                            bestMatch.score
                        ),
                        notifyMatchFound(
                            callerUid,
                            {
                                id: bestMatch.id,
                                title: targetTitle,
                                description: targetDesc,
                                photo_url: targetPhotoUrl
                            },
                            bestMatch.score,
                            callerLang
                        )
                    ]).catch(err => {
                        console.error("Error al enviar notificaciones de match:", err);
                    });
                }
            } else {
                console.error(`Smart Matcher: El post de origen ${sourcePostId} no existe en la base de datos. Se aborta la actualización.`);
            }
        } catch (error) {
            console.error("Error al verificar existencia de post de origen:", error);
        }
    }

    return {
        matches: sortedMatches
            .slice(0, 5)
            .map(({ created_at, user_id, ...rest }) => rest),
        autoMatched
    };
});