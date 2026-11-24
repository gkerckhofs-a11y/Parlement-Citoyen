import test from "node:test";
import assert from "node:assert/strict";
import { create, act, view } from "../functions/engine.mjs";
import { demo } from "../functions/scenario.mjs";

function setup() {
  const s = create(structuredClone(demo), 50);
  const run = (id, type, args = {}) => act(s, s.members[id], { type, ...args });
  const deck = (id, scope = "P") => view(s, s.members[id]).presentations[scope];
  const control = () => deck("MOD-P");
  const projected = () => deck("ECR-P").current;
  run("REG", "phase");
  return { s, run, control, projected, deck };
}

test("Un texte et ses amendements conduisent au vrai scrutin, puis à son résultat au moment de l’annonce", () => {
  const { s, run, control, projected } = setup();
  const ids = [];
  for (const suffix of ["A", "B", "C"]) {
    run("C1", "amend", { measure: "P1", text: "Proposition " + suffix, why: "Pour la débattre" });
    const id = s.amends.at(-1).id;
    run("C5", "sign", { amend: id });
    ids.push(id);
    if (suffix === "A") {
      assert.ok(!control().menu.some((item) => item.openKind === "selection"));
      assert.throws(() => run("MOD-P", "open", { room: "P", kind: "selection" }));
    }
    run("REG", "review", { amend: id, profile: "P1-A", status: "admissible", reason: "Profil vérifié" });
  }
  let desk = control();
  assert.deepEqual(desk.route.slice(0, 5), ["measure-P1", ...ids.map((id) => "amend-" + id), "call-P1"]);
  assert.ok(!desk.route.some((id) => /^(effects|debate|discuss)-/.test(id)));
  assert.ok(desk.menu.some((item) => item.id === "discuss-" + ids[0]));
  const call = desk.menu.find((item) => item.id === "call-P1");
  assert.equal(call.ballotKind, "prelim");
  assert.equal(call.seats, 2);
  run("MOD-P", "open", { room: "P", measure: "P1", kind: "amend" });
  const initial = s.polls.at(-1).id;
  assert.equal(projected().ballotKind, "prelim");
  assert.equal(projected().rows[0].option, ids[0]);
  run("C1", "vote", { poll: initial, choices: ids.slice(0, 2) });
  run("MOD-P", "close", { poll: initial });
  assert.ok(!control().menu.some((step) => step.id === "result-" + initial));
  assert.throws(() => run("MOD-P", "presentSlide", { room: "P", slide: "result-" + initial }));
  assert.ok(projected().rows.every((row) => row.score === "" && !row.selected));
  run("MOD-P", "announce", { poll: initial });
  assert.equal(projected().id, "result-" + initial);
  desk = control();
  assert.ok(!desk.route.some((id) => id.startsWith("poll-" + initial)));
  assert.ok(desk.route.indexOf("result-" + initial) < desk.route.indexOf("call-P1"));
  assert.equal(desk.menu.find((item) => item.id === "call-P1").ballotKind, "amend");
  run("MOD-P", "presentSlide", { room: "P", slide: "poll-" + initial });
  assert.equal(projected().kind, "Vote");
  assert.equal(projected().turnout, undefined);
  assert.ok(projected().rows.every((row) => row.score === "" && !row.selected));
  // Older saved sessions used poll-<id> itself for the announced result.
  delete s.rooms.P.explicitBallotPage;
  assert.equal(projected().id, "result-" + initial);
  run("MOD-P", "open", { room: "P", measure: "P1", kind: "amend" });
  const amendment = s.polls.at(-1).id;
  run("C1", "vote", { poll: amendment, choices: [ids[1]] });
  run("MOD-P", "close", { poll: amendment });
  run("MOD-P", "announce", { poll: amendment });
  desk = control();
  assert.ok(desk.route.indexOf("result-" + amendment) < desk.route.indexOf("measure-P2"));
  assert.ok(!desk.route.includes("call-P1"));
  assert.ok(desk.route.includes("select-P"));
});

test("Départage réel et reprise remplacent les urnes invalidées au bon endroit", () => {
  const { s, run, control, projected, deck } = setup();
  run("MOD-P", "open", { room: "P", kind: "selection" });
  const first = s.polls.at(-1).id;
  run("C1", "vote", { poll: first, choices: ["P1", "P2"] });
  run("C5", "vote", { poll: first, choices: ["P1", "P3"] });
  run("MOD-P", "close", { poll: first });
  run("MOD-P", "announce", { poll: first });
  assert.equal(projected().status, "égalité");
  assert.ok(!control().menu.some((page) => page.round === 1));
  run("MOD-P", "tie", { poll: first });
  const tied = s.polls.at(-1).id;
  assert.equal(projected().round, 1);
  assert.equal(projected().seats, 1);
  assert.deepEqual(projected().rows.map((r) => r.option), ["P2", "P3"]);
  run("MOD-P", "close", { poll: tied });
  assert.equal(projected().status, "incident");
  run("MOD-P", "restart", { poll: tied, reason: "Reprise en salle" });
  const replacement = s.polls.at(-1).id;
  const route = control().route;
  assert.ok(!route.some((id) => id.includes(tied)));
  assert.ok(route.indexOf("poll-" + replacement) > route.indexOf("result-" + first));
  assert.equal(deck("ECR-P").route, undefined);
  assert.equal(deck("ECR-C", "C").current.measure, "C1");
});

test("La plénière conduit ses duels puis ouvre un nouveau parcours de débriefing", () => {
  const { s, run, deck } = setup();
  const desk = () => deck("PRE", "plenary");
  assert.deepEqual(desk().route, ["opening"]);
  for (const [room, state] of Object.entries(s.rooms)) state.finalists = [room + "1", room + "2"];
  run("PRE", "phase");
  assert.deepEqual(desk().route.slice(0, 5), ["opening", "measure-P1", "measure-P2", "compare-P", "duel-P"]);
  run("PRE", "open", { room: "P", kind: "plenary" });
  const p = s.polls.at(-1);
  run("C1", "vote", { poll: p.id, choices: ["P1"] });
  run("PRE", "close", { poll: p.id });
  assert.equal(deck("ECR-PL", "plenary").current.status, "clos");
  run("PRE", "announce", { poll: p.id });
  assert.equal(deck("ECR-PL", "plenary").current.id, "result-" + p.id);
  assert.deepEqual(desk().route.slice(3, 6), ["compare-P", "result-" + p.id, "measure-C1"]);
  for (const [room, state] of Object.entries(s.rooms)) state.winner = room + "1";
  run("PRE", "phase");
  assert.equal(desk().route[0], "balance");
  assert.ok(desk().route.includes("indicators"));
  assert.ok(desk().route.includes("journal-0"));
  assert.ok(!desk().route.some((id) => /^(measure|duel|compare|result)-/.test(id)));
});
