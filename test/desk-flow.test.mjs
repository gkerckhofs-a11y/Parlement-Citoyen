import assert from "node:assert/strict";
import test from "node:test";
import { act, create, view } from "../functions/engine.mjs";
import { demo } from "../functions/scenario.mjs";
import { deskFlow } from "../public/desk-flow.js";

// Follow the primary button rendered by the actual desk, not a list of expected server commands.
function primary(state, role, scope) {
  const pilot = view(state, state.members[role]);
  const deck = pilot.presentations[scope || "plenary"];
  const active = pilot.polls.find(
    (p) =>
      (scope
        ? p.room === scope && p.kind !== "plenary"
        : p.kind === "plenary") && !["annoncé", "invalidé"].includes(p.status),
  );
  const actions = [];
  const btn = (label, command) => String(actions.push({ label, command }) - 1);
  const go = (label, slide) =>
    btn(label, { type: "presentSlide", room: scope, slide });
  const html = deskFlow(pilot, deck, active, go, { btn, para: String });
  const encoded = /class="desk-main-action">(\d+)</.exec(html);
  return encoded && actions[Number(encoded[1])];
}

test("Le bouton de conduite ouvre réellement l’urne et ramène au texte suivant après l’annonce", () => {
  const state = create(structuredClone(demo), 50, false, { rulesVersion: 1 });
  const run = (id, command) => act(state, state.members[id], command);
  run("REG", { type: "phase" });
  run("C1", {
    type: "amend",
    measure: "P1",
    text: "Ajouter un atelier de lecture.",
    why: "Lire avec un enseignant.",
  });
  const amend = state.amends[0].id;
  run("C5", { type: "sign", amend });
  run("REG", {
    type: "review",
    amend,
    profile: "P1-A",
    status: "admissible",
    reason: "Clause conforme.",
  });
  const advance = () => {
    const next = primary(state, "MOD-P", "P");
    assert.ok(next, "une commande explicite est disponible");
    run("MOD-P", next.command);
    return next.command;
  };
  assert.equal(advance().slide, "amend-" + amend);
  assert.equal(advance().type, "open");
  const poll = state.polls.at(-1);
  run("C1", { type: "vote", poll: poll.id, choices: [amend] });
  assert.equal(advance().type, "close");
  assert.ok(
    !view(state, state.members["ECR-P"]).presentations.P.current.rows.some(
      (row) => row.score,
    ),
  );
  assert.equal(advance().type, "announce");
  assert.equal(
    view(state, state.members["ECR-P"]).presentations.P.current.id,
    "result-" + poll.id,
  );
  assert.equal(advance().slide, "measure-P2");
});

test("La plénière passe de la comparaison au vote, puis à la commission suivante", () => {
  const state = create(structuredClone(demo), 50, false, { rulesVersion: 1 });
  const run = (id, command) => act(state, state.members[id], command);
  run("PRE", { type: "phase" });
  for (const [code, room] of Object.entries(state.rooms))
    room.finalists = [code + "1", code + "2"];
  run("PRE", { type: "phase" });
  const advance = () => {
    const { command } = primary(state, "PRE", "");
    run("PRE", command);
    return command;
  };
  assert.equal(advance().slide, "measure-P1");
  assert.equal(advance().slide, "measure-P2");
  assert.equal(advance().slide, "compare-P");
  assert.equal(advance().type, "open");
  const poll = state.polls.at(-1);
  run("C2", { type: "vote", poll: poll.id, choices: ["P2"] });
  assert.equal(advance().type, "close");
  assert.equal(advance().type, "announce");
  assert.equal(state.rooms.P.winner, "P2");
  assert.equal(advance().slide, "measure-C1");
});
