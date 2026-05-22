import * as functions from "firebase-functions";
import * as geofire from "geofire-common";
import { admin } from "../shared/firebase";
import { DEFAULT_LANGUAGE, translateText } from "../shared/translate";
import { FeedFilterPayload } from "../shared/types";
import { I18N_STRINGS } from "../shared/i18n";

/**
 * Obtiene el listado filtrado de posts (objetos perdidos/encontrados) activos para un centro.
 * 
 * Esta función de Cloud Call realiza las siguientes operaciones optimizadas:
 * 1. En primera instancia, valida que el solicitante esté autenticado y cuente con correo institucional verificado.
 * 2. Consulta de manera eficiente el índice secundario `/active_posts/{center_id}` para obtener únicamente las claves
 *    de publicaciones activas, previniendo la carga costosa e innecesaria de posts históricos resueltos o eliminados.
 * 3. Recupera de forma concurrente el contenido de los posts desde la colección principal.
 * 4. Soporte multiidioma (i18n): Si se proporciona un término de búsqueda (`search_term`), este se traduce al idioma común 
 *    de referencia (ej. catalán/español/inglés) mediante `translateText` para asegurar la coincidencia semántica
 *    sin importar el idioma en el que se redactó originalmente la publicación.
 * 5. Filtra localmente en memoria según criterios de tipo (lost/found), categoría, y términos coincidentes en títulos,
 *    descripciones (tanto originales como traducidas) y etiquetas de visión por computadora (`vision_labels`).
 * 6. Ordena los resultados resultantes:
 *    - Por distancia geográfica más cercana utilizando la fórmula de GeoFire si se especifican coordenadas de origen (`user_lat`, `user_lng`) y el criterio de ordenamiento es `'distance'`.
 *    - Por fecha de creación descendente (comportamiento predeterminado) para dar prioridad a los reportes más recientes.
 * 7. Limita el resultado a un número máximo (`max_results`) de publicaciones devueltas.
 * 
 * @param request - Objeto de petición que implementa la interfaz `FeedFilterPayload`:
 *   - center_id: Identificador del centro universitario para delimitar el feed.
 *   - type: Tipo de publicación a consultar ("lost" o "found").
 *   - category: (Opcional) Filtrar por categoría específica (ej. tecnología, llaves).
 *   - search_term: (Opcional) Cadena de búsqueda para filtro textual.
 *   - max_results: (Opcional) Límite de publicaciones a retornar (por defecto 50).
 *   - user_lat: (Opcional) Latitud del usuario para la ordenación espacial.
 *   - user_lng: (Opcional) Longitud del usuario para la ordenación espacial.
 *   - sort_by: (Opcional) Método de ordenación. Si es "distance", requiere `user_lat` y `user_lng`.
 * 
 * @returns Un objeto con la lista filtrada de posts (`feed`).
 * 
 * @throws {HttpsError}
 *   - 'permission-denied': Si el correo del usuario no está verificado.
 *   - 'invalid-argument': Si faltan los parámetros requeridos obligatorios (`center_id` o `type`).
 */
export const getFilteredFeed = functions.https.onCall(async (request: any) => {
    if (!request.auth || !request.auth.token.email_verified) {
        throw new functions.https.HttpsError("permission-denied", I18N_STRINGS.errors.unverified_email);
    }

    const data = request.data as FeedFilterPayload;
    const { center_id, type, category, search_term, max_results = 50, user_lat, user_lng, sort_by } = data;

    if (!center_id || !type) {
        throw new functions.https.HttpsError("invalid-argument", I18N_STRINGS.errors.incomplete_data);
    }

    // Consultar las claves de publicaciones activas desde el índice secundario de centros filtrado por tipo
    const activeKeysSnap = await admin.database()
        .ref(`active_posts/${center_id}/${type}`)
        .orderByValue()
        .once("value");

    if (!activeKeysSnap.exists()) return { feed: [] };

    // Recuperar concurrently el detalle de cada post empleando las claves indexadas
    const postIds = Object.keys(activeKeysSnap.val());
    const postFetches = postIds.map(id =>
        admin.database().ref(`posts/${id}`).once("value")
    );
    const postSnaps = await Promise.all(postFetches);

    // Preparar y normalizar términos de búsqueda traduciéndolos al idioma unificado del backend
    let searchWords: string[] = [];
    if (search_term?.trim()) {
        let translation = search_term.trim();
        try {
            translation = await translateText(search_term.trim(), DEFAULT_LANGUAGE);
        } catch (error) {
            console.error("Error traduciendo término de búsqueda:", error);
        }
        searchWords = translation.toLowerCase().split(/\s+/).filter((w: string) => w.length > 2);
    }

    // Filtrar la información en memoria para afinar los resultados devueltos al cliente
    const filteredPosts: any[] = [];

    for (const snap of postSnaps) {
        if (!snap.exists()) continue;
        const post = snap.val();

        if (post.type !== type) continue;
        if (post.status !== "active" && post.status !== "matched") continue;
        if (category && post.category !== category) continue;

        if (searchWords.length > 0) {
            // Se agrupan campos textuales de texto original, traducciones automáticas y etiquetas visuales
            const contentToSearch = [
                post.title,
                post.description,
                post.translated_description,
                ...(post.vision_labels || [])
            ].filter(Boolean).join(" ").toLowerCase();

            const hasMatch = searchWords.some((word: string) => contentToSearch.includes(word));
            if (!hasMatch) continue;
        }

        filteredPosts.push(post);
    }

    // Organizar el feed en base al método especificado por el cliente (geográfico o cronológico)
    let feed: any[] = [];

    if (sort_by === "distance" && user_lat !== undefined && user_lng !== undefined) {
        // Ordenación de posts basada en distancia geográfica (GeoFire)
        const postsWithDistance = filteredPosts
            .map((post: any) => {
                if (!post.coords || post.coords.lat === undefined || post.coords.lng === undefined) {
                    return null;
                }
                const distanceKm = geofire.distanceBetween(
                    [user_lat, user_lng],
                    [post.coords.lat, post.coords.lng]
                );
                return {
                    ...post,
                    distance_km: distanceKm
                };
            })
            .filter((post: any) => post !== null)
            .sort((a: any, b: any) => a.distance_km - b.distance_km)
            .slice(0, max_results);

        feed = postsWithDistance;
    } else {
        // Ordenación cronológica predeterminada (de más reciente a más antiguo)
        feed = filteredPosts
            .sort((a, b) => b.created_at - a.created_at)
            .slice(0, max_results);
    }

    return { feed };
});
