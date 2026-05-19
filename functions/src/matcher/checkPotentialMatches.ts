import * as functions from "firebase-functions";
import { admin } from "../shared/firebase";
import { DEFAULT_LANGUAGE, translateText } from "../shared/translate";
import { I18N_STRINGS } from "../shared/i18n";

/**
 * Algoritmo de emparejamiento semántico para encontrar coincidencias potenciales entre objetos perdidos y encontrados.
 * 
 * Esta función de Cloud Call realiza las siguientes acciones ordenadas y seguras:
 * 1. Valida la autenticación y que el correo del usuario solicitante esté debidamente verificado.
 * 2. Valida la presencia de parámetros obligatorios (`center_id`, `category`, `type`).
 * 3. Determina el tipo de objeto opuesto a buscar (`found` busca `lost` y viceversa).
 * 4. Obtiene concurrentemente desde `/active_posts/{center_id}` solo los posts actualmente activos del centro educativo.
 * 5. Soporte multiidioma (i18n): Traduce los términos de búsqueda recopilados del post origen (`color` y `description`)
 *    a un idioma base unificado para evitar falsos negativos debidos al idioma de registro.
 * 6. Algoritmo de Puntuación (Scoring):
 *    - Inicializa una puntuación base de `1.0` si el post objetivo coincide en tipo y categoría.
 *    - Divide la descripción del post origen en palabras clave significativas.
 *    - Incrementa el score en `0.5` por cada palabra clave que se localice dentro de la descripción (o traducción) del post destino.
 * 7. Ordena los emparejamientos de mayor a menor puntuación y retorna las 5 mejores coincidencias sugeridas.
 * 
 * @param request - Objeto de petición que contiene los datos del post recién creado:
 *   - center_id: Identificador único del centro educativo.
 *   - category: Categoría del objeto (ej. "tecnologia", "ropa").
 *   - type: Tipo de publicación original ("lost" o "found").
 *   - color: (Opcional) Color característico del objeto.
 *   - description: (Opcional) Descripción detallada del objeto para el procesamiento lingüístico.
 * 
 * @returns Un objeto con la lista (`matches`) de los posts coincidentes ordenada por relevancia y limitada a 5 elementos.
 * 
 * @throws {HttpsError}
 *   - 'permission-denied': Si el solicitante no tiene el correo verificado.
 *   - 'invalid-argument': Si faltan los campos estructurales mandatorios.
 */
export const checkPotentialMatches = functions.https.onCall(async (request) => {
    const { center_id, category, type, color, description, title } = request.data;

    if (!request.auth || !request.auth.token.email_verified) {
        throw new functions.https.HttpsError("permission-denied", I18N_STRINGS.errors.unverified_email);
    }
    if (!center_id || !category || !type) {
        throw new functions.https.HttpsError("invalid-argument", I18N_STRINGS.errors.incomplete_data);
    }

    // Buscar objetos en la categoría contraria para emparejamiento
    const targetType = (type === "found") ? "lost" : "found";

    // Consultar identificadores de posts activos usando el índice secundario del centro filtrado por tipo objetivo
    const activeRefs = await admin.database().ref(`active_posts/${center_id}/${targetType}`).once("value");
    if (!activeRefs.exists()) return { matches: [] };

    const activeIds = Object.keys(activeRefs.val());

    // Obtener los datos completos de los posts de forma paralela y eficiente
    const postPromises = activeIds.map(id => admin.database().ref(`posts/${id}`).once("value"));
    const postSnapshots = await Promise.all(postPromises);

    // Preparar términos lingüísticos y traducción automática al idioma unificado del backend
    let searchTerms = `${title || ""} ${color || ""} ${description || ""}`.trim();
    let searchWords: string[] = [];
    
    if (searchTerms !== "") {
        let translation = searchTerms;
        try {
            translation = await translateText(searchTerms, DEFAULT_LANGUAGE);
        } catch (error) {
            console.error("Error en traducción:", error);
        }
        const stopWords = new Set(["the", "and", "for", "but", "not", "con", "del", "una", "los", "las", "por", "que", "els", "les", "per", "sus", "com", "out", "you", "him", "her", "its", "our", "are", "was", "has", "had", "bin"]);
        searchWords = translation.toLowerCase().split(/\s+/).filter((w: string) => w.length > 2 && !stopWords.has(w));
    }

    // Filtrado semántico y cálculo de puntuación (Scoring)
    const potentialMatches: any[] = [];
    
    for (const snap of postSnapshots) {
        if (!snap.exists()) continue;
        const post = snap.val();

        if (post.type === targetType && post.category === category && !post.is_deleted) {
            let score = 1.0;
            const targetDesc = `${post.title || ""} ${post.translated_description || post.description?.toLowerCase() || ""}`.toLowerCase();

            if (searchWords.length > 0 && targetDesc) {
                let matchCount = 0;
                for (const word of searchWords) {
                    if (targetDesc.includes(word)) matchCount++;
                }
                // Peso incremental por cada coincidencia de palabra clave
                score += (matchCount * 0.5);
            }

            potentialMatches.push({
                id: post.id,
                title: post.title,
                description: post.description,
                score: score,
                photo_path: post.photo_path,
                postImageUrl: post.postImageUrl || post.imageUrl || post.photo_url || "",
                created_at: post.created_at || post.date || 0
            });
        }
    }

    // Retornar las 5 coincidencias de mayor relevancia (más recientes en caso de empate)
    return { 
        matches: potentialMatches
            .sort((a, b) => {
                if (b.score !== a.score) return b.score - a.score;
                return (b.created_at || 0) - (a.created_at || 0);
            })
            .slice(0, 5)
            .map(({ created_at, ...rest }) => rest)
    };
});