import test from "node:test";
import assert from "node:assert/strict";
import { act, create, identify, view } from "../functions/engine.mjs";
import { demo } from "../functions/scenario.mjs";

function setup() {
  const session = create(structuredClone(demo), 50);
  const get = (member) => view(session, session.members[member]);
  const run = (member, type, args = {}) =>
    act(session, session.members[member], { type, ...args });
  run("REG", "phase");
  return { session, get, run };
}

test("Chaque animateur ouvre le projecteur de sa salle et y lance un débat indépendamment", () => {
  const { session, get, run } = setup();
  const screens = {};
  for (const room of ["P", "C"]) {
    const moderator = get("MOD-" + room);
    const screen = moderator.roomScreen;
    assert.equal(screen.id, "ECR-" + room);
    screens[room] = screen;
    assert.equal(identify(session, screen.id, screen.key).role, "Projection");
    assert.equal(moderator.roomScreens, undefined);
    assert.deepEqual(Object.keys(moderator.presentations), [room]);
  }
  const plenaryBefore = get("ECR-PL").presentations.plenary.current.id;
  run("MOD-P", "presentSlide", { room: "P", slide: "debate-P2" });
  run("MOD-C", "presentSlide", { room: "C", slide: "measure-C3" });
  for (const [room, measure] of [
    ["P", "P2"],
    ["C", "C3"],
  ]) {
    const projected = get(screens[room].id);
    assert.equal(projected.presentations[room].current.measure, measure);
    assert.equal(projected.rooms[room].focus, measure);
    assert.equal(projected.presentations[room].menu, undefined);
    assert.equal(projected.roomScreen, undefined);
    assert.equal(projected.roomScreens, undefined);
    assert.equal(projected.roster, undefined);
    assert.equal(projected.messages, undefined);
    assert.ok(!JSON.stringify(projected).includes(screens[room].key));
  }
  assert.equal(get("ECR-PL").presentations.plenary.current.id, plenaryBefore);
});

test("Un amendement devient visible dans la salle, puis son résultat après l’annonce du modérateur", () => {
  const { session, get, run } = setup();
  const clause =
    "Prévoir des livres en grands caractères dans la bibliothèque.";
  const projected = () => get("ECR-P").presentations.P.current;
  const secondRoom = () => get("ECR-C").presentations.C.current;

  run("MOD-C", "presentSlide", { room: "C", slide: "debate-C2" });
  const secondSlide = secondRoom().id;
  run("C1", "amend", {
    measure: "P1",
    text: clause,
    why: "Permettre à chacun de lire.",
  });
  const amendment = session.amends[0].id;
  run("C5", "sign", { amend: amendment });
  assert.ok(!JSON.stringify(get("ECR-P")).includes(clause));
  run("REG", "review", {
    amend: amendment,
    status: "admissible",
    profile: "P1-A",
    reason: "Correspondance vérifiée pour cet essai.",
  });
  run("MOD-P", "presentSlide", { room: "P", slide: "amend-" + amendment });
  assert.equal(projected().body, clause);
  assert.equal(projected().measure, "P1");
  assert.ok(!JSON.stringify(get("ECR-C")).includes(clause));
  run("MOD-P", "presentSlide", {
    room: "P",
    slide: "discuss-" + amendment,
    minutes: 5,
  });
  assert.equal(projected().kind, "Débat");
  assert.equal(projected().body, clause);
  assert.equal(projected().amendment, amendment);
  assert.ok(new Date(projected().until).getTime() > Date.now());
  assert.equal(secondRoom().until, undefined);
  run("MOD-P", "open", { kind: "amend", room: "P", measure: "P1" });
  const poll = projected().poll;
  assert.ok(poll);
  run("C1", "vote", { poll, choices: [amendment] });
  run("C5", "vote", { poll, choices: [] });
  run("MOD-P", "close", { poll });
  assert.ok(projected().rows.every((row) => row.score === "" && !row.selected));
  assert.equal(projected().turnout, undefined);
  assert.equal(get("ECR-P").polls.find((p) => p.id === poll).result, undefined);
  assert.equal(get("MOD-P").polls.find((p) => p.id === poll).result.voters, 2);

  run("MOD-P", "announce", { poll });
  const published = projected();
  assert.equal(published.rows.find((row) => row.selected).title, clause);
  assert.equal(published.turnout, 2);
  assert.equal(published.abstain, 1);
  assert.equal(secondRoom().id, secondSlide);
  run("MOD-P", "presentSlide", { room: "P", slide: "debate-P1" });
  assert.equal(projected().body, clause);
});
