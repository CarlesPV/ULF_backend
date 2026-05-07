import { onSchedule } from "firebase-functions/v2/scheduler";
import { admin } from "../shared/firebase";

/**
 * Elimina a todos los usuarios que llevan más de 48 horas registrados y no han verificado su correo electrónico.
 */
export const purgeUnverifiedAccounts = onSchedule({
    schedule: "0 2 * * *", // Cron format: a las 2:00 AM todos los días
    timeZone: "Europe/Madrid"
}, async (event) => {
    const auth = admin.auth();
    const db = admin.database();
    const UNVERIFIED_TTL = 48 * 60 * 60 * 1000; // 48 horas
    const now = Date.now();

    let nextPageToken: string | undefined;
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
    } catch (error) {
        console.error("Error crítico purgado usuarios:", error);
    }
});
