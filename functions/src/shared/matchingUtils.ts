export const SCORE_THRESHOLDS = {
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
export function normalizeText(text: string): string {
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
export function tokenizeNormalized(text: string): string[] {
    const normalized = normalizeText(text);
    return normalized
        .split(/\s+/)
        .filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

/**
 * Calcula la distancia de Levenshtein entre dos cadenas de texto.
 */
export function getLevenshteinDistance(a: string, b: string): number {
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
export function areWordsSimilar(w1: string, w2: string): boolean {
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
export function fuzzyKeywordMatchRatio(queryTokens: string[], targetText: string): number {
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
export function dateProximityScore(ts1: number, ts2: number, maxScore: number): number {
    if (!ts1 || !ts2) return 0;
    const diffDays = Math.abs(ts1 - ts2) / (1000 * 60 * 60 * 24);
    // e^(-0.1 * días): baja suavemente. A 7 días → ~0.5 del máximo, a 30 días → ~0.05
    return maxScore * Math.exp(-0.1 * diffDays);
}

/**
 * Calcula centralizadamente el score de coincidencia entre dos posts.
 */
export function calculateMatchScore(sourcePost: any, targetPost: any): number {
    const titleTextSource = sourcePost.translated_title || sourcePost.title || "";
    const descTextSource = sourcePost.translated_description || sourcePost.description || "";

    const titleTokens = tokenizeNormalized(titleTextSource);
    const descTokens = tokenizeNormalized(descTextSource);

    const hasSourceImage = !!(sourcePost.postImageUrl || sourcePost.imageUrl || sourcePost.photo_url);

    let score = 0;

    // 1. TÍTULO — ratio de coincidencia (0 a TITLE_MAX)
    const targetTitleText = targetPost.translated_title || targetPost.title || "";
    const titleRatio = fuzzyKeywordMatchRatio(titleTokens, targetTitleText);
    score += titleRatio * SCORE_THRESHOLDS.TITLE_MAX;

    // 2. DESCRIPCIÓN — ratio de coincidencia, capped a DESCRIPTION_MAX
    const targetDescText = targetPost.translated_description || targetPost.description || "";
    const descRatio = fuzzyKeywordMatchRatio(descTokens, targetDescText);
    score += Math.min(descRatio * SCORE_THRESHOLDS.DESCRIPTION_MAX * 2, SCORE_THRESHOLDS.DESCRIPTION_MAX);

    // 3. IMAGEN — bonus si ambos posts tienen imagen
    const hasTargetImage = !!(targetPost.postImageUrl || targetPost.imageUrl || targetPost.photo_url || targetPost.photo_path);
    if (hasSourceImage && hasTargetImage) {
        score += SCORE_THRESHOLDS.IMAGE_BONUS;
    }

    // 4. FECHA — proximidad temporal con decaimiento exponencial
    const sourceTs = typeof sourcePost.created_at === "number" ? sourcePost.created_at : 0;
    const targetTs = typeof targetPost.created_at === "number" ? targetPost.created_at : (targetPost.date || 0);
    score += dateProximityScore(sourceTs, targetTs, SCORE_THRESHOLDS.DATE_MAX);

    // 5. CATEGORÍA — bonus por coincidencia de categoría
    if (targetPost.category === sourcePost.category) {
        score += SCORE_THRESHOLDS.CATEGORY_BONUS;
    }

    return score;
}
