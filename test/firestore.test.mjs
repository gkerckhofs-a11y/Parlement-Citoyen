import { createRequire } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";
import { create, act, view } from "../functions/engine.mjs";
import { demo } from "../functions/scenario.mjs";
test(
  "Firestore · 150 accès élèves, quatre votes simultanés, dépêche, article et renvois",
  { skip: !process.env.FIRESTORE_EMULATOR_HOST, timeout: 120000 },
  async () => {
    const require = createRequire(
      new URL("../functions/package.json", import.meta.url),
    );
    const { initializeApp, deleteApp } = require("firebase-admin/app");
    const { getFirestore } = require("firebase-admin/firestore");
    const { firestoreStore } = await import("../functions/firestore.mjs");
    const app = initializeApp({ projectId: "demo-parlement" }, "integration");
    const db = getFirestore(app),
      store = firestoreStore(db);
    try {
      const s = create(structuredClone(demo), 150),
        admin = s.members.REG;
      act(s, admin, { type: "phase" });
      for (const room of Object.keys(s.rooms))
        act(s, admin, { type: "open", kind: "opinion", measure:room + "1", room });
      await store.create(s);
      const change = (id, x) =>
        store.change(s.code, (state) => {
          act(state, state.members[id], x);
          return true;
        });
      const writes = Object.values(s.members)
        .filter((m) => m.group)
        .map((m) => {
          if (m.role === "Citoyen")
            return change(m.id, {
              type: "vote",
              poll: s.polls.find((p) => p.room === m.room).id,
              choices: ["pour"],
            });
          if (m.id === "J1")
            return change(m.id, {
              type: "article",
              title: "Édition spéciale",
              text: "Texte de répétition",
              publish: true,
            });
          return change(m.id, { type: "message", text: "Présent en salle" });
        });
      await Promise.all([
        ...writes,
        change("REG", { type: "wire", id: "D01" }),
        change("C1", {
          type: "vote",
          poll: s.polls[0].id,
          choices: ["pour"],
        }),
      ]);
      let restored = await store.get(s.code);
      assert.equal(
        restored.polls.reduce((n, p) => n + Object.keys(p.receipts).length, 0),
        105,
      );
      assert.equal(view(restored, restored.members.C1).wallet.points, 1);
      assert.equal(restored.articles.length, 1);
      assert.equal(restored.dispatches.length, 1);
      let article = restored.articles[0].id;
      await Promise.all(
        Array.from({ length: 10 }, () =>
          change("C1", { type: "read", id: article }),
        ),
      );
      let reads = await store.get(s.code);
      assert.equal(Object.keys(reads.articles[0].opens).length, 1);
      assert.ok(view(reads, reads.members.C1).polls[0].voted);
    } finally {
      await db.terminate();
      await deleteApp(app);
    }
  },
);
