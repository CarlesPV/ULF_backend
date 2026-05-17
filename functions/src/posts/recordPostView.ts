import * as functions from "firebase-functions";
import { admin } from "../shared/firebase";
import { I18N_STRINGS } from "../shared/i18n";

/**
 * Registra una visualización de post para estadísticas y auditoría del usuario actual.
 * 
 * Esta función de Cloud Call realiza las siguientes acciones seguras:
 * 1. Valida que el usuario solicitante esté autenticado y cuente con correo electrónico verificado.
 * 2. Guarda un registro de visualización bajo `/post_views/{postId}/{userId}` que almacena la marca de tiempo (`timestamp`).
 *    El formato estructurado cumple estrictamente con las reglas de seguridad de Realtime Database (`newData.hasChildren(['timestamp'])`).
 * 
 * @param request - Objeto de petición que contiene el identificador de la publicación:
 *   - postId: Identificador del post visualizado por el usuario.
 * 
 * @returns Un objeto que indica el éxito del registro.
 * 
 * @throws {HttpsError}
 *   - 'unauthenticated': Si el usuario no cuenta con sesión activa o su correo no está verificado.
 */
export const recordPostView = functions.https.onCall(async (request) => {
    const { postId } = request.data;
    
    if (!request.auth || !request.auth.token.email_verified) {
        throw new functions.https.HttpsError("unauthenticated", I18N_STRINGS.errors.unverified_email);
    }

    const userId = request.auth.uid;
    const timestamp = admin.database.ServerValue.TIMESTAMP;

    // Se persiste como objeto estructurado para cumplir con las reglas de validación en la base de datos
    await admin.database().ref(`post_views/${postId}/${userId}`).set({ timestamp });
    
    return { success: true };
});