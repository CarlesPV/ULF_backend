import { onSchedule } from "firebase-functions/v2/scheduler";
import { admin } from "../shared/firebase";

/**
 * Tarea programada (Scheduled Cloud Function) para limpiar de forma diferida las imágenes antiguas.
 * Se ejecuta cada 30 minutos.
 * 
 * Lee la colección/nodo `/scheduled_deletions` de Realtime Database, filtra los documentos
 * donde `deleteAt <= now`, borra los correspondientes archivos de Storage y luego elimina los registros.
 */
export const cleanScheduledDeletions = onSchedule({
    schedule: "*/30 * * * *", // Cada 30 minutos
    timeZone: "Europe/Madrid"
}, async (event) => {
    const db = admin.database();
    const deletionsRef = db.ref("scheduled_deletions");
    const now = Date.now();

    try {
        const expiredSnap = await deletionsRef
            .orderByChild("deleteAt")
            .endAt(now)
            .once("value");

        if (!expiredSnap.exists()) {
            console.log("[Scheduled Cleanup] No hay imágenes programadas para borrar.");
            return;
        }

        const deletions = expiredSnap.val();
        const bucket = admin.storage().bucket();
        const promises = Object.keys(deletions).map(async (key) => {
            const record = deletions[key];
            const filePath = record.path;

            if (filePath) {
                try {
                    const file = bucket.file(filePath);
                    const [exists] = await file.exists();
                    if (exists) {
                        await file.delete();
                        console.log(`[Scheduled Cleanup] Archivo eliminado con éxito de Storage: ${filePath}`);
                    } else {
                        console.warn(`[Scheduled Cleanup] El archivo no existe en Storage: ${filePath}`);
                    }
                } catch (storageError) {
                    console.error(`[Scheduled Cleanup Error] Error borrando el archivo ${filePath}:`, storageError);
                }
            }

            // Eliminar el registro del nodo independientemente de si el archivo existía o no para evitar reintentos infinitos
            await deletionsRef.child(key).remove();
        });

        await Promise.all(promises);
        console.log(`[Scheduled Cleanup] Limpieza finalizada. Registros procesados: ${Object.keys(deletions).length}`);
    } catch (error) {
        console.error("[Scheduled Cleanup Error] Error crítico en proceso de limpieza:", error);
    }
});
