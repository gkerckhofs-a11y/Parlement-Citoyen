import fs from "node:fs/promises";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { firestoreStore } from "./firestore.mjs";
import { validate } from "./scenario.mjs";
const [mode, project, code, path] = process.argv.slice(2);
if (
  !["save", "restore"].includes(mode) ||
  !project ||
  !/^[A-F0-9]{10}$/.test(code) ||
  !path
)
  throw Error(
    "Usage : node functions/backup.mjs save|restore PROJET SESSION FICHIER",
  );
const app = initializeApp({ projectId: project }),
  db = getFirestore(app),
  store = firestoreStore(db);
try {
  if (mode === "save") {
    let s = await store.get(code);
    await fs.writeFile(path, JSON.stringify(s), { flag: "wx", mode: 0o600 });
  } else {
    let s = JSON.parse(await fs.readFile(path, "utf8"));
    validate(s.pack);
    if (s.code !== code) throw Error("Session différente");
    await store.create(s);
  }
  console.log("Opération terminée pour " + code);
} finally {
  await db.terminate();
  await deleteApp(app);
}
