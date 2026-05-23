import { onSchedule } from "firebase-functions/v2/scheduler";
import { admin } from "../shared/firebase";

/**
 * Tarea programada (Scheduled Cloud Function) para limpiar cuentas inactivas y no verificadas.
 * 
 * Se ejecuta diariamente a las 2:00 AM (Zona horaria de Europa/Madrid).
 * Su propósito es auditar periódicamente los registros y eliminar de forma atómica:
 * 1. La cuenta del usuario de Firebase Authentication si lleva más de 48 horas registrada sin que se haya verificado su dirección de correo institucional.
 * 2. Su perfil e información persistida asociada en Realtime Database.
 * 
 * Esto previene la acumulación de cuentas huérfanas o fraudulentas y optimiza el almacenamiento de la base de datos.
 * 
 * @param event - Evento programado de Firebase Scheduler v2.
 */
export const purgeUnverifiedAccounts = onSchedule({
    schedule: "0 2 * * *", // Formato Cron: Todos los días a las 02:00 AM
    timeZone: "Europe/Madrid"
}, async (event) => {
    const auth = admin.auth();
    const db = admin.database();
    const UNVERIFIED_TTL = 48 * 60 * 60 * 1000; // Periodo de gracia de 48 horas
    const now = Date.now();

    let nextPageToken: string | undefined;
    let deletedCount = 0;

    try {
        do {
            // Listar usuarios en lotes de hasta 1000 para optimizar el consumo de memoria
            const listUsersResult = await auth.listUsers(1000, nextPageToken);
            const uidsToDelete: string[] = [];

            for (const userRecord of listUsersResult.users) {
                const creationTime = new Date(userRecord.metadata.creationTime).getTime();
                const isExpired = (now - creationTime) > UNVERIFIED_TTL;

                if (!userRecord.emailVerified && isExpired) {
                    uidsToDelete.push(userRecord.uid);
                }
            }

            if (uidsToDelete.length > 0) {
                // Eliminar a los usuarios del sistema de autenticación de Firebase en un solo lote (límite 1000 por llamada)
                await auth.deleteUsers(uidsToDelete);

                // Eliminar de forma sincronizada los registros de perfil en Realtime Database mediante una actualización multirruta
                const updates: { [key: string]: null } = {};
                for (const uid of uidsToDelete) {
                    updates[`users/${uid}`] = null;
                }
                await db.ref().update(updates);

                deletedCount += uidsToDelete.length;
            }

            nextPageToken = listUsersResult.pageToken;
        } while (nextPageToken);

        console.log(`Purga de mantenimiento finalizada. Cuentas obsoletas eliminadas: ${deletedCount}`);
    } catch (error) {
        console.error("Error crítico purgado usuarios:", error);
    }
});
