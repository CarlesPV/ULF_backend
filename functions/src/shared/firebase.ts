import * as admin from "firebase-admin";

admin.initializeApp();

const db = admin.database();

export { admin, db };
