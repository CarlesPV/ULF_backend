import { onValueCreated, onValueUpdated, onValueDeleted } from "firebase-functions/v2/database";
import { admin } from "../shared/firebase";
import { Center } from "../shared/types";
import { DEFAULT_LANGUAGE, translateText } from "../shared/translate";
import { notifyMultipleUsersOfMatch } from "../shared/notifications";
import { getHaversineDistance } from "../shared/utils";

// Cache para minimizar lecturas a DB en triggers de alta frecuencia
const centersCache: Map<string, Center> = new Map();

/*
    TRIGGER: Al crear un post:
      - Lo añade al índice /active_posts/{center_id}/{post_id} si está activo.
      - Traduce su descripción a un idioma común para búsquedas multiidioma.
      - Busca matches automáticamente y notifica a usuarios relevantes.
    Ambas tareas son independientes: si la traducción o notificación fallan, el post sigue indexado.
*/
export const onPostCreated = onValueCreated("/posts/{postId}", async (event: any) => {
    const snapshot = event.data;
    const post = snapshot.val();
    if (!post?.center_id) return null;

    // 0. Validación de Integridad Geográfica (Zero Trust)
    const isValidLocation = await validatePostLocation(post);
    if (!isValidLocation) {
        console.warn(`Post ${event.params.postId} rechazado por ubicación inválida. Eliminando...`);
        await snapshot.ref.remove();
        return null;
    }

    const tasks: Promise<any>[] = [];

    if (post.status === "active" && post.is_deleted === false) {
        tasks.push(
            admin.database()
                .ref(`active_posts/${post.center_id}/${event.params.postId}`)
                .set(post.created_at)
        );
    }

    if (post.description) {
        tasks.push(
            translateText(post.description, DEFAULT_LANGUAGE)
                .then((translation: string) => snapshot.ref.update({
                    translated_description: translation.toLowerCase()
                }))
                .catch((error: any) => {
                    console.error(`Error traduciendo el post ${event.params.postId}:`, error);
                })
        );
    }

    // Añadir la búsqueda de matches a las tareas que deben completarse antes de cerrar la función
    if (post.status === "active" && post.is_deleted === false) {
        tasks.push(
            notifyMatchesForNewPost(event.params.postId, post).catch((error: any) => {
                console.error(`Error en búsqueda de matches para post ${event.params.postId}:`, error);
            })
        );
    }

    // Ahora Firebase esperará a que TODO (índice, traducción y matches) termine
    await Promise.all(tasks);
    return null;
});

/*
    TRIGGER: Mantiene el índice /active_posts/{center_id}/{post_id} sincronizado.
    Cuando un post cambia de estado (matched, returned) o se borra lógicamente,
    se elimina del índice. Así getFilteredFeed solo escanea posts activos.
*/
export const onPostUpdated = onValueUpdated("/posts/{postId}", async (event: any) => {
    const before = event.data.before.val();
    const after = event.data.after.val();
    if (!after?.center_id) return null;

    const tasks: Promise<any>[] = [];

    // 1. Mantener el índice /active_posts sincronizado
    const indexRef = admin.database().ref(`active_posts/${after.center_id}/${event.params.postId}`);
    const isActive = after.status === "active" && after.is_deleted === false;
    tasks.push(isActive ? indexRef.set(after.created_at) : indexRef.remove());

    // 2. Sincronizar cambios de título o imagen con los chats abiertos para este post
    const titleChanged = before?.title !== after?.title;
    const imageChanged = before?.imageUrl !== after?.imageUrl;

    if (titleChanged || imageChanged) {
        tasks.push(syncPostMetadataToChats(event.params.postId, after.title, after.imageUrl));
    }

    await Promise.all(tasks);
    return null;
});

async function syncPostMetadataToChats(postId: string, title: string, imageUrl: string) {
    const chatsQuery = await admin.database()
        .ref("chats")
        .orderByChild("post_id")
        .equalTo(postId)
        .once("value");

    if (!chatsQuery.exists()) return;

    const updates: { [key: string]: any } = {};
    chatsQuery.forEach((chatSnapshot) => {
        const chatId = chatSnapshot.key;
        updates[`chats/${chatId}/post_title`] = title || "Sin título";
        updates[`chats/${chatId}/post_image_url`] = imageUrl || "";
    });

    return admin.database().ref().update(updates);
}

/*
    TRIGGER: Limpia el índice /active_posts cuando un post se borra físicamente,
    evitando entradas huérfanas que apunten a posts ya inexistentes.
*/
export const onPostDeleted = onValueDeleted("/posts/{postId}", async (event: any) => {
    const before = event.data.val();
    if (!before?.center_id) return null;

    return admin.database()
        .ref(`active_posts/${before.center_id}/${event.params.postId}`)
        .remove();
});

/*
    TRIGGER: Busca matches automáticamente cuando se crea un nuevo post activo
    y notifica a los usuarios de los posts que coinciden.
    
    Flujo:
    1. El nuevo post se crea y activa en Firebase
    2. Se buscan posts activos del tipo opuesto en el mismo centro
    3. Se calcula relevancia por categoría y similitud de descripción
    4. Se filtra por umbral mínimo de relevancia (score >= 1.5)
    5. Se notifica a usuarios de los top 5 posts con mejor score
    
    IMPORTANTE: Solo se ejecuta cuando el post YA ESTÁ GUARDADO en Firebase.
    Esto evita notificaciones sobre posts que nunca se materializaron.
*/
async function notifyMatchesForNewPost(postId: string, newPost: any): Promise<void> {
    try {
        // Validar que sea un post activo y tenga datos suficientes
        if (newPost.status !== "active" || newPost.is_deleted || !newPost.center_id) {
            return;
        }

        const targetType = newPost.type === "found" ? "lost" : "found";

        // Obtener IDs de posts activos del tipo opuesto
        const activePostsSnapshot = await admin
            .database()
            .ref(`active_posts/${newPost.center_id}`)
            .once("value");

        if (!activePostsSnapshot.exists()) return;

        const activePostIds = Object.keys(activePostsSnapshot.val());

        // Cargar posts activos concurrentemente
        const postPromises = activePostIds.map((id) =>
            admin.database().ref(`posts/${id}`).once("value")
        );
        const postSnapshots = await Promise.all(postPromises);

        // Preparar términos de búsqueda del nuevo post
        let searchTerms = `${newPost.color || ""} ${newPost.description || ""}`.trim();
        let searchWords: string[] = [];

        if (searchTerms !== "") {
            try {
                const translation = await translateText(searchTerms, DEFAULT_LANGUAGE);
                searchWords = translation.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3);
            } catch (error) {
                console.error(`Error traduciendo búsqueda para post ${postId}:`, error);
            }
        }

        // Filtrar y calificar matches
        const potentialMatches: { userId: string; score: number }[] = [];

        for (const snap of postSnapshots) {
            if (!snap.exists()) continue;
            const existingPost = snap.val();

            // Solo matches del tipo opuesto, misma categoría, activos y no borrados
            if (existingPost.type === targetType && existingPost.category === newPost.category && 
                existingPost.status === "active" && !existingPost.is_deleted && existingPost.user_id) {
                
                let score = 1.0;
                const targetDesc = existingPost.translated_description || existingPost.description?.toLowerCase() || "";

                // Scoring por palabras clave
                if (searchWords.length > 0 && targetDesc) {
                    let matchCount = 0;
                    for (const word of searchWords) {
                        if (targetDesc.includes(word)) matchCount++;
                    }
                    score += matchCount * 0.5;
                }

                // FIX CRÍTICO #3: Solo notificar si el score es lo suficientemente alto
                // score >= 1.5 significa: categoría correcta + al menos 1 palabra coincide
                if (score >= 1.5) {
                    potentialMatches.push({
                        userId: existingPost.user_id,
                        score: score
                    });
                }
            }
        }

        // Notificar a usuarios de los top 5 matches
        const topMatches = potentialMatches.sort((a, b) => b.score - a.score).slice(0, 5);

        // FIX CRÍTICOS #1 y #2: 
        // - Enviamos los datos del NUEVO post (postId, newPost.title) al dueño del post ANTIGUO
        // - Esto asegura que cuando el usuario toca la notificación, ve el objeto que acaba de publicarse
        for (const match of topMatches) {
            try {
                await notifyMultipleUsersOfMatch([match.userId], {
                    id: postId,                    // ID del NUEVO post (el que acaba de crearse)
                    title: newPost.title,          // Título del NUEVO post
                    description: newPost.description,
                    photo_url: newPost.photo_url || ""
                }, match.score);
            } catch (error) {
                console.error(`Error notificando usuario ${match.userId} sobre nuevo post ${postId}:`, error);
            }
        }

        if (topMatches.length > 0) {
            console.log(`Post ${postId}: ${topMatches.length} matches encontrados y notificaciones enviadas (umbral >= 1.5)`);
        }

    } catch (error) {
        console.error(`Error en búsqueda de matches para nuevo post ${postId}:`, error);
        // No lanzar error para no interrumpir el flujo de creación del post
    }
}

/**
 * Valida si la ubicación de un post está dentro de los límites del centro.
 */
async function validatePostLocation(post: any): Promise<boolean> {
    const { center_id, coords } = post;
    if (!center_id || !coords?.lat || !coords?.lng) return false;

    let centerData = centersCache.get(center_id);
    if (!centerData) {
        const centerSnap = await admin.database().ref(`centers/${center_id}`).once("value");
        if (!centerSnap.exists()) return false;
        centerData = centerSnap.val() as Center;
        centersCache.set(center_id, centerData);
    }

    const { bounds, location, radius_meters } = centerData;

    if (!location || location.lat === undefined || location.lng === undefined) {
        console.error(`ERROR CRÍTICO: El centro ${center_id} no tiene ubicación configurada en DB.`);
        return false;
    }

    // 1. Validación Bounding Box
    if (bounds) {
        if (coords.lat < bounds.latMin || coords.lat > bounds.latMax ||
            coords.lng < bounds.lngMin || coords.lng > bounds.lngMax) {
            return false;
        }
    }

    // 2. Validación Haversine
    const distance = getHaversineDistance(coords.lat, coords.lng, location.lat, location.lng);
    const buffer = 50; // 50m de cortesía
    if (distance > (radius_meters + buffer)) {
        return false;
    }

    return true;
}
