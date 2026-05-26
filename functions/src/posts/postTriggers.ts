import { onValueCreated, onValueUpdated, onValueDeleted } from "firebase-functions/v2/database";
import { HttpsError } from "firebase-functions/v2/https";
import { admin } from "../shared/firebase";
import { Center } from "../shared/types";
import { DEFAULT_LANGUAGE, translateText } from "../shared/translate";
import { notifyMatchFound } from "../shared/notifications";
import { getHaversineDistance } from "../shared/utils";
import { I18N_STRINGS } from "../shared/i18n";
import * as functions from "firebase-functions";
import { logger } from "firebase-functions";

// Margen de tolerancia de 50 metros para compensar punto flotante y GPS
const LOCATION_TOLERANCE_METERS = 50;

// Cache para minimizar lecturas a DB en triggers de alta frecuencia
const centersCache: Map<string, Center> = new Map();
/**
 * Trigger de Realtime Database v2 que se activa al crearse una nueva publicación en `/posts/{postId}`.
 *
 * Este trigger ejecuta el siguiente flujo lógico seguro y atómico:
 * 1. Validación de Integridad Geográfica (Zero Trust): Comprueba si la ubicación está dentro del geovallado del centro.
 *    Si falla, marca la publicación como "rejected" en la base de datos con el motivo de error.
 * 2. Indexación en Feed Activo: Si la publicación es activa y no ha sido borrada, agrega su clave en `/active_posts/{center_id}/{postId}`.
 * 3. Traducción Semántica Asíncrona: Si la descripción existe, la traduce automáticamente al idioma base del backend (`DEFAULT_LANGUAGE`)
 *    para posibilitar consultas de búsqueda multiidioma sin importar el idioma origen.
 * 4. Búsqueda y Alerta Automática de Coincidencias (Smart Match): Si el post está activo, analiza de manera asíncrona
 *    los posts contrarios y notifica por push a los usuarios que registraron reportes similares que superen el umbral de relevancia.
 *
 * @param event - Evento disparado por la creación de un registro bajo `/posts/{postId}`.
 */
export const onPostCreated = onValueCreated("/posts/{postId}", async (event: any) => {
    const snapshot = event.data;
    const post = snapshot.val();
    if (!post?.center_id) return null;

    try {
        await validatePostLocation(post);
    } catch (error: any) {
        console.warn(`Post ${event.params.postId} rechazado por ubicación inválida.`);
        await snapshot.ref.update({
            status: "rejected",
            rejection_reason: error.message || "out_of_bounds",
            updated_at: admin.database.ServerValue.TIMESTAMP
        });
        return null;
    }

    const tasks: Promise<any>[] = [];

    // Indexar el post bajo la lista de posts activos del centro
    if ((post.status === "active" || post.status === "matched") && post.is_deleted === false) {
        tasks.push(
            admin.database()
                .ref(`active_posts/${post.center_id}/${event.params.postId}`)
                .set(post.created_at)
        );
        if (post.type) {
            tasks.push(
                admin.database()
                    .ref(`active_posts/${post.center_id}/${post.type}/${event.params.postId}`)
                    .set(post.created_at)
            );
        }
    }

    // Traducción en segundo plano para habilitar compatibilidad multiidioma en búsquedas
    const translationTasks: Promise<any>[] = [];

    if (post.description) {
        translationTasks.push(
            translateText(post.description, DEFAULT_LANGUAGE)
                .then((translation: string) => snapshot.ref.update({
                    translated_description: translation.toLowerCase()
                }))
                .catch((error: any) => {
                    console.error(`Error traduciendo descripción del post ${event.params.postId}:`, error);
                })
        );
    }

    if (post.title) {
        translationTasks.push(
            translateText(post.title, DEFAULT_LANGUAGE)
                .then((translation: string) => snapshot.ref.update({
                    translated_title: translation.toLowerCase()
                }))
                .catch((error: any) => {
                    console.error(`Error traduciendo título del post ${event.params.postId}:`, error);
                })
        );
    }

    if (translationTasks.length > 0) {
        tasks.push(Promise.all(translationTasks));
    }

    // Ejecutar búsqueda de coincidencias y notificar a los usuarios en paralelo
    if (post.status === "active" && post.is_deleted === false) {
        tasks.push(
            notifyMatchesForNewPost(event.params.postId, post).catch((error: any) => {
                console.error(`Error en búsqueda de matches para post ${event.params.postId}:`, error);
            })
        );
    }

    await Promise.all(tasks);
    return null;
});

/**
 * Trigger de Realtime Database v2 que se activa al actualizarse una publicación en `/posts/{postId}`.
 *
 * Realiza las siguientes sincronizaciones de consistencia:
 * 1. Actualización de Índices de Feed: Si la publicación pasa a inactiva o borrada, se elimina de `/active_posts`.
 *    Si cambia de inactiva a activa, se vuelve a indexar.
 * 2. Sincronización Denormalizada: Si el autor cambia el título o la imagen del objeto, propaga estos metadatos
 *    a todas las sesiones de chat abiertas vinculadas a esta publicación para mantener la consistencia en el Feed de Chats del Frontend.
 *
 * @param event - Evento disparado por la actualización del registro.
 */
export const onPostUpdated = onValueUpdated("/posts/{postId}", async (event: any) => {
    const before = event.data.before.val();
    const after = event.data.after.val();
    if (!after?.center_id) return null;

    const tasks: Promise<any>[] = [];

    // Mantener el índice de publicaciones activas sincronizado para el feed de búsqueda
    const indexRef = admin.database().ref(`active_posts/${after.center_id}/${event.params.postId}`);
    const typeIndexRef = admin.database().ref(`active_posts/${after.center_id}/${after.type}/${event.params.postId}`);
    const isActive = (after.status === "active" || after.status === "matched") && after.is_deleted === false;

    if (isActive) {
        tasks.push(indexRef.set(after.created_at));
        if (after.type) {
            if (before && before.type && before.type !== after.type) {
                tasks.push(admin.database().ref(`active_posts/${before.center_id}/${before.type}/${event.params.postId}`).remove());
            }
            tasks.push(typeIndexRef.set(after.created_at));
        }
    } else {
        tasks.push(indexRef.remove());
        if (after.type) {
            tasks.push(typeIndexRef.remove());
        }
        if (before?.type) {
            tasks.push(admin.database().ref(`active_posts/${before.center_id}/${before.type}/${event.params.postId}`).remove());
        }
    }

    // Detectar cambios en título o imagen para propagar metadatos a chats existentes
    const titleChanged = before?.title !== after?.title;
    const imageChanged = (before?.imageUrl !== after?.imageUrl) || (before?.postImageUrl !== after?.postImageUrl);

    if (titleChanged || imageChanged) {
        tasks.push(syncPostMetadataToChats(event.params.postId, after.title, after.postImageUrl || after.imageUrl));
    }

    // Inhabilitación de chats en cascada por cambio de estado a devuelto o eliminado
    const newlyDeleted = after.is_deleted === true && (!before || before.is_deleted !== true);
    const newlyResolved = (after.status === "returned" || after.status === "resolved") && (!before || (before.status !== "returned" && before.status !== "resolved"));

    const wasDisabled = before?.is_deleted === true || before?.status === "returned" || before?.status === "resolved";
    const isNowActive = after.is_deleted === false && (after.status === "active" || after.status === "matched");

    if (newlyDeleted) {
        tasks.push(disableChatsForPost(event.params.postId, "deleted"));
    } else if (newlyResolved) {
        tasks.push(disableChatsForPost(event.params.postId, "resolved"));
    } else if (wasDisabled && isNowActive) {
        tasks.push(enableChatsForPost(event.params.postId));
    }

    // Gestión de archivos huérfanos: Si la URL de imagen ha cambiado o se ha eliminado, encolamos para borrado diferido
    const oldImageUrl = before?.imageUrl;
    const newImageUrl = after?.imageUrl;
    if (oldImageUrl && oldImageUrl !== newImageUrl) {
        tasks.push(queueImageDeletion(oldImageUrl));
    }

    await Promise.all(tasks);
    return null;
});

/**
 * Encola una imagen en Firestore para su posterior eliminación diferida tras 1 hora.
 *
 * @param url - URL pública de Firebase Storage del archivo a eliminar.
 */
async function queueImageDeletion(url: string): Promise<void> {
    if (!url || !url.startsWith("https://firebasestorage.googleapis.com")) return;
    try {
        const scheduledTime = admin.firestore.Timestamp.fromMillis(Date.now() + 60 * 60 * 1000);
        await admin.firestore().collection("pending_image_deletions").add({
            imageUrl: url,
            scheduledDeletionTime: scheduledTime
        });
        functions.logger.info(`[Storage Cleanup] Imagen encolada para borrado diferido: ${url}`);
    } catch (error) {
        functions.logger.error(`[Storage Cleanup Error] Fallo al encolar imagen para borrado diferido (${url}):`, error);
    }
}

/**
 * Elimina físicamente un archivo de Firebase Storage a partir de su URL pública.
 *
 * @param url - URL pública de Firebase Storage del archivo a eliminar.
 */
export async function deleteStorageFileFromUrl(url: string): Promise<void> {
    if (!url || !url.startsWith("https://firebasestorage.googleapis.com")) return;
    try {
        const match = url.match(/\/o\/([^?#]+)/);
        if (match && match[1]) {
            const storagePath = decodeURIComponent(match[1]);
            const bucket = admin.storage().bucket();
            const file = bucket.file(storagePath);
            await file.delete();
            functions.logger.info(`[Storage Cleanup] Imagen huérfana eliminada físicamente: ${storagePath}`);
        }
    } catch (error) {
        functions.logger.error(`[Storage Cleanup Error] Fallo al eliminar imagen anterior (${url}):`, error);
    }
}

/**
 * Sincroniza y propaga los metadatos de una publicación hacia todos sus chats activos asociados.
 *
 * @param postId - Identificador único de la publicación.
 * @param title - Nuevo título a propagar.
 * @param imageUrl - Nueva URL de imagen a propagar.
 */
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
        updates[`chats/${chatId}/postTitle`] = title || "Sin título";
        updates[`chats/${chatId}/postImageUrl`] = imageUrl || null;
    });

    return admin.database().ref().update(updates);
}

/**
 * Inhabilita todos los chats asociados a una publicación.
 *
 * @param postId - Identificador único de la publicación.
 * @param reason - Razón de la inhabilitación ('deleted' o 'resolved').
 */
async function disableChatsForPost(postId: string, reason: "deleted" | "resolved"): Promise<void> {
    const chatsQuery = await admin.database()
        .ref("chats")
        .orderByChild("post_id")
        .equalTo(postId)
        .once("value");

    if (!chatsQuery.exists()) return;

    const updates: { [key: string]: any } = {};
    chatsQuery.forEach((chatSnapshot) => {
        const chatId = chatSnapshot.key;
        updates[`chats/${chatId}/isActive`] = false;
        updates[`chats/${chatId}/disabledReason`] = reason;
    });

    await admin.database().ref().update(updates);
}

/**
 * Habilita todos los chats asociados a una publicación.
 *
 * @param postId - Identificador único de la publicación.
 */
async function enableChatsForPost(postId: string): Promise<void> {
    const chatsQuery = await admin.database()
        .ref("chats")
        .orderByChild("post_id")
        .equalTo(postId)
        .once("value");

    if (!chatsQuery.exists()) return;

    const updates: { [key: string]: any } = {};
    chatsQuery.forEach((chatSnapshot) => {
        const chatId = chatSnapshot.key;
        updates[`chats/${chatId}/isActive`] = true;
        updates[`chats/${chatId}/disabledReason`] = null;
    });

    await admin.database().ref().update(updates);
}

/**
 * Trigger de Realtime Database v2 que se activa al eliminarse físicamente una publicación en `/posts/{postId}`.
 *
 * Elimina de manera definitiva la clave del post de la ruta `/active_posts/{center_id}/{postId}` para evitar
 * la existencia de registros huérfanos que apunten a documentos eliminados físicamente.
 *
 * @param event - Evento disparado por la eliminación del registro.
 */
export const onPostDeleted = onValueDeleted("/posts/{postId}", async (event: any) => {
    const before = event.data.val();
    if (!before?.center_id) return null;

    const tasks: Promise<any>[] = [
        admin.database()
            .ref(`active_posts/${before.center_id}/${event.params.postId}`)
            .remove(),
        disableChatsForPost(event.params.postId, "deleted")
    ];

    if (before.type) {
        tasks.push(
            admin.database()
                .ref(`active_posts/${before.center_id}/${before.type}/${event.params.postId}`)
                .remove()
        );
    }

    await Promise.all(tasks);
    return null;
});

/**
 * Realiza una búsqueda automática de coincidencias para una publicación y notifica a los usuarios con reportes compatibles.
 *
 * Algoritmo del Smart Matcher:
 * 1. Identifica el tipo de publicación opuesto (ej. si el nuevo post es de tipo 'found', busca publicaciones 'lost').
 * 2. Carga concurrently el detalle de todos los reportes activos del tipo opuesto en el mismo centro.
 * 3. Traduce los términos de descripción del nuevo post al idioma común del backend para comparar semánticamente.
 * 4. Puntuación de Relevancia (Scoring):
 *    - Base de `1.0` si coincide en categoría y tipo opuesto.
 *    - Suma `0.5` puntos por cada coincidencia de palabra clave en la descripción del post objetivo.
 *    - Filtro de Umbral: Solo conserva coincidencias con un `score >= 1.5` (misma categoría + al menos 1 coincidencia textual).
 * 5. Envía una notificación push a los autores de las 5 mejores coincidencias sugeridas informando sobre el nuevo post.
 *
 * @param postId - Identificador único de la publicación recién registrada.
 * @param newPost - Objeto que contiene las propiedades completas del reporte.
 */
async function notifyMatchesForNewPost(postId: string, newPost: any): Promise<void> {
    try {
        if (newPost.status !== "active" || newPost.is_deleted || !newPost.center_id) {
            return;
        }

        const targetType = newPost.type === "found" ? "lost" : "found";

        // Obtener la lista de posts activos en el centro del tipo opuesto
        const activePostsSnapshot = await admin
            .database()
            .ref(`active_posts/${newPost.center_id}/${targetType}`)
            .once("value");

        if (!activePostsSnapshot.exists()) return;

        const activePostIds = Object.keys(activePostsSnapshot.val());

        // Cargar los posts de forma paralela
        const postPromises = activePostIds.map((id) =>
            admin.database().ref(`posts/${id}`).once("value")
        );
        const postSnapshots = await Promise.all(postPromises);

        // Preparar y traducir los términos de coincidencia
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

        // Evaluar compatibilidad de reportes y scoring
        const potentialMatches: any[] = [];

        for (const snap of postSnapshots) {
            if (!snap.exists()) continue;
            const existingPost = snap.val();

            if (existingPost.user_id === newPost.user_id) continue;

            if (existingPost.type === targetType && existingPost.category === newPost.category &&
                existingPost.status === "active" && !existingPost.is_deleted && existingPost.user_id) {

                let score = 1.0;
                const targetDesc = existingPost.translated_description || existingPost.description?.toLowerCase() || "";

                if (searchWords.length > 0 && targetDesc) {
                    let matchCount = 0;
                    for (const word of searchWords) {
                        if (targetDesc.includes(word)) matchCount++;
                    }
                    score += matchCount * 0.5;
                }

                // Umbral mínimo de relevancia: Filtra emparejamientos débiles de categorías genéricas
                if (score >= 1.5) {
                    potentialMatches.push({
                        userId: existingPost.user_id,
                        score: score,
                        postId: snap.key,
                        title: existingPost.title || "",
                        description: existingPost.description || "",
                        photo_url: existingPost.photo_url || existingPost.imageUrl || existingPost.postImageUrl || ""
                    });
                }
            }
        }

        // Ordenar coincidencias y tomar las 5 más relevantes
        const topMatches = potentialMatches.sort((a, b) => b.score - a.score).slice(0, 5);

        // Actualización atómica en la DB a 'matched'
        if (topMatches.length > 0) {
            const updates: { [key: string]: any } = {};
            updates[`posts/${postId}/status`] = "matched";
            updates[`posts/${postId}/updated_at`] = admin.database.ServerValue.TIMESTAMP;

            for (const match of topMatches) {
                if (match.postId) {
                    updates[`posts/${match.postId}/status`] = "matched";
                    updates[`posts/${match.postId}/updated_at`] = admin.database.ServerValue.TIMESTAMP;
                }
            }

            await admin.database().ref().update(updates);
        }

        // Enviar notificaciones cruzadas bidireccionales
        for (const match of topMatches) {
            try {
                await Promise.all([
                    notifyMatchFound(
                        match.userId,
                        {
                            id: postId,
                            title: newPost.title || "",
                            description: newPost.description || "",
                            photo_url: newPost.photo_url || newPost.imageUrl || newPost.postImageUrl || ""
                        },
                        match.score
                    ),
                    notifyMatchFound(
                        newPost.user_id,
                        {
                            id: match.postId || "",
                            title: match.title || "",
                            description: match.description || "",
                            photo_url: match.photo_url || ""
                        },
                        match.score
                    )
                ]);
            } catch (error) {
                console.error(`Error enviando notificaciones de match para ${match.userId} y ${newPost.user_id}:`, error);
            }
        }

        if (topMatches.length > 0) {
            console.log(`Post ${postId}: ${topMatches.length} matches encontrados y notificaciones enviadas (umbral >= 1.5)`);
        }

    } catch (error) {
        console.error(`Error en búsqueda de matches para nuevo post ${postId}:`, error);
    }
}

/**
 * Valida de forma rigurosa si las coordenadas geográficas de un reporte pertenecen al radio de acción del centro universitario.
 *
 * Implementa geovallado a nivel de base de datos comparando las coordenadas mediante la distancia Haversine.
 * Incluye un margen de tolerancia de 50 metros para equilibrar la precisión de punto flotante y la fidelidad del hardware GPS.
 *
 * @param post - Objeto que contiene las coordenadas y datos geográficos del reporte a validar.
 * @throws {HttpsError}
 *   - 'invalid-argument': Si faltan datos geográficos.
 *   - 'not-found': Si el centro especificado no está registrado en base de datos.
 *   - 'internal': Si el centro carece de ubicación de configuración en DB.
 *   - 'out-of-range': Si la distancia calculada excede el radio permitido sumado al margen de tolerancia.
 */
async function validatePostLocation(post: any): Promise<void> {
    const { center_id, coords } = post;
    if (!center_id || !coords?.lat || !coords?.lng) {
        throw new HttpsError("invalid-argument", I18N_STRINGS.errors.incomplete_data);
    }

    let centerData = centersCache.get(center_id);
    if (!centerData) {
        const centerSnap = await admin.database().ref(`centers/${center_id}`).once("value");
        if (!centerSnap.exists()) {
            throw new HttpsError("not-found", I18N_STRINGS.errors.center_not_found);
        }
        centerData = centerSnap.val() as Center;
        centersCache.set(center_id, centerData);
    }

    const { location, radius_meters } = centerData;

    if (!location || location.lat === undefined || location.lng === undefined) {
        console.error(`ERROR CRÍTICO: El centro ${center_id} no tiene ubicación configurada en DB.`);
        throw new HttpsError("internal", I18N_STRINGS.errors.center_config_error);
    }

    const distance = getHaversineDistance(coords.lat, coords.lng, location.lat, location.lng);
    const maxAllowedDistance = radius_meters + LOCATION_TOLERANCE_METERS;

    logger.info(`[Geovallado onPostCreated] Post: ${post.id || "nuevo"} | Distancia: ${distance.toFixed(2)}m | Radio: ${radius_meters}m | Tolerancia: ${LOCATION_TOLERANCE_METERS}m | Max permitido: ${maxAllowedDistance}m`);

    if (distance > maxAllowedDistance) {
        throw new HttpsError("out-of-range", I18N_STRINGS.errors.out_of_bounds_location);
    }
}