import * as functions from "firebase-functions";
import { admin, db } from "../shared/firebase";
import { I18N_STRINGS } from "../shared/i18n";

/*
    Función segura para el registro de usuarios en universidades
*/
export const secureUniversityRegistration = functions.https.onCall(async (request) => {
    const { email, password, name } = request.data;

    if (!email || !password || !name) {
        throw new functions.https.HttpsError("invalid-argument", I18N_STRINGS.errors.incomplete_data);
    }

    // 1. Validar dominio
    const domain = email.split("@")[1];
    if (!domain) {
        throw new functions.https.HttpsError("invalid-argument", I18N_STRINGS.errors.invalid_argument);
    }
    const formattedDomain = domain.replace(/\./g, "_");

    // 2. Comprobar existencia y estado del centro
    const centersRef = db.ref("centers");
    const snapshot = await centersRef.orderByChild(`email_domains/${formattedDomain}`).equalTo(true).once("value");

    if (!snapshot.exists()) {
        throw new functions.https.HttpsError("permission-denied", I18N_STRINGS.errors.domain_not_authorized);
    }

    const centersData = snapshot.val();
    const centerId = Object.keys(centersData)[0];

    if (centersData[centerId].is_active !== true) {
        throw new functions.https.HttpsError("unavailable", I18N_STRINGS.errors.center_inactive);
    }

    let uid: string | null = null;

    try {
        // 3. Crear usuario en Auth
        const userRecord = await admin.auth().createUser({
            email: email,
            password: password,
            displayName: name,
        });
        uid = userRecord.uid;

        // 4. Preparar el perfil de usuario.
        // SEGURIDAD: Forzamos el rol 'student' independientemente de lo que envíe el cliente.
        const newUserProfile = {
            id: uid,
            center_id: centerId,
            role: "student", // Único rol permitido en auto-registro
            email: email,
            name: name,
            photo_path: "",
            settings: {
                language: request.data.language || "es", // Default to ES if not provided
                push_notifications: true,
                dark_mode: false
            },
            created_at: admin.database.ServerValue.TIMESTAMP,
            updated_at: admin.database.ServerValue.TIMESTAMP,
            is_deleted: false
        };

        // 5. Intentar escribir en la base de datos
        await db.ref(`users/${uid}`).set(newUserProfile);

        return { success: true, uid: uid };

    } catch (error: any) {
        // 6. MECANISMO DE ROLLBACK
        if (uid) {
            console.warn(`[ROLLBACK] Falló la escritura en RTDB para el UID ${uid}. Eliminando de Auth...`);
            try {
                await admin.auth().deleteUser(uid);
                console.log(`[ROLLBACK EXITOSO] Usuario ${uid} eliminado de Auth.`);
            } catch (rollbackError) {
                console.error(`[CRÍTICO] Fallo catastrófico en el rollback para UID ${uid}:`, rollbackError);
            }
        }

        // Determinar si el error fue por email duplicado o fallo de servidor
        if (error.code === "auth/email-already-exists") {
            throw new functions.https.HttpsError("already-exists", I18N_STRINGS.errors.email_already_exists);
        }

        throw new functions.https.HttpsError("internal", I18N_STRINGS.errors.internal_error);
    }
});
