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


