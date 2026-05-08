import * as functions from "firebase-functions";
import { admin } from "../shared/firebase";

export const updatePostStatus = functions.https.onCall(async (request) => {
    const { postId, newStatus } = request.data;
    
    if (!request.auth || !request.auth.token.email_verified) {
        throw new functions.https.HttpsError("unauthenticated", "Debe estar logueado y verificado.");
    }

    const postRef = admin.database().ref(`posts/${postId}`);
    const snapshot = await postRef.once("value");

    if (!snapshot.exists()) {
        throw new functions.https.HttpsError("not-found", "Post inexistente.");
    }
    
    if (snapshot.val().user_id !== request.auth.uid) {
        throw new functions.https.HttpsError("permission-denied", "No eres el propietario del post.");
    }

    await postRef.update({ 
        status: newStatus, 
        updated_at: admin.database.ServerValue.TIMESTAMP 
    });
    
    return { success: true };
});