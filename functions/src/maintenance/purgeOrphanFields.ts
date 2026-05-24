import * as functions from "firebase-functions";
import { db } from "../shared/firebase";
import { I18N_STRINGS } from "../shared/i18n";

/**
 * Cloud Function HTTPS Callable para purgar campos obsoletos/huérfanos de la base de datos.
 *
 * Lógica y seguridad:
 * 1. Restringe la ejecución exclusivamente a usuarios autenticados con el rol 'admin'.
 * 2. Purga campos obsoletos como `photo_path`, `settings/push_notifications`, `settings/dark_mode` y `settings/isDarkMode` en `/users`.
 * 3. Purga campos obsoletos como `photo_path` en `/posts`.
 * 4. Realiza actualizaciones atómicas por lotes (límite de 500 escrituras).
 */
export const purgeOrphanFields = functions.https.onCall(async (request) => {
    // 1. Validar autenticación
    if (!request.auth) {
        throw new functions.https.HttpsError(
            "unauthenticated",
            I18N_STRINGS.errors.unauthorized
        );
    }

    const callerUid = request.auth.uid;

    // 2. Verificar rol de administrador en la base de datos
    const callerRoleSnap = await db.ref(`users/${callerUid}/role`).once("value");
    if (!callerRoleSnap.exists() || callerRoleSnap.val() !== "admin") {
        throw new functions.https.HttpsError(
            "permission-denied",
            I18N_STRINGS.errors.unauthorized
        );
    }

    try {
        let processedUsers = 0;
        let updatedUsers = 0;
        let processedPosts = 0;
        let updatedPosts = 0;

        let updates: { [key: string]: null } = {};
        const BATCH_SIZE = 500;

        // 3. Procesar usuarios
        const usersSnap = await db.ref("users").once("value");
        if (usersSnap.exists()) {
            const usersData = usersSnap.val();
            for (const userId of Object.keys(usersData)) {
                processedUsers++;
                const user = usersData[userId];
                let hasOrphan = false;

                if (user.photo_path !== undefined && user.photo_path !== null) {
                    updates[`users/${userId}/photo_path`] = null;
                    hasOrphan = true;
                }
                if (user.settings) {
                    if (user.settings.push_notifications !== undefined && user.settings.push_notifications !== null) {
                        updates[`users/${userId}/settings/push_notifications`] = null;
                        hasOrphan = true;
                    }
                    if (user.settings.dark_mode !== undefined && user.settings.dark_mode !== null) {
                        updates[`users/${userId}/settings/dark_mode`] = null;
                        hasOrphan = true;
                    }
                    if (user.settings.isDarkMode !== undefined && user.settings.isDarkMode !== null) {
                        updates[`users/${userId}/settings/isDarkMode`] = null;
                        hasOrphan = true;
                    }
                }

                if (hasOrphan) {
                    updatedUsers++;
                }

                if (Object.keys(updates).length >= BATCH_SIZE) {
                    await db.ref().update(updates);
                    updates = {};
                }
            }
        }

        // 4. Procesar posts
        const postsSnap = await db.ref("posts").once("value");
        if (postsSnap.exists()) {
            const postsData = postsSnap.val();
            for (const postId of Object.keys(postsData)) {
                processedPosts++;
                const post = postsData[postId];
                if (post.photo_path !== undefined && post.photo_path !== null) {
                    updates[`posts/${postId}/photo_path`] = null;
                    updatedPosts++;
                }

                if (Object.keys(updates).length >= BATCH_SIZE) {
                    await db.ref().update(updates);
                    updates = {};
                }
            }
        }

        // Guardar cualquier actualización restante
        if (Object.keys(updates).length > 0) {
            await db.ref().update(updates);
        }

        console.log(`[Mantenimiento Purga] Usuarios procesados: ${processedUsers}, actualizados: ${updatedUsers}. Posts procesados: ${processedPosts}, actualizados: ${updatedPosts}.`);

        return {
            success: true,
            users: { processed: processedUsers, updated: updatedUsers },
            posts: { processed: processedPosts, updated: updatedPosts }
        };

    } catch (error) {
        console.error("Error en la purga de campos huérfanos:", error);
        throw new functions.https.HttpsError(
            "internal",
            I18N_STRINGS.errors.internal_error
        );
    }
});
