import { onValueCreated, onValueUpdated, onValueDeleted } from "firebase-functions/v2/database";
import { admin } from "../shared/firebase";
import { DEFAULT_LANGUAGE, translateText } from "../shared/translate";

/*
    TRIGGER: Al crear un post:
      - Lo añade al índice /active_posts/{center_id}/{post_id} si está activo.
      - Traduce su descripción a un idioma común para búsquedas multiidioma.
    Ambas tareas son independientes: si la traducción falla, el post sigue indexado.
*/
export const onPostCreated = onValueCreated("/posts/{postId}", async (event: any) => {
    const snapshot = event.data;
    const post = snapshot.val();
    if (!post?.center_id) return null;

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
