import * as admin from "firebase-admin";
import * as fs from "fs";
import * as path from "path";

interface BoundaryCoords {
    lat_min: number;
    lat_max: number;
    lng_min: number;
    lng_max: number;
}

interface Center {
    id: string;
    name: string;
    email_domains: Record<string, true>;
    boundary_coords: BoundaryCoords;
    is_active: boolean;
}

// 1. Validar variables de entorno
const DATABASE_URL = process.env.FIREBASE_DATABASE_URL;
const SERVICE_ACCOUNT_JSON = process.env.FIREBASE_SERVICE_ACCOUNT;

if (!DATABASE_URL || !SERVICE_ACCOUNT_JSON) {
    console.error("[CRÍTICO] Faltan variables de entorno: FIREBASE_DATABASE_URL y/o FIREBASE_SERVICE_ACCOUNT.");
    process.exit(1);
}

// 2. Inicializar Firebase Admin
const serviceAccount = JSON.parse(SERVICE_ACCOUNT_JSON!);

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: DATABASE_URL,
});

const db = admin.database();

// 3. Leer datos de centros desde el fichero local
const centersPath = path.join(__dirname, "data", "centers.json");
const centers: Center[] = JSON.parse(fs.readFileSync(centersPath, "utf-8"));

async function seed() {
    const ref = db.ref("/centers");

    // 4. Insertar o actualizar cada centro (idempotente)
    for (const center of centers) {
        const centerRef = ref.child(center.id);
        const snapshot = await centerRef.get();

        if (!snapshot.exists()) {
            await centerRef.set(center);
            console.log(`[INSERCIÓN EXITOSA] Centro '${center.id}' añadido a la base de datos.`);
        } else {
            await centerRef.update(center);
            console.log(`[ACTUALIZACIÓN EXITOSA] Centro '${center.id}' ya existía, datos actualizados.`);
        }
    }

    process.exit(0);
}

seed().catch((err) => {
    console.error(`[CRÍTICO] Fallo en el seed de la base de datos:`, err);
    process.exit(1);
});
