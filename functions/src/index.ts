import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

admin.initializeApp();
const db = admin.database();

// Función segura para el registro de usuarios en universidades
export const secureUniversityRegistration = functions.https.onCall(async (request) => {
    const { email, password, name } = request.data;

    if (!email || !password || !name) {
        throw new functions.https.HttpsError("invalid-argument", "Datos incompletos.");
    }

    // 1. Validar dominio
    const domain = email.split('@')[1];
    if (!domain) {
        throw new functions.https.HttpsError("invalid-argument", "Email inválido.");
    }
    const formattedDomain = domain.replace(/\./g, '_');

    // 2. Comprobar existencia y estado del centro
    const centersRef = db.ref('centers');
    const snapshot = await centersRef.orderByChild(`email_domains/${formattedDomain}`).equalTo(true).once('value');

    if (!snapshot.exists()) {
        throw new functions.https.HttpsError("permission-denied", "Dominio no autorizado.");
    }

    const centersData = snapshot.val();
    const centerId = Object.keys(centersData)[0];
    
    if (centersData[centerId].is_active !== true) {
        throw new functions.https.HttpsError("unavailable", "El centro está inactivo.");
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
            role: 'student', // Único rol permitido en auto-registro
            email: email,
            name: name,
            photo_path: '',
            settings: {
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
        if (error.code === 'auth/email-already-exists') {
            throw new functions.https.HttpsError("already-exists", "El correo ya está registrado.");
        }

        throw new functions.https.HttpsError("internal", "Error de sistema al crear la cuenta. Intente nuevamente.");
    }
});

// Función para verificar posibles coincidencias entre publicaciones de objetos perdidos y encontrados
export const checkPotentialMatches = functions.https.onCall(async (request) => {
    const { center_id, category, type, color } = request.data;
    
    if (!center_id || !category || !type) {
        throw new functions.https.HttpsError("invalid-argument", "Faltan criterios de búsqueda.");
    }

    // Buscamos el tipo opuesto
    const targetType = (type === 'found') ? 'lost' : 'found';
    
    const postsRef = admin.database().ref('posts');
    
    // Filtro por centro
    const snapshot = await postsRef.orderByChild('center_id').equalTo(center_id).once('value');
    
    if (!snapshot.exists()) return { matches: [] };

    const allPosts = snapshot.val();
    const potentialMatches: any[] = [];

    // Fase de refinamiento en memoria
    for (const id in allPosts) {
        const post = allPosts[id];
        
        if (
            post.status === 'active' &&
            post.type === targetType &&
            post.category === category &&
            post.is_deleted === false
        ) {
            // Cálculo de relevancia básico: coincidencia de categoría y tipo = 1.0
            let score = 1.0; 
            
            // Si el color coincide, aumentamos la confianza
            if (color && post.description?.toLowerCase().includes(color.toLowerCase())) {
                score += 0.5;
            }

            potentialMatches.push({
                id: post.id,
                title: post.title,
                score: score,
                photo_path: post.photo_path
            });
        }
    }

    // Devolvemos los 5 mejores resultados ordenados por relevancia
    return {
        matches: potentialMatches.sort((a, b) => b.score - a.score).slice(0, 5)
    };
});