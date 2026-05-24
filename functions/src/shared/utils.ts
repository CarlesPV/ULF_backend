/**
 * Calcula la distancia exacta en metros entre dos coordenadas geográficas utilizando la fórmula matemática de Haversine.
 * 
 * Este método calcula la distancia de círculo máximo sobre la superficie terrestre, ideal para validaciones geográficas
 * y geovallados en campus universitarios.
 * 
 * @param lat1 - Latitud del primer punto en grados decimales.
 * @param lon1 - Longitud del primer punto en grados decimales.
 * @param lat2 - Latitud del segundo punto en grados decimales.
 * @param lon2 - Longitud del segundo punto en grados decimales.
 * 
 * @returns La distancia lineal calculada en metros.
 */
export function getHaversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3; // Radio medio de la Tierra en metros (6371 km)
    const p1 = lat1 * Math.PI / 180;
    const p2 = lat2 * Math.PI / 180;
    const dp = (lat2 - lat1) * Math.PI / 180;
    const dl = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(dp / 2) * Math.sin(dp / 2) +
              Math.cos(p1) * Math.cos(p2) *
              Math.sin(dl / 2) * Math.sin(dl / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}

/**
 * Calcula la distancia exacta en metros entre dos coordenadas geográficas utilizando la fórmula de Haversine.
 * 
 * @param lat1 - Latitud del primer punto.
 * @param lon1 - Longitud del primer punto.
 * @param lat2 - Latitud del segundo punto.
 * @param lon2 - Longitud del segundo punto.
 * 
 * @returns La distancia lineal calculada en metros.
 */
export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    return getHaversineDistance(lat1, lon1, lat2, lon2);
}

/**
 * Calcula la distancia de Levenshtein entre dos cadenas de texto de forma iterativa y eficiente.
 * 
 * @param a - Primera cadena.
 * @param b - Segunda cadena.
 * 
 * @returns La distancia de Levenshtein (número de inserciones, eliminaciones o sustituciones).
 */
export function levenshteinDistance(a: string, b: string): number {
    const tmp: number[][] = [];
    for (let i = 0; i <= a.length; i++) {
        tmp[i] = [i];
    }
    for (let j = 0; j <= b.length; j++) {
        tmp[0][j] = j;
    }
    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            tmp[i][j] = Math.min(
                tmp[i - 1][j] + 1, // eliminación
                tmp[i][j - 1] + 1, // inserción
                tmp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1) // sustitución
            );
        }
    }
    return tmp[a.length][b.length];
}

/**
 * Calcula el coeficiente de similitud normalizado entre dos cadenas utilizando la distancia de Levenshtein.
 * 
 * @param s1 - Primera cadena de texto.
 * @param s2 - Segunda cadena de texto.
 * 
 * @returns Un valor flotante entre 0 (completamente distintas) y 1 (exactamente iguales).
 */
export function stringSimilarity(s1: string, s2: string): number {
    const len1 = s1.length;
    const len2 = s2.length;
    const maxLen = Math.max(len1, len2);
    if (maxLen === 0) return 1.0;
    const dist = levenshteinDistance(s1, s2);
    return 1.0 - dist / maxLen;
}



