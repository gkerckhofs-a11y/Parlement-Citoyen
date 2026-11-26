import test from "node:test";
import assert from "node:assert/strict";
import { act, create, view } from "../functions/engine.mjs";
import { demo } from "../functions/scenario.mjs";
import { influenceMeasures } from "../public/influence.js";

test("Le formulaire d’influence fait correspondre le citoyen, son territoire et les mesures de sa commission", () => {
  const s = create(structuredClone(demo), 100, false, {rulesVersion:1});
  const inspect = (id) => view(s, s.members[id]);
  const issue = (id, type, params) => act(s, s.members[id], { type, ...params });
  assert.deepEqual(inspect("L1").targets, []);
  issue("REG", "phase");
  issue("REG", "presence", { member: "C3", present: false });
  let lobby = inspect("L1");
  assert.ok(!lobby.targets.some((t) => t.id === "C3"));
  const citizen = lobby.targets.find((t) => t.id === "C2");
  assert.equal(citizen.territory, inspect("C2").team.name);
  assert.deepEqual(influenceMeasures(lobby, "C2").map(([id]) => id),
    s.pack.measures.filter((m) => m.room === citizen.room).map((m) => m.id));
  assert.throws(() => issue("L1", "offer", { to: "C2", measure: "P1" }));
  issue("REG", "open", { kind: "selection", room: citizen.room });
  lobby = inspect("L1");
  assert.ok(!lobby.targets.some((t) => t.room === citizen.room));
  assert.deepEqual(influenceMeasures(lobby, "C2"), []);
  assert.throws(() => issue("L1", "offer", { to: "C2", measure: "C1" }));
});

test("Une proposition rejouée et des réponses répétées ne changent ni la réserve ni le consentement", () => {
  const s = create(structuredClone(demo), 100, false, {rulesVersion:1});
  const inspect = (id) => view(s, s.members[id]);
  const issue = (id, type, params) => act(s, s.members[id], { type, ...params });
  issue("REG", "phase");
  const offer = { to: "C1", measure: "P1", requestId: "first-offer" };
  issue("L1", "offer", offer);
  issue("L1", "offer", offer);
  assert.throws(() => issue("L9", "offer", { ...offer, requestId: "second-offer" }));
  assert.equal(inspect("L9").offers.length, 1);
  const [received] = inspect("C1").offers;
  assert.equal(received.association, inspect("L1").team.name);
  assert.ok(!Object.hasOwn(received, "requestId"));
  assert.deepEqual(inspect("C2").offers, []);
  assert.deepEqual(inspect("L2").offers, []);
  assert.equal(inspect("J1").offers, undefined);
  const reply = { offer: received.id, accept: false };
  assert.throws(() => issue("C2", "respond", reply));
  assert.throws(() => issue("C1", "respond", { ...reply, accept: "false" }));
  issue("C1", "respond", reply);
  issue("C1", "respond", reply);
  issue("L1", "offer", offer);
  assert.equal(s.offers.length, 1);
  issue("L1", "offer", { ...offer, requestId: "reoffer" });
  issue("C1", "respond", { offer: s.offers.at(-1).id, accept: true });
  issue("L2", "offer", { to: "C1", measure: "P2" });
  assert.throws(() => issue("C1", "respond", { offer: s.offers.at(-1).id, accept: true }));
});
