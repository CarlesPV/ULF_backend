import * as functions from "firebase-functions";
import { admin, db } from "../shared/firebase";

export const getOrCreateChat = functions.https.onCall(async (request) => {
    // 1. Validar autenticación (Relajado a petición para permitir usuarios autenticados)
    if (!request.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Debe estar autenticado para iniciar un chat.");
    }

    const uid = request.auth.uid;
    const { postId, postOwnerId, centerId, postTitle } = request.data;

    // 2. Buscar si ya existe una conversación entre estos dos usuarios para este post
    const chatsRef = db.ref("chats");
    const existingChatQuery = await chatsRef
        .orderByChild("post_id")
        .equalTo(postId)
        .once("value");

    if (existingChatQuery.exists()) {
        const chats = existingChatQuery.val();
        // Verificamos si el usuario actual es miembro de alguno de los chats de este post
        const existingChatId = Object.keys(chats).find(key => chats[key].members && chats[key].members[uid] === true);
        if (existingChatId) return { chatId: existingChatId };
    }

    // 3. Obtener información para desnormalizar (Post y Perfiles de Usuario)
    const [postSnapshot, userSnapshot, ownerSnapshot] = await Promise.all([
        db.ref(`posts/${postId}`).once("value"),
        db.ref(`users/${uid}`).once("value"),
        db.ref(`users/${postOwnerId}`).once("value")
    ]);

    const post = postSnapshot.val();
    const userData = userSnapshot.val();
    const ownerData = ownerSnapshot.val();

    const newChatRef = chatsRef.push();
    const newChatId = newChatRef.key;

    const chatData = {
        id: newChatId,
        center_id: centerId,
        post_id: postId,
        postTitle: post?.title || postTitle || "Sin título",
        postImageUrl: post?.imageUrl || post?.image_url || null, // Null explícito si no hay imagen
        members: {
            [uid]: true,
            [postOwnerId]: true
        },
        // Desnormalización de info de usuarios para evitar consultas extra en el Feed de Chats
        usersInfo: {
            [uid]: {
                displayName: userData?.name || "Usuario",
                photoUrl: userData?.photo_url || userData?.photo_path || null
            },
            [postOwnerId]: {
                displayName: ownerData?.name || "Usuario",
                photoUrl: ownerData?.photo_url || ownerData?.photo_path || null
            }
        },
        created_at: admin.database.ServerValue.TIMESTAMP,
        last_message: "SYSTEM_MSG_CHAT_STARTED", // Constante estricta para i18n en Frontend
        last_message_time: admin.database.ServerValue.TIMESTAMP
    };

    await newChatRef.set(chatData);

    // 4. Indexar el chat para ambos usuarios
    const currentTimestamp = admin.database.ServerValue.TIMESTAMP;
    await db.ref(`user_chats/${uid}/${newChatId}`).set(currentTimestamp);
    await db.ref(`user_chats/${postOwnerId}/${newChatId}`).set(currentTimestamp);

    return { chatId: newChatId };
});