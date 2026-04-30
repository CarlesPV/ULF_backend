import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as geofire from "geofire-common";
import { v2 as translate } from '@google-cloud/translate';
import { onValueCreated, onValueUpdated, onValueDeleted } from "firebase-functions/v2/database";

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
    TRIGGER: Al crear un post:
      - Lo añade al índice /active_posts/{center_id}/{post_id} si está activo.
      - Traduce su descripción a un idioma común para búsquedas multiidioma.
    Ambas tareas son independientes: si la traducción falla, el post sigue indexado.
*/
export const onPostCreated = onValueCreated('/posts/{postId}', async (event: any) => {
    const snapshot = event.data;
    const post = snapshot.val();
    if (!post?.center_id) return null;

    const tasks: Promise<any>[] = [];

    if (post.status === 'active' && post.is_deleted === false) {
        tasks.push(
            admin.database()
                .ref(`active_posts/${post.center_id}/${event.params.postId}`)
                .set(post.created_at)
        );
    }

    if (post.description) {
        tasks.push(
            translateClient.translate(post.description, TARGET_LANGUAGE)
                .then(([translation]: [string, any]) => snapshot.ref.update({
                    translated_description: translation.toLowerCase()
                }))
                .catch((error: any) => {
                    console.error(`Error traduciendo el post ${event.params.postId}:`, error);
                })
        );
    }

    await Promise.all(tasks);
    return null;
});

/*
    TRIGGER: Mantiene el índice /active_posts/{center_id}/{post_id} sincronizado.
    Cuando un post cambia de estado (matched, returned) o se borra lógicamente,
    se elimina del índice. Así getFilteredFeed solo escanea posts activos.
*/
export const onPostUpdated = onValueUpdated('/posts/{postId}', async (event: any) => {
    const after = event.data.after.val();
    if (!after?.center_id) return null;

    const indexRef = admin.database().ref(`active_posts/${after.center_id}/${event.params.postId}`);
    const isActive = after.status === 'active' && after.is_deleted === false;

    return isActive ? indexRef.set(after.created_at) : indexRef.remove();
});

/*
    TRIGGER: Limpia el índice /active_posts cuando un post se borra físicamente,
    evitando entradas huérfanas que apunten a posts ya inexistentes.
*/
export const onPostDeleted = onValueDeleted('/posts/{postId}', async (event: any) => {
    const before = event.data.val();
    if (!before?.center_id) return null;

    return admin.database()
        .ref(`active_posts/${before.center_id}/${event.params.postId}`)
        .remove();
});

/*
    Función para verificar posibles coincidencias entre publicaciones de objetos perdidos y encontrados
    VERSIÓN MEJORADA: Ahora busca coincidencias basadas en descripciones traducidas (multiidioma)
*/
export const checkPotentialMatches = functions.https.onCall(async (request) => {
    const { center_id, category, type, color, description } = request.data;
    
    if (!request.auth || !request.auth.token.email_verified) {
        throw new functions.https.HttpsError("permission-denied", "Debes verificar tu correo para buscar coincidencias.");
    }

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
    if (!request.auth || !request.auth.token.email_verified) {
        throw new functions.https.HttpsError("permission-denied", "Debes verificar tu correo para publicar.");
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

/*
    Función para obtener el feed filtrado por universidad, tipo, categoría y palabras clave.
    Usa el índice /active_posts/{center_id} para escanear solo posts activos,
    evitando cargar el historial acumulado de posts resueltos o eliminados.
*/
interface FeedFilterPayload {
    center_id: string;
    type: 'lost' | 'found';
    category?: string;
    search_term?: string;
    max_results?: number;
    user_lat?: number;
    user_lng?: number;
    sort_by?: 'date' | 'distance';
}

export const getFilteredFeed = functions.https.onCall(async (request: any) => {
    if (!request.auth || !request.auth.token.email_verified) {
        throw new functions.https.HttpsError("permission-denied", "Debes verificar tu correo para ver el feed.");
    }

    const data = request.data as FeedFilterPayload;
    const { center_id, type, category, search_term, max_results = 50, user_lat, user_lng, sort_by } = data;

    if (!center_id || !type) {
        throw new functions.https.HttpsError("invalid-argument", "center_id y type son obligatorios.");
    }

    // 1. Leer solo las keys activas del índice secundario (no los posts completos aún)
    const activeKeysSnap = await admin.database()
        .ref(`active_posts/${center_id}`)
        .once('value');

    if (!activeKeysSnap.exists()) return { feed: [] };

    // 2. Recuperar los posts completos en paralelo usando las keys del índice
    const postIds = Object.keys(activeKeysSnap.val());
    const postFetches = postIds.map(id =>
        admin.database().ref(`posts/${id}`).once('value')
    );
    const postSnaps = await Promise.all(postFetches);

    // 3. Preparar palabras clave traducidas al idioma común para match multiidioma
    let searchWords: string[] = [];
    if (search_term?.trim()) {
        try {
            const [translation] = await translateClient.translate(search_term.trim(), TARGET_LANGUAGE);
            searchWords = translation.toLowerCase().split(/\s+/).filter((w: string) => w.length > 2);
        } catch (error) {
            console.error("Error traduciendo término de búsqueda:", error);
            searchWords = search_term.toLowerCase().split(/\s+/).filter((w: string) => w.length > 2);
        }
    }

    // 4. Filtrado en memoria del servidor
    const filteredPosts: any[] = [];

    for (const snap of postSnaps) {
        if (!snap.exists()) continue;
        const post = snap.val();

        if (post.type !== type) continue;
        if (category && post.category !== category) continue;

        if (searchWords.length > 0) {
            const targetText = `${post.title || ''} ${post.translated_description || post.description || ''}`.toLowerCase();
            const hasMatch = searchWords.some((word: string) => targetText.includes(word));
            if (!hasMatch) continue;
        }

        filteredPosts.push(post);
    }

    // 5. Aplicar ordenamiento según sort_by e inyectar distance_km si es necesario
    let feed: any[] = [];

    if (sort_by === 'distance' && user_lat !== undefined && user_lng !== undefined) {
        // Ordenar por distancia geográfica
        const postsWithDistance = filteredPosts
            .map((post: any) => {
                // Si el post no tiene coords válidas, excluirlo del resultado
                if (!post.coords || post.coords.lat === undefined || post.coords.lng === undefined) {
                    return null;
                }
                const distanceKm = geofire.distanceBetween(
                    [user_lat, user_lng],
                    [post.coords.lat, post.coords.lng]
                );
                return {
                    ...post,
                    distance_km: distanceKm
                };
            })
            .filter((post: any) => post !== null) // Filtrar posts sin coords válidas
            .sort((a: any, b: any) => a.distance_km - b.distance_km)
            .slice(0, max_results);

        feed = postsWithDistance;
    } else {
        // Ordenar por fecha descendente (comportamiento por defecto)
        feed = filteredPosts
            .sort((a, b) => b.created_at - a.created_at)
            .slice(0, max_results);
    }

    return { feed };
});

/**
 * Elimina a todos los usuarios que llevan más de 48 horas registrados y no han verificado su correo electrónico.
 */
export const purgeUnverifiedAccounts = functions.pubsub
    .schedule('0 2 * * *') // Cron format: a las 2:00 AM todos los días
    .timeZone('Europe/Madrid') 
    .onRun(async (context) => {
        const auth = admin.auth();
        const db = admin.database();
        const UNVERIFIED_TTL = 48 * 60 * 60 * 1000; // 48 horas
        const now = Date.now();
        
        let nextPageToken;
        let deletedCount = 0;

        try {
            do {
                const listUsersResult = await auth.listUsers(1000, nextPageToken);
                
                for (const userRecord of listUsersResult.users) {
                    const creationTime = new Date(userRecord.metadata.creationTime).getTime();
                    const isExpired = (now - creationTime) > UNVERIFIED_TTL;

                    if (!userRecord.emailVerified && isExpired) {
                        // 1. Eliminamos de Auth
                        await auth.deleteUser(userRecord.uid);
                        // 2. Eliminamos rastro en RTDB 
                        await db.ref(`users/${userRecord.uid}`).remove();
                        deletedCount++;
                    }
                }
                nextPageToken = listUsersResult.pageToken;
            } while (nextPageToken);

            console.log(`Purga completada. Cuentas eliminadas: ${deletedCount}`);
            return null;
        } catch (error) {
            console.error("Error crítico purgado usuarios:", error);
            return null;
        }
});