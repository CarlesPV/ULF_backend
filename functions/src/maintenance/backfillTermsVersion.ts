import * as functions from "firebase-functions";
import { db } from "../shared/firebase";
import { I18N_STRINGS } from "../shared/i18n";

/**
 * Cloud Function HTTPS Callable para migrar usuarios antiguos que no tienen el campo
 * `acceptedTermsVersion` definido en su perfil.
 * 
 * Lógica y seguridad:
 * 1. Restringe la ejecución exclusivamente a usuarios autenticados con el rol 'admin'.
 * 2. Lee de forma optimizada la rama `/users` de la base de datos.
 * 3. Identifica a aquellos usuarios huérfanos de la propiedad `acceptedTermsVersion`.
 * 4. Aplica una actualización atómica multirruta en lotes (de hasta 500 registros) para
 *    inicializar la versión en "0.0.0", obligando al Frontend a pedir la re-aceptación.
 * 5. Al actualizar únicamente esta propiedad, evitamos disparar lógica secundaria masiva
 *    en `onUserProfileUpdated.ts` ya que esta solo propaga cambios de nombre e imagen.
 */
export const backfillTermsVersion = functions.https.onCall(async (request) => {
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
        // 3. Obtener todos los perfiles de usuario
        const usersSnap = await db.ref("users").once("value");
        if (!usersSnap.exists()) {
            return {
                success: true,
                processed: 0,
                updated: 0
            };
        }

        const usersData = usersSnap.val();
        const userIds = Object.keys(usersData);
        const totalUsers = userIds.length;

        let updates: { [key: string]: string } = {};
        let updatedCount = 0;
        const BATCH_SIZE = 500;

        for (const userId of userIds) {
            const user = usersData[userId];
            // Verificar si acceptedTermsVersion no existe o es nulo/indefinido
            if (user.acceptedTermsVersion === undefined || user.acceptedTermsVersion === null) {
                updates[`users/${userId}/acceptedTermsVersion`] = "0.0.0";
                updatedCount++;

                // Si alcanzamos el tamaño límite del lote, escribimos y vaciamos el objeto de updates
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

        console.log(`[Mantenimiento Backfill] Procesados: ${totalUsers} usuarios. Migrados a "0.0.0": ${updatedCount}.`);

        return {
            success: true,
            processed: totalUsers,
            updated: updatedCount
        };

    } catch (error) {
        console.error("Error en la migración de backfillTermsVersion:", error);
        throw new functions.https.HttpsError(
            "internal",
            I18N_STRINGS.errors.internal_error
        );
    }
});
