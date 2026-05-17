import * as functions from "firebase-functions";
import { admin } from "../shared/firebase";
import { I18N_STRINGS } from "../shared/i18n";

/**
 * Guarda o actualiza el token de registro de Firebase Cloud Messaging (FCM) para un usuario.
 * 
 * Esta función de Cloud Call realiza las siguientes validaciones y acciones:
 * 1. Valida que el usuario esté correctamente autenticado y posea su correo institucional verificado.
 * 2. Comprueba la presencia y la validez estructural de la cadena del token recibido.
 * 3. Almacena de forma persistente el token en el nodo `/users/{uid}/fcm_tokens/{token}` asociándolo a un valor `true`,
 *    lo que permite soportar múltiples dispositivos y tokens para un solo perfil de usuario.
 * 
 * @param request - Objeto de petición que contiene el token del dispositivo:
 *   - token: Cadena de texto correspondiente al token FCM generado en el cliente móvil.
 * 
 * @returns Un objeto que indica el éxito del registro.
 * 
 * @throws {HttpsError}
 *   - 'permission-denied': Si el usuario solicitante no está autenticado o no tiene el correo electrónico verificado.
 *   - 'invalid-argument': Si el token no es proporcionado o no cumple con el formato string esperado.
 *   - 'internal': Si sucede algún problema de escritura interno en Realtime Database.
 */
export const saveFcmToken = functions.https.onCall(async (request) => {
    // Validar autenticación de usuario y estado de verificación del correo electrónico
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
        // Almacenar el token en el índice de dispositivos activos del usuario
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
