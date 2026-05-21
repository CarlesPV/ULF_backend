import * as functions from "firebase-functions";
import { admin, db } from "../shared/firebase";
import { I18N_STRINGS } from "../shared/i18n";
import { RegistrationPayload, SupportedLanguage } from "../shared/types";

/**
 * Registro seguro de usuarios en centros universitarios autorizados.
 * 
 * Esta función de Cloud Call realiza las siguientes validaciones y acciones:
 * 1. Valida los datos recibidos (correo, contraseña y nombre).
 * 2. Extrae el dominio del correo y verifica que corresponda a un centro educativo autorizado y activo.
 * 3. Crea el registro de usuario en Firebase Authentication.
 * 4. Inicializa el perfil de usuario en Realtime Database con el rol restrictivo 'student' por motivos de seguridad.
 * 5. Si ocurre un fallo al escribir en la base de datos, ejecuta un mecanismo de rollback eliminando el usuario creado en Firebase Auth.
 * 
 * @param request - Objeto de petición que contiene los datos del usuario:
 *   - email: Correo institucional del usuario.
 *   - password: Contraseña para la nueva cuenta.
 *   - name: Nombre completo del usuario.
 *   - language: (Opcional) Idioma de preferencia del usuario ("es", "ca", "en"). Por defecto "es".
 * 
 * @returns Un objeto que indica el éxito de la operación y el identificador único (uid) del usuario creado.
 * 
 * @throws {HttpsError}
 *   - 'invalid-argument': Si faltan campos obligatorios o el formato de correo es incorrecto.
 *   - 'permission-denied': Si el dominio de correo no pertenece a ningún centro universitario autorizado.
 *   - 'unavailable': Si el centro asociado al dominio se encuentra inactivo.
 *   - 'already-exists': Si el correo electrónico ya está registrado en el sistema.
 *   - 'internal': Si ocurre algún error inesperado en el servidor durante el proceso.
 */
export const secureUniversityRegistration = functions.https.onCall(async (request) => {
    const data = request.data as RegistrationPayload;
    const { email, password, name, preferredLanguage, language, termsAccepted, privacyAccepted } = data;

    if (!email || !password || !name) {
        throw new functions.https.HttpsError("invalid-argument", I18N_STRINGS.errors.incomplete_data);
    }

    if (termsAccepted !== true || privacyAccepted !== true) {
        throw new functions.https.HttpsError("invalid-argument", I18N_STRINGS.errors.legal_acceptance_required);
    }

    // Validar de forma estricta el idioma preferido
    const inputLang = preferredLanguage || language;
    let finalLanguage: SupportedLanguage = "es";

    if (inputLang) {
        if (inputLang === "es" || inputLang === "en" || inputLang === "ca") {
            finalLanguage = inputLang;
        } else {
            throw new functions.https.HttpsError("invalid-argument", I18N_STRINGS.errors.invalid_language);
        }
    }

    // Validar el formato del dominio del correo electrónico institucional
    const domain = email.split("@")[1];
    if (!domain) {
        throw new functions.https.HttpsError("invalid-argument", I18N_STRINGS.errors.invalid_argument);
    }
    const formattedDomain = domain.replace(/\./g, "_");

    // Comprobar la existencia del centro y que su estado esté activo
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
        // Crear el usuario en Firebase Authentication
        const userRecord = await admin.auth().createUser({
            email: email,
            password: password,
            displayName: name,
        });
        uid = userRecord.uid;

        // Preparar el perfil de usuario que se almacenará en Realtime Database.
        // SEGURIDAD: Se fuerza el rol 'student' por defecto para evitar escalación de privilegios en el auto-registro.
        const newUserProfile = {
            id: uid,
            center_id: centerId,
            role: "student",
            email: email,
            name: name,
            photo_path: "",
            settings: {
                language: finalLanguage,
                pushNotificationsEnabled: true,
                push_notifications: true,
                dark_mode: false
            },
            legal: {
                termsAccepted: true,
                privacyAccepted: true,
                acceptedAt: admin.database.ServerValue.TIMESTAMP
            },
            created_at: admin.database.ServerValue.TIMESTAMP,
            updated_at: admin.database.ServerValue.TIMESTAMP,
            is_deleted: false
        };

        // Escribir el perfil del usuario en Realtime Database
        await db.ref(`users/${uid}`).set(newUserProfile);

        return { success: true, uid: uid };

    } catch (error: any) {
        // MECANISMO DE ROLLBACK: Si la inserción en la base de datos falla, se elimina el usuario de Firebase Authentication
        // para garantizar la consistencia atómica entre Auth y Realtime Database.
        if (uid) {
            console.warn(`[ROLLBACK] Falló la escritura en RTDB para el UID ${uid}. Eliminando de Auth...`);
            try {
                await admin.auth().deleteUser(uid);
                console.log(`[ROLLBACK EXITOSO] Usuario ${uid} eliminado de Auth.`);
            } catch (rollbackError) {
                console.error(`[CRÍTICO] Fallo catastrófico en el rollback para UID ${uid}:`, rollbackError);
            }
        }

        // Determinar si el error fue por correo duplicado o un fallo general
        if (error.code === "auth/email-already-exists") {
            throw new functions.https.HttpsError("already-exists", I18N_STRINGS.errors.email_already_exists);
        }

        throw new functions.https.HttpsError("internal", I18N_STRINGS.errors.internal_error);
    }
});
