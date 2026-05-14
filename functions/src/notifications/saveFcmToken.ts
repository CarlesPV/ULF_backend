import * as functions from "firebase-functions";
import { admin } from "../shared/firebase";
import { I18N_STRINGS } from "../shared/i18n";

/*
    Cloud Function Callable para guardar el token FCM del usuario.
    Permite que el cliente registre su token para recibir notificaciones push.
*/
export const saveFcmToken = functions.https.onCall(async (request) => {
    // 1. Validar que el usuario esté autenticado
    if (!request.auth || !request.auth.token.email_verified) {
        throw new functions.https.HttpsError(
            "permission-denied",
            I18N_STRINGS.errors.unverified_email
        );
    }

    const { token } = request.data;
    if (!token || typeof token !== "string") {
        throw new functions.https.HttpsError(
            "invalid-argument",
            I18N_STRINGS.errors.invalid_argument
        );
    }

    const uid = request.auth.uid;

    try {
        // 2. Guardar el token en /users/{uid}/fcm_tokens/{token}: true
        await admin.database().ref(`users/${uid}/fcm_tokens/${token}`).set(true);
        return { success: true, message: "Token registrado exitosamente." };
    } catch (error) {
        console.error(`Error guardando FCM token para usuario ${uid}:`, error);
        throw new functions.https.HttpsError(
            "internal",
            I18N_STRINGS.errors.internal_error
        );
    }
});
