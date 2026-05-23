import * as functions from "firebase-functions";
import { admin } from "../shared/firebase";
import { I18N_STRINGS } from "../shared/i18n";

const USER_EDITABLE_STATUSES = new Set(["active", "matched", "returned"]);
const SAFE_POST_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

/**
 * Actualiza el estado de una publicación (ej. de 'active' a 'returned').
 * 
 * Esta función de Cloud Call implementa un control de acceso estricto:
 * 1. Valida que el usuario solicitante esté autenticado y cuente con correo institucional verificado.
 * 2. Valida de forma defensiva el payload, ya que Admin SDK omite las reglas de RTDB.
 * 3. Recupera la publicación desde Realtime Database y verifica su existencia.
 * 4. Valida la propiedad del post: solo el autor original del reporte está autorizado para modificar su estado.
 * 5. Actualiza el estado (`status`) y el campo temporal `updated_at`.
 * 
 * @param request - Objeto de petición que contiene los datos de la actualización:
 *   - postId: Identificador único de la publicación a modificar.
 *   - newStatus: Nuevo estado a asignar ("active", "matched" o "returned").
 * 
 * @returns Un objeto que indica el éxito de la modificación.
 * 
 * @throws {HttpsError}
 *   - 'unauthenticated': Si el usuario no está autenticado o su correo no está verificado.
 *   - 'invalid-argument': Si el payload o el estado solicitado no son válidos.
 *   - 'not-found': Si la publicación especificada no existe en la base de datos.
 *   - 'permission-denied': Si el usuario autenticado no es el autor original de la publicación.
 */
export const updatePostStatus = functions.https.onCall(async (request) => {
    if (!request.auth || !request.auth.token.email_verified) {
        throw new functions.https.HttpsError("unauthenticated", I18N_STRINGS.errors.unverified_email);
    }

    const { postId, newStatus } = request.data || {};

    if (
        typeof postId !== "string" ||
        postId.trim().length === 0 ||
        !SAFE_POST_ID_PATTERN.test(postId.trim())
    ) {
        throw new functions.https.HttpsError("invalid-argument", I18N_STRINGS.errors.invalid_argument);
    }

    if (typeof newStatus !== "string") {
        throw new functions.https.HttpsError("invalid-argument", I18N_STRINGS.errors.invalid_argument);
    }

    const normalizedPostId = postId.trim();
    const normalizedStatus = newStatus.trim().toLowerCase();

    if (!USER_EDITABLE_STATUSES.has(normalizedStatus)) {
        throw new functions.https.HttpsError("invalid-argument", I18N_STRINGS.errors.invalid_argument);
    }

    const postRef = admin.database().ref(`posts/${normalizedPostId}`);
    const snapshot = await postRef.once("value");

    if (!snapshot.exists()) {
        throw new functions.https.HttpsError("not-found", I18N_STRINGS.errors.item_not_found);
    }
    
    // Verificar estrictamente la autoría de la publicación antes de permitir cambios
    if (snapshot.val().user_id !== request.auth.uid) {
        throw new functions.https.HttpsError("permission-denied", I18N_STRINGS.errors.unauthorized);
    }

    await postRef.update({ 
        status: normalizedStatus,
        updated_at: admin.database.ServerValue.TIMESTAMP 
    });
    
    return { success: true };
});
