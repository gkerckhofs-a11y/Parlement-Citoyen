import assert from "node:assert/strict";
import test from "node:test";
import { act, create, view } from "../functions/engine.mjs";
import { demo } from "../functions/scenario.mjs";

test("Chaque groupe retrouve sa mission, ses membres et sa propre discussion", () => {
  const pack = structuredClone(demo);
  pack.territories[0].goals = [{ index: 2, threshold: 1 }, { index: 1, threshold: -2 }];
  pack.lobbies[0].objectives = [["P1", "E1"]];
  const s = create(pack, 100);
  const get = (id) => view(s, s.members[id]);
  const send = (id, text) => act(s, s.members[id], { type: "message", text });
  const participants = [
    ["C1", pack.territories[0].name],
    ["L1", pack.lobbies[0].name],
    ["J1", pack.media[0]],
  ];

  for (const [id, name] of participants) {
    assert.equal(get(id).team.name, name);
    assert.equal(get(id).team.canMessage, false);
    assert.equal(get(id).team.members, undefined);
    assert.throws(() => send(id, "En classe"));
  }
  assert.deepEqual(get("C1").team.goals, pack.territories[0].goals);
  assert.deepEqual(get("L1").team.objectives, pack.lobbies[0].objectives);
  assert.equal(get("C2").team.goals, undefined);
  assert.equal(get("L2").team.objectives, undefined);
  act(s, s.members.REG, { type: "phase" });
  for (const [id] of participants) {
    const member = s.members[id];
    const peers = Object.values(s.members).filter((other) => other.group === member.group);
    assert.ok(peers.length > 1);
    const peer = peers.find((other) => other.id !== id);
    const others = Object.values(s.members).filter((other) => other.role === member.role && other.group !== member.group);
    send(id, "Rendez-vous au Parlement, " + member.group);
    const received = get(peer.id);
    assert.equal(received.team.canMessage, true);
    assert.deepEqual(received.team.members, peers.map(({ id, room, present }) => ({ id, room, present })));
    assert.equal(received.messages.length, 1);
    assert.equal(received.messages[0].by, id);
    assert.ok(received.messages[0].time);
    assert.deepEqual(get(others[0].id).messages, []);
  }
  assert.equal(get("ECR-NEWS").team, undefined);
  assert.equal(get("REG").messages, undefined);
  act(s, s.members.REG, { type: "presence", member: "L1", present: false });
  assert.equal(get("L1").team.canMessage, false);
  assert.equal(get("L9").team.members.find((v) => v.id === "L1").present, false);
  assert.throws(() => send("L1", "Après absence"));
  s.phase = "Débriefing";
  assert.equal(get("C1").team.canMessage, false);
  assert.equal(get("C1").messages.length, 1);
  assert.throws(() => send("C1", "Après clôture"));
});
