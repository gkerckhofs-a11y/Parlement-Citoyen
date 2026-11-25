import test from "node:test";
import assert from "node:assert/strict";
import { api } from "../functions/api.mjs";
import { act, create, readVisitCard, token, view } from "../functions/engine.mjs";
import { demo } from "../functions/scenario.mjs";

test("Chaque joueur a une carte publique stable, limitée à son affectation actuelle", () => {
  const s = create(demo, 50);
  const { roster } = view(s, s.members.REG);
  const cards = roster.filter((member) => member.card);
  assert.equal(cards.length, 50);
  assert.equal(new Set(cards.map((member) => member.card.card)).size, 50);
  for (const member of roster) {
    const own = view(s, s.members[member.id]).myCard;
    if (!["Citoyen", "Lobby", "Journaliste"].includes(member.role)) {
      assert.equal(own, undefined);
      assert.equal(member.card, undefined);
      continue;
    }
    const group = Number(member.group.slice(1));
    const groupName = member.role === "Citoyen" ? demo.territories[group].name :
      member.role === "Lobby" ? demo.lobbies[group].name : demo.media[group];
    assert.match(own.card, /^[A-Za-z0-9_-]{24}$/);
    assert.deepEqual(own, { code: s.code, card: own.card, id: member.id,
      role: member.role, groupName, room: member.room, roomName: demo.rooms[member.room] || "" });
    assert.deepEqual(member.card, own);
    assert.deepEqual(readVisitCard(s, own.card), own);
  }
  const { card } = view(s, s.members.C1).myCard;
  const before = token(s, "C1");
  act(s, s.members.REG, { type: "rotate", member: "C1" });
  assert.notEqual(token(s, "C1"), before);
  act(s, s.members.REG, { type: "assign", member: "C1", group: "T2", room: "C" });
  const restored = JSON.parse(JSON.stringify(s));
  assert.deepEqual(readVisitCard(restored, card), {
    code: s.code, card, id: "C1", role: "Citoyen", groupName: demo.territories[2].name,
    room: "C", roomName: demo.rooms.C,
  });
});

test("Le QR public identifie le destinataire et seule une session lobby authentifiée peut lui proposer un point", async () => {
  const s = create(demo, 50);
  const other = create(demo, 50);
  const get = (code) => [s, other].find((session) => session.code === code);
  const handler = api({ get, change: (code, fn) => fn(get(code)) });
  async function request(op, body) {
    const response = { statusCode: 200, setHeader() {}, end(json) { this.body = JSON.parse(json); } };
    await handler({ method: "POST", url: "/api/" + op, headers: { "content-type": "application/json" }, body }, response);
    return response;
  }
  const { code, card } = view(s, s.members.C1).myCard;
  const scanned = await request("card", { code, card });
  assert.equal(scanned.statusCode, 200);
  assert.equal(scanned.body.id, "C1");
  assert.equal((await request("card", { code: other.code, card })).statusCode, 400);
  assert.equal((await request("card", { code, card: token(s, "C1") })).statusCode, 400);
  assert.equal((await request("card", { code, id: "C1" })).statusCode, 400);
  assert.equal((await request("view", { code, id: "C1", key: card })).statusCode, 400);
  const action = { type: "offer", to: scanned.body.id, measure: "P1" };
  act(s, s.members.REG, { type: "phase" });
  for (const credentials of [{}, { id: "L1", key: card }, { id: "REG", key: card },
    { id: "C1", key: token(s, "C1") }]) {
    assert.equal((await request("action", { code, action, ...credentials })).statusCode, 400);
  }
  assert.equal(s.offers.length, 0);
  assert.equal((await request("action", { code, id: "L1", key: token(s, "L1"), action })).statusCode, 200);
  assert.deepEqual(view(s, s.members.C1).offers.map((o) => [o.measure, o.status]), [["P1", "proposé"]]);
  assert.deepEqual((await request("card", { code, card })).body, scanned.body);
});
