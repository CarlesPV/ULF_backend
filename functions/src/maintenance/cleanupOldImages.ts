import { onSchedule } from "firebase-functions/v2/scheduler";
import { admin } from "../shared/firebase";
import { deleteStorageFileFromUrl } from "../posts/postTriggers";

/**
 * Tarea programada (Scheduled Cloud Function) para limpiar imágenes huérfanas en Storage.
 *
 * Se ejecuta cada hora (formato cron "0 * * * *").
 * Busca documentos en la colección `pending_image_deletions` de Firestore donde la fecha planificada
 * de borrado `scheduledDeletionTime` sea menor o igual al momento actual, borra la imagen correspondiente
 * de Storage y, tras esto, elimina el registro de Firestore de manera atómica.
 */
export const cleanupOldImages = onSchedule({
    schedule: "0 * * * *", // Cada hora
    timeZone: "Europe/Madrid"
}, async (event) => {
    try {
        const firestore = admin.firestore();
        const now = admin.firestore.Timestamp.now();

        const snapshot = await firestore
            .collection("pending_image_deletions")
            .where("scheduledDeletionTime", "<=", now)
            .get();

        if (snapshot.empty) {
            console.log("[Mantenimiento Imágenes] No hay imágenes pendientes de borrar.");
            return;
        }

        let deletedCount = 0;
        const deletePromises: Promise<any>[] = [];

        snapshot.forEach((doc) => {
            const data = doc.data();
            const imageUrl = data.imageUrl;

            if (imageUrl) {
                const deleteFlow = deleteStorageFileFromUrl(imageUrl)
                    .then(() => doc.ref.delete())
                    .then(() => {
                        deletedCount++;
                    })
                    .catch((err) => {
                        console.error(`[Mantenimiento Imágenes Error] Error al procesar documento ${doc.id}:`, err);
                    });
                deletePromises.push(deleteFlow);
            } else {
                deletePromises.push(doc.ref.delete());
            }
        });

        await Promise.all(deletePromises);
        console.log(`[Mantenimiento Imágenes] Limpieza completada. Cuentas/imágenes eliminadas: ${deletedCount}`);
    } catch (error) {
        console.error("[Mantenimiento Imágenes Error] Error crítico en tarea de limpieza:", error);
    }
});
