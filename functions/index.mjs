import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { firestoreStore } from "./firestore.mjs";
import { api as handler } from "./api.mjs";
import { verifyOrganizer, installRehearsals } from "./admin.mjs";
initializeApp();
const db = getFirestore(),
  secret = defineSecret("PARLEMENT_ADMIN_KEY");
const store = firestoreStore(db);
export const parliament = onRequest(
  { region: "europe-west1", secrets: [secret] },
  (req, res) =>
    handler(store, secret.value(), {
      verify: verifyOrganizer,
      install: installRehearsals,
    })(req, res),
);
