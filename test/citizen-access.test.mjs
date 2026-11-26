import test from "node:test";
import assert from "node:assert/strict";
import { act, create, view } from "../functions/engine.mjs";
import { rehearsal } from "../functions/rehearsal.mjs";
import { demo } from "../functions/scenario.mjs";

const inspect = (s, id) => view(s, s.members[id]);
const issue = (s, id, action) => act(s, s.members[id], action);

test("La répétition présente une offre à répondre, un point accepté et les urnes propres à chaque citoyen", () => {
  const pack = structuredClone(demo);
  pack.dispatches.push({ id: "D02", title: "Deuxième dépêche", text: "Dépêche d'exercice." });
  const s = rehearsal(pack, 0);
  const actionables = (v) => v.polls.filter((p) => p.status === "ouvert" && p.eligible && !p.voted);
  const offers = (v) => v.offers.map((o) => [o.measure, o.status]);
  const c1 = inspect(s, "C1"), c5 = inspect(s, "C5"), c2 = inspect(s, "C2");
  assert.deepEqual(offers(c1), [["P1", "proposé"]]);
  assert.deepEqual(offers(c5), [["P2", "accepté"]]);
  assert.deepEqual(offers(c2), []);
  assert.deepEqual(actionables(c1), []);
  assert.deepEqual(actionables(c5), []);
  const [open] = actionables(c2);
  assert.equal(open.room, "C");
  assert.equal(open.kind, "selection");
  assert.equal(c1.polls.find((p) => p.id === open.id).eligible, undefined);
  assert.throws(() => issue(s, "C1", { type: "vote", poll: open.id, choices: [] }));
  assert.equal(inspect(s, "C10").polls.find((p) => p.id === open.id).voted, true);
  assert.equal(inspect(s, "C3").polls.find((p) => p.eligible).status, "égalité");
  assert.equal(inspect(s, "C4").polls.find((p) => p.eligible).status, "annoncé");
  const pl = rehearsal(pack, 1);
  for (const id of ["C1", "C2"]) {
    const [duel] = actionables(inspect(pl, id));
    assert.equal(duel.kind, "plenary");
    assert.equal(duel.room, "P");
  }
});

test("Deux bulletins opposés laissent les mêmes vues personnelles pour le citoyen, le lobby et la projection", () => {
  const s = create(demo, 50, false, {rulesVersion:1});
  issue(s, "REG", { type: "phase" });
  issue(s, "L1", { type: "offer", to: "C1", measure: "P1" });
  issue(s, "C1", { type: "respond", offer: s.offers[0].id, accept: true });
  issue(s, "REG", { type: "open", room: "P", kind: "selection" });
  const other = structuredClone(s);
  const poll = s.polls[0].id;
  issue(s, "C1", { type: "vote", poll, choices: ["P1"] });
  issue(other, "C1", { type: "vote", poll, choices: ["P2"] });
  assert.equal(s.polls[0].active.P1, 1);
  assert.deepEqual(other.polls[0].active, {});
  assert.equal(inspect(s, "C1").offers[0].status, "accepté");
  assert.equal(inspect(s, "C1").polls[0].voted, true);
  for (const id of ["C1", "C5", "L1", "ECR-P"])
    assert.deepEqual(inspect(s, id), inspect(other, id));
});

test("Le retour d’un citoyen absent conserve l’électorat enregistré à l’ouverture", () => {
  const s = create(demo, 50, false, {rulesVersion:1});
  issue(s, "REG", { type: "phase" });
  issue(s, "REG", { type: "presence", member: "C2", present: false });
  issue(s, "REG", { type: "open", room: "C", kind: "selection" });
  const poll = s.polls[0].id;
  assert.equal(inspect(s, "C2").me.present, false);
  assert.equal(inspect(s, "C2").polls[0].eligible, undefined);
  assert.throws(() => issue(s, "C2", { type: "vote", poll, choices: [] }));
  assert.throws(() => issue(s, "REG", { type: "presence", member: "C2", present: true }));
  issue(s, "C6", { type: "vote", poll, choices: ["C1", "C2"] });
  issue(s, "REG", { type: "close", poll });
  issue(s, "REG", { type: "presence", member: "C2", present: true });
  const returned = inspect(s, "C2");
  assert.equal(returned.me.present, true);
  assert.equal(returned.polls[0].eligible, undefined);
  assert.equal(returned.polls[0].status, "dépouillement");
});
