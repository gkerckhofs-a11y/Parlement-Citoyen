import test from "node:test";
import assert from "node:assert/strict";
import { act, create, view } from "../functions/engine.mjs";
import { demo } from "../functions/scenario.mjs";

test("Le fil Belga est privé ; une dépêche peut être traitée, relue et publiée par une rédaction", () => {
  const pack = { ...structuredClone(demo), title: "Répétition · Urgence citoyenne" };
  const state = create(pack, 100, true);
  const run = (id, type, data = {}) => act(state, state.members[id], { type, ...data });
  const get = (id) => view(state, state.members[id]);

  assert.equal(get("REG").wireAgency, "Agence Belga");
  assert.equal(get("J1").wires.length, 0);
  assert.throws(() => run("REG", "writeWire", { title: "Avant", text: "La séance n’est pas ouverte." }));
  run("REG", "phase");
  const wire = { title: "Point de situation", text: "Texte réservé aux journalistes." };
  for (const id of ["PRE", "C1", "L1", "J1"]) assert.throws(() => run(id, "writeWire", wire));
  run("REG", "writeWire", wire);
  const received = get("J1").wires[0];
  assert.equal(received.text, wire.text);
  assert.deepEqual(get("J2").wires, [received]);
  for (const id of ["PRE", "C1", "L1", "MOD-P", "EXP", "ENS", "ECR-NEWS", "ECR"]) {
    const visitor = get(id);
    assert.equal(visitor.wires, undefined);
    assert.equal(visitor.desk, undefined);
    assert.equal(JSON.stringify(visitor).includes(wire.text), false);
  }

  run("J1", "article", { wire: received.id, title: "Sur le terrain", text: "Un reportage." });
  const item = get("J5").desk[0]; // J1 et J5 travaillent pour le même média.
  assert.equal(item.draft.wire, received.id);
  assert.equal(item.revision, 1);
  assert.equal(get("J2").desk.length, 0);
  assert.equal(get("J2").reviewArticles, true);
  assert.throws(() => run("J2", "article", { id: item.id, title: "Autre rédaction", text: "Autre." }));
  run("J5", "article", { id: item.id, revision: 1, title: "Seconde version", text: "Entretien réalisé." });
  assert.throws(() => run("J1", "article", { id: item.id, revision: 1, title: "Ancien texte", text: "Ancien." }));
  const revised = get("J1").desk[0];
  assert.equal(revised.draft.title, "Seconde version");
  assert.equal(revised.draft.wire, received.id);
  run("J1", "article", { id: item.id, revision: 2, ...revised.draft, publish: true });
  assert.equal(get("ECR-NEWS").news.length, 0);
  assert.throws(() => run("REG", "editorial", { id: item.id, revision: 2, accept: true }));
  run("REG", "editorial", { id: item.id, revision: 3, accept: true });
  assert.equal(get("C1").news[0].media, pack.media[0]);
  assert.equal(get("ECR-NEWS").news[0].text, "Entretien réalisé.");
  state.review = false;
  run("J1", "article", { title: "En direct", text: "Dernière minute.", publish: true });
  assert.equal(get("C1").news[1].title, "En direct");
});
