import * as functions from "firebase-functions";
import { admin, db } from "../shared/firebase";
import { I18N_STRINGS } from "../shared/i18n";

/**
 * Inicializa o recupera una conversación de chat existente para un post determinado.
 * 
 * Esta función de Cloud Call realiza el siguiente flujo:
 * 1. Valida la autenticación de la petición.
 * 2. Comprueba si ya existe un chat activo sobre el mismo objeto (`post_id`) entre el usuario actual y el propietario del post.
 * 3. En caso de no existir, obtiene los perfiles del usuario actual y del propietario, así como los datos del post.
 * 4. Desnormaliza información relevante (título, imagen del post y perfiles) para optimizar la carga del Feed de Chats.
 * 5. Genera un nuevo nodo de chat inicializado con un mensaje del sistema.
 * 6. Indexa la conversación en la lista de chats activos (`user_chats`) para ambos participantes en tiempo real.
 * 
 * @param request - Objeto de petición que contiene la información para el chat:
 *   - postId: Identificador del post (objeto perdido/encontrado) relacionado.
 *   - postOwnerId: Identificador único del propietario del post.
 *   - centerId: Identificador del centro universitario asociado.
 *   - postTitle: Título por defecto del post a utilizar como fallback.
 * 
 * @returns Un objeto con el identificador único (`chatId`) del chat creado o recuperado.
 * 
 * @throws {HttpsError}
 *   - 'unauthenticated': Si el usuario de la petición no está autenticado en Firebase.
 */
export const getOrCreateChat = functions.https.onCall(async (request) => {
    // Validar autenticación del usuario solicitante
    if (!request.auth) {
        throw new functions.https.HttpsError("unauthenticated", I18N_STRINGS.errors.unauthorized);
    }

    const uid = request.auth.uid;
    const { postId, postOwnerId, centerId, postTitle } = request.data;

    // Buscar si ya existe una conversación entre estos dos usuarios para este post concreto
    const chatsRef = db.ref("chats");
    const existingChatQuery = await chatsRef
        .orderByChild("post_id")
        .equalTo(postId)
        .once("value");

    if (existingChatQuery.exists()) {
        const chats = existingChatQuery.val();
        // Verificar si el usuario solicitante es miembro de alguno de los chats vinculados a este post
        const existingChatId = Object.keys(chats).find(key => chats[key].members && chats[key].members[uid] === true);
        if (existingChatId) return { chatId: existingChatId };
    }

    // Obtener información en paralelo de los perfiles y el post para desnormalizar datos
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
        post_owner_id: postOwnerId,
        postTitle: post?.title || postTitle || "Sin título",
        postImageUrl: post?.postImageUrl || post?.imageUrl || post?.image_url || post?.photoUrl || null, // Prioridad a la propiedad postImageUrl
        members: {
            [uid]: true,
            [postOwnerId]: true
        },
        // Desnormalización de datos de los participantes para evitar lecturas extra en el listado de chats
        usersInfo: {
            [uid]: {
                displayName: userData?.name || userData?.displayName || "Usuario",
                photoUrl: userData?.photo_url || userData?.photo_path || userData?.photoUrl || null
            },
            [postOwnerId]: {
                displayName: ownerData?.name || ownerData?.displayName || "Usuario",
                photoUrl: ownerData?.photo_url || ownerData?.photo_path || ownerData?.photoUrl || null
            }
        },
        created_at: admin.database.ServerValue.TIMESTAMP,
        last_message: "SYSTEM_MSG_CHAT_STARTED", // Constante estricta utilizada por el Frontend para su traducción i18n
        last_message_time: admin.database.ServerValue.TIMESTAMP
    };

    await newChatRef.set(chatData);

    // Indexar el chat bajo la lista de conversaciones de ambos usuarios (user_chats) para sincronización en tiempo real
    const currentTimestamp = admin.database.ServerValue.TIMESTAMP;
    await db.ref(`user_chats/${uid}/${newChatId}`).set(currentTimestamp);
    await db.ref(`user_chats/${postOwnerId}/${newChatId}`).set(currentTimestamp);

    return { chatId: newChatId };
});