import * as functions from "firebase-functions";
import { admin } from "../shared/firebase";
import { I18N_STRINGS } from "../shared/i18n";

export const recordPostView = functions.https.onCall(async (request) => {
    const { postId } = request.data;
    
    if (!request.auth || !request.auth.token.email_verified) {
        throw new functions.https.HttpsError("unauthenticated", I18N_STRINGS.errors.unverified_email);
    }

    const userId = request.auth.uid;
    const timestamp = admin.database.ServerValue.TIMESTAMP;

    // Se guarda como objeto para coincidir con tus reglas: newData.hasChildren(['timestamp'])
    await admin.database().ref(`post_views/${postId}/${userId}`).set({ timestamp });
    
    return { success: true };
});