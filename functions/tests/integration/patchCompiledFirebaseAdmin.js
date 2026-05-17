const fs = require("fs");
const path = require("path");

const libDir = path.resolve(__dirname, "../../lib");
const firebaseFile = path.join(libDir, "shared", "firebase.js");

// El emulador con firebase-functions v7 no siempre expone ServerValue en el namespace antiguo.
// Parcheamos solo el compilado generado en lib/ para no tocar el código fuente de producción.
const patch = [
  "const { ServerValue } = require(\"firebase-admin/database\");",
  "if (!admin.database.ServerValue) {",
  "    admin.database.ServerValue = ServerValue;",
  "}",
  ""
].join("\r\n");

let source = fs.readFileSync(firebaseFile, "utf8");

if (!source.includes("admin.database.ServerValue = ServerValue")) {
  source = source.replace(
    /(const db = admin\.database\(\);\r?\n)/,
    `$1${patch}`
  );
  fs.writeFileSync(firebaseFile, source);
}

function patchServerValueUsages(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      patchServerValueUsages(entryPath);
      continue;
    }

    if (!entry.name.endsWith(".js")) continue;

    let fileSource = fs.readFileSync(entryPath, "utf8");
    // Algunas funciones compiladas ya tienen la referencia inline, así que también la normalizamos.
    const patched = fileSource.replace(
      /[A-Za-z0-9_$.]+\.database\.ServerValue\.TIMESTAMP/g,
      "require(\"firebase-admin/database\").ServerValue.TIMESTAMP"
    );

    if (patched !== fileSource) {
      fs.writeFileSync(entryPath, patched);
    }
  }
}

patchServerValueUsages(libDir);
