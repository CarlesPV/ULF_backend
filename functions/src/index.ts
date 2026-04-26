import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as geofire from "geofire-common";
import { v2 as translate } from '@google-cloud/translate';

admin.initializeApp();
const db = admin.database();

// Inicializar el cliente de traducción
const translateClient = new translate.Translate();
const TARGET_LANGUAGE = 'en'; // Idioma común para indexar descripciones

/*
    Función segura para el registro de usuarios en universidades
*/
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

/*
    NUEVO TRIGGER: Traducir la descripción automáticamente al crear un post
    Se ejecuta cada vez que se crea un nuevo post en /posts/{postId}
*/
export const onPostCreated = functions.database.ref('/posts/{postId}')
    .onCreate(async (snapshot, context) => {
        const post = snapshot.val();
        
        // Si no hay descripción, no hacemos nada
        if (!post.description) return null;

        try {
            // Traducir al idioma común (inglés)
            const [translation] = await translateClient.translate(post.description, TARGET_LANGUAGE);
            
            // Guardar la descripción traducida en la RTDB en minúsculas para búsquedas
            return snapshot.ref.update({
                translated_description: translation.toLowerCase()
            });
        } catch (error) {
            console.error(`Error traduciendo el post ${context.params.postId}:`, error);
            return null;
        }
    });

/*
    Función para verificar posibles coincidencias entre publicaciones de objetos perdidos y encontrados
    VERSIÓN MEJORADA: Ahora busca coincidencias basadas en descripciones traducidas (multiidioma)
*/
export const checkPotentialMatches = functions.https.onCall(async (request) => {
    const { center_id, category, type, color, description } = request.data;
    
    if (!center_id || !category || !type) {
        throw new functions.https.HttpsError("invalid-argument", "Faltan criterios de búsqueda.");
    }

    const targetType = (type === 'found') ? 'lost' : 'found';
    const postsRef = admin.database().ref('posts');
    const snapshot = await postsRef.orderByChild('center_id').equalTo(center_id).once('value');
    
    if (!snapshot.exists()) return { matches: [] };

    const allPosts = snapshot.val();
    const potentialMatches: any[] = [];

    // 1. Unir el color y la descripción de búsqueda
    let searchTerms = "";
    if (color) searchTerms += color + " ";
    if (description) searchTerms += description;

    // 2. Traducir los términos de búsqueda al idioma común
    let searchWords: string[] = [];
    if (searchTerms.trim() !== "") {
        try {
            const [translation] = await translateClient.translate(searchTerms.trim(), TARGET_LANGUAGE);
            // Dividir en palabras y filtrar palabras muy cortas (conectores)
            searchWords = translation.toLowerCase().split(/\s+/).filter(w => w.length > 3);
        } catch (error) {
            console.error("Error en la traducción en tiempo real:", error);
            // Fallback: usar los términos originales si falla la API
            searchWords = searchTerms.toLowerCase().split(/\s+/).filter(w => w.length > 3);
        }
    }

    // 3. Fase de refinamiento en memoria
    for (const id in allPosts) {
        const post = allPosts[id];
        
        if (
            post.status === 'active' &&
            post.type === targetType &&
            post.category === category &&
            post.is_deleted === false
        ) {
            // Relevancia base
            let score = 1.0; 
            
            // Evaluamos coincidencias contra la descripción ya traducida del post
            const targetDesc = post.translated_description || post.description?.toLowerCase() || "";
            
            if (searchWords.length > 0 && targetDesc) {
                let matchCount = 0;
                for (const word of searchWords) {
                    if (targetDesc.includes(word)) {
                        matchCount++;
                    }
                }
                // Aumentamos el score de forma proporcional a las palabras que hicieron "match"
                score += (matchCount * 0.5); 
            }

            potentialMatches.push({
                id: post.id,
                title: post.title,
                score: score,
                photo_path: post.photo_path
            });
        }
    }

    return {
        matches: potentialMatches.sort((a, b) => b.score - a.score).slice(0, 5)
    };
});

/*
    Función para crear un nuevo reporte de objeto perdido o encontrado.
*/
// Definimos una interfaz para el payload esperado
interface PostReportPayload {
    center_id: string;
    type: 'lost' | 'found';
    title: string;
    description?: string;
    category: string;
    lat: number;
    lng: number;
    photo_path?: string;
}

export const createPostReport = functions.https.onCall(async (request) => {
    // 1. Validación de Autenticación usando el objeto 'request'
    if (!request.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Debes iniciar sesión.");
    }

    // 2. Casteo de los datos a nuestra interfaz definida para mayor seguridad y claridad
    const data = request.data as PostReportPayload;
    const uid = request.auth.uid;

    const { center_id, type, title, description, category, lat, lng, photo_path } = data;

    // 3. Validación de datos mínimos requeridos
    if (!center_id || !type || !category || !title || lat === undefined || lng === undefined) {
        throw new functions.https.HttpsError("invalid-argument", "Datos incompletos para el reporte.");
    }

    // 4. Generar Geohash para futuras consultas espaciales
    const geohash = geofire.geohashForLocation([lat, lng]);

    const postsRef = admin.database().ref('posts');
    const newPostRef = postsRef.push();
    const postId = newPostRef.key;

    const payload = {
        id: postId,
        user_id: uid,
        center_id: center_id,
        type: type, // 'lost' o 'found'
        title: title,
        description: description || "",
        category: category,
        status: "active",
        coords: {
            lat: lat,
            lng: lng,
            geohash: geohash
        },
        photo_path: photo_path || "",
        created_at: admin.database.ServerValue.TIMESTAMP,
        updated_at: admin.database.ServerValue.TIMESTAMP,
        is_deleted: false
    };

    try {
        await newPostRef.set(payload);
        return { success: true, post_id: postId };
    } catch (error) {
        console.error("Error guardando post:", error);
        throw new functions.https.HttpsError("internal", "Error al procesar el reporte.");
    }
});