import * as functions from "firebase-functions";
import { admin } from "../shared/firebase";
import { I18N_STRINGS } from "../shared/i18n";

export const updatePostStatus = functions.https.onCall(async (request) => {
    const { postId, newStatus } = request.data;
    
    if (!request.auth || !request.auth.token.email_verified) {
        throw new functions.https.HttpsError("unauthenticated", I18N_STRINGS.errors.unverified_email);
    }

    const postRef = admin.database().ref(`posts/${postId}`);
    const snapshot = await postRef.once("value");

    if (!snapshot.exists()) {
        throw new functions.https.HttpsError("not-found", I18N_STRINGS.errors.item_not_found);
    }
    
    if (snapshot.val().user_id !== request.auth.uid) {
        throw new functions.https.HttpsError("permission-denied", I18N_STRINGS.errors.unauthorized);
    }

    await postRef.update({ 
        status: newStatus, 
        updated_at: admin.database.ServerValue.TIMESTAMP 
    });
    
    return { success: true };
});