import { createHash, timingSafeEqual } from "node:crypto";
import { getAuth } from "firebase-admin/auth";
import { check } from "./scenario.mjs";
import { rehearsal, rehearsals } from "./rehearsal.mjs";
// SHA-256 of the authorised Google mailbox. Keep the address out of the public repository.
const mailbox =
  "aed91afac5b8acb779260be780e683addf6015b8c522499c9c6a07b78b7a34b5";
const digest = (v) => createHash("sha256").update(v).digest("hex");
export async function verifyOrganizer(header) {
  const match = /^Bearer (\S+)$/.exec(header || "");
  check(match, "Connexion Google requise.");
  let claims;
  try {
    claims = await getAuth().verifyIdToken(match[1]);
  } catch {
    throw Error("Session Google expirée. Reconnectez-vous.");
  }
  check(
    claims.email_verified === true &&
      claims.firebase?.sign_in_provider === "google.com" &&
      digest((claims.email || "").toLowerCase()) === mailbox,
    "Ce compte Google n’est pas autorisé en régie.",
  );
}
export async function installRehearsals(store, body) {
  check(
    typeof body.ticket === "string" &&
      digest(body.ticket) ===
        "9e90b60f703983c575186821c8dda54eca8dd8cb020269dcf13dbb490c4d5ba8",
    "Invitation de préparation invalide",
  );
  check(
    digest(JSON.stringify(body.pack)) ===
      "93ca4a0896000a765f87f6a03b6dcc710ffa89012245bb340a71ec1f11080c1a",
    "Scénario de répétition inattendu",
  );
  for (let i = 0; i < rehearsals.length; i++) {
    try {
      await store.create(rehearsal(body.pack, i));
    } catch (e) {
      if (e.code !== 6) throw e;
    }
  }
  return { ready: true, codes: rehearsals.map(([code]) => code) };
}
