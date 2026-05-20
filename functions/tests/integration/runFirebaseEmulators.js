const { spawn } = require("child_process");
const path = require("path");

const functionsDir = path.resolve(__dirname, "../..");
const repoRoot = path.resolve(functionsDir, "..");

// En Windows es más fiable invocar el binario JS directamente que pasar por firebase.cmd.
const firebaseBin = path.join(
  functionsDir,
  "node_modules",
  "firebase-tools",
  "lib",
  "bin",
  "firebase.js"
);
const child = spawn(process.execPath, [
  firebaseBin,
  "emulators:exec",
  "--project",
  "demo-ulf",
  "--only",
  "auth,database,functions,storage",
  "cd functions && node node_modules/jest/bin/jest.js --config jest.integration.config.js --runInBand --forceExit"
], {
  cwd: repoRoot,
  env: process.env,
  stdio: "inherit"
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code || 0);
});
