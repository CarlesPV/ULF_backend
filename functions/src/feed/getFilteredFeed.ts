import * as functions from "firebase-functions";
import * as geofire from "geofire-common";
import { admin } from "../shared/firebase";
import { DEFAULT_LANGUAGE, translateText } from "../shared/translate";
import { FeedFilterPayload } from "../shared/types";
import { I18N_STRINGS } from "../shared/i18n";

/*
    Función para obtener el feed filtrado por universidad, tipo, categoría y palabras clave.
    Usa el índice /active_posts/{center_id} para escanear solo posts activos,
    evitando cargar el historial acumulado de posts resueltos o eliminados.
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

    // 1. Leer solo las keys activas del índice secundario (no los posts completos aún)
    const activeKeysSnap = await admin.database()
        .ref(`active_posts/${center_id}`)
        .orderByValue() // Ordenar por timestamp (valor en este índice)
        .once("value");

    if (!activeKeysSnap.exists()) return { feed: [] };

    // 2. Recuperar los posts completos en paralelo usando las keys del índice
    const postIds = Object.keys(activeKeysSnap.val());
    const postFetches = postIds.map(id =>
        admin.database().ref(`posts/${id}`).once("value")
    );
    const postSnaps = await Promise.all(postFetches);

    // 3. Preparar palabras clave traducidas al idioma común para match multiidioma
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

    // 4. Filtrado en memoria del servidor
    const filteredPosts: any[] = [];

    for (const snap of postSnaps) {
        if (!snap.exists()) continue;
        const post = snap.val();

        if (post.type !== type) continue;
        if (category && post.category !== category) continue;

        if (searchWords.length > 0) {
            // Combinamos título, descripción (original y traducida) y etiquetas visuales para una búsqueda exhaustiva
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

    // 5. Aplicar ordenamiento según sort_by e inyectar distance_km si es necesario
    let feed: any[] = [];

    if (sort_by === "distance" && user_lat !== undefined && user_lng !== undefined) {
        // Ordenar por distancia geográfica
        const postsWithDistance = filteredPosts
            .map((post: any) => {
                // Si el post no tiene coords válidas, excluirlo del resultado
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
            .filter((post: any) => post !== null) // Filtrar posts sin coords válidas
            .sort((a: any, b: any) => a.distance_km - b.distance_km)
            .slice(0, max_results);

        feed = postsWithDistance;
    } else {
        // Ordenar por fecha descendente (comportamiento por defecto)
        feed = filteredPosts
            .sort((a, b) => b.created_at - a.created_at)
            .slice(0, max_results);
    }

    return { feed };
});
