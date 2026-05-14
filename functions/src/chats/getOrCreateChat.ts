import * as functions from "firebase-functions";
import { admin, db } from "../shared/firebase";

export const getOrCreateChat = functions.https.onCall(async (request) => {
    // 1. Validar autenticación
    if (!request.auth || !request.auth.token.email_verified) {
        throw new functions.https.HttpsError("unauthenticated", "Debe estar verificado.");
    }

    const uid = request.auth.uid;
    const { postId, postOwnerId, centerId, postTitle } = request.data;

    // 2. Buscar si ya existe una conversación entre estos dos usuarios para este post
    // Consultamos el índice de chats filtrando por post_id
    const chatsRef = db.ref("chats");
    const existingChatQuery = await chatsRef
        .orderByChild("post_id")
        .equalTo(postId)
        .once("value");

    let chatId: string | null = null;

    if (existingChatQuery.exists()) {
        const chats = existingChatQuery.val();
        // Verificamos manualmente en los resultados si el usuario actual es miembro
        chatId = Object.keys(chats).find(key => chats[key].members[uid] === true) || null;
    }

    if (chatId) return { chatId };

    // 3. Si no existe, crear uno nuevo
    const postSnapshot = await db.ref(`posts/${postId}`).once("value");
    const post = postSnapshot.val();
    
    const newChatRef = chatsRef.push();
    const newChatId = newChatRef.key;
    const finalTitle = post?.title || postTitle || "Sin título";
    const finalImageUrl = post?.imageUrl || "";

    const chatData = {
        id: newChatId,
        center_id: centerId,
        post_id: postId,
        post_title: finalTitle,
        post_image_url: finalImageUrl,
        members: {
            [uid]: true,
            [postOwnerId]: true
        },
        created_at: admin.database.ServerValue.TIMESTAMP,
        last_message: "SYSTEM_MSG_CHAT_STARTED",
        last_message_time: admin.database.ServerValue.TIMESTAMP
    };

    await newChatRef.set(chatData);

    // 4. IMPORTANTE: Indexar el chat para el usuario con TIMESTAMP para el tiempo real
    const currentTimestamp = admin.database.ServerValue.TIMESTAMP;
    await db.ref(`user_chats/${uid}/${newChatId}`).set(currentTimestamp);
    await db.ref(`user_chats/${postOwnerId}/${newChatId}`).set(currentTimestamp);

    return { chatId: newChatId };
});