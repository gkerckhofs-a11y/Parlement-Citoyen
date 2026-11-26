import test from "node:test";
import assert from "node:assert/strict";
import {
  create,
  act,
  view,
  identify,
  token,
  tally,
} from "../functions/engine.mjs";
import { demo } from "../functions/scenario.mjs";
const setup = (n = 100, review = false) => {
  const s = create(structuredClone(demo), n, review, {rulesVersion:1});
  const doAs = (id, type, x = {}) => act(s, s.members[id], { type, ...x });
  const reg = (type, x) => doAs("REG", type, x);
  const get = (id) => view(s, s.members[id]);
  return { s, doAs, reg, get };
};
test("Affectations exactes, adultes distincts et territoires représentés", () => {
  for (let n of [50, 100, 120, 150]) {
    let { s } = setup(n),
      all = Object.values(s.members),
      cs = all.filter((m) => m.role === "Citoyen");
    assert.equal(all.filter((a) => a.group).length, n);
    assert.equal(cs.length, n === 50 ? 36 : n * 0.7);
    for (let room of Object.keys(s.rooms))
      assert.equal(
        new Set(cs.filter((a) => a.room === room).map((a) => a.group)).size,
        7,
      );
    let counts = Object.values(Object.groupBy(cs, (m) => m.group)).map(
      (g) => g.length,
    );
    assert.ok(Math.max(...counts) - Math.min(...counts) <= 1);
  }
});
test("Identités par session, récupération et projection sans données privées", () => {
  let { s, reg, get } = setup(),
    s2 = setup().s,
    key = token(s, "C1");
  assert.throws(() => identify(s2, "C1", key));
  assert.equal(identify(s, "C1", key).role, "Citoyen");
  reg("rotate", { member: "C1" });
  assert.throws(() => identify(s, "C1", key));
  let pub = get("ECR-P");
  assert.deepEqual(Object.keys(pub.rooms), ["P"]);
  for (let k of [
    "roster",
    "messages",
    "template",
    "events",
    "wires",
    "offers",
    "desk",
  ])
    assert.equal(pub[k], undefined);
  assert.ok(!JSON.stringify(pub).includes('"scores"'));
});
test("Amendement signé par deux territoires, validation de régie, majorité stricte", () => {
  for (let support of [0, 6, 7]) {
    let { s, doAs, reg, get } = setup();
    assert.throws(() =>
      doAs("C1", "amend", { measure: "P1", text: "Clause", why: "Raison" }),
    );
    reg("phase");
    doAs("C1", "amend", {
      measure: "P1",
      text: "Clause validée",
      why: "Motif",
    });
    let am = s.amends[0].id;
    let review = {
      amend: am,
      profile: "P1-A",
      status: "admissible",
      reason: "Profil vérifié",
    };
    assert.throws(() => reg("review", review));
    assert.throws(() => doAs("C2", "sign", { amend: am }));
    doAs("C5", "sign", { amend: am });
    assert.throws(() => doAs("MOD-P", "review", review));
    reg("review", review);
    assert.equal(get("ECR-C").amends.length, 0);
    assert.equal(get("C2").amends[0].text, "Clause validée");
    reg("open", { room: "P", kind: "amend", measure: "P1" });
    let p = s.polls.at(-1),
      voters = p.eligible.slice(0, 14);
    voters.forEach((id, i) =>
      doAs(id, "vote", {
        poll: p.id,
        choices: support === 0 || i >= 12 ? [] : [i < support ? am : "P1"],
      }),
    );
    doAs("C1", "vote", { poll: p.id, choices: [] });
    reg("close", { poll: p.id });
    assert.ok(!get("ECR-P").polls[0].result);
    reg("announce", { poll: p.id });
    assert.equal(p.result.voters, 14);
    assert.equal(s.rooms.P.official.P1, support === 7 ? am : undefined);
  }
});
test("Influence plafonnée et réserve partagée, vote sans preuve de choix", () => {
  let { s, doAs, reg, get } = setup();
  reg("phase");
  let make = (to) => ({ to, measure: "P1" });
  doAs("L1", "offer", make("C1"));
  doAs("C1", "respond", { offer: s.offers[0].id, accept: false });
  doAs("L1", "offer", make("C1"));
  doAs("L9", "offer", make("C5"));
  assert.throws(() => doAs("L1", "offer", make("C9")));
  doAs("C1", "respond", { offer: s.offers[1].id, accept: true });
  reg("open", { room: "P", kind: "selection" });
  let p = s.polls.at(-1);
  assert.throws(() =>
    doAs("C5", "respond", { offer: s.offers[2].id, accept: true }),
  );
  assert.throws(() => doAs("L1", "vote", { poll: p.id, choices: ["P1"] }));
  assert.throws(() =>
    doAs("C1", "vote", { poll: p.id, choices: ["P1", "P1"] }),
  );
  doAs("C1", "vote", { poll: p.id, choices: ["P1"] });
  assert.equal(p.active.P1, 1);
  assert.equal(get("C1").polls[0].voted, true);
  assert.ok(!get("C1").polls[0].receipts);
  assert.ok(get("L1").offers.every((o) => o.status !== "activé"));
  for (let [k, sum] of [
    [0, 0],
    [2, 1],
    [5, 2],
  ]) {
    let t = tally({
      ...p,
      receipts: Object.fromEntries(
        Array.from({ length: 20 }, (_, i) => [i, true]),
      ),
      active: { P1: k },
    });
    assert.equal(
      t.rows.reduce((a, z) => a + z.bonus, 0),
      sum,
    );
  }
});
test("Départage de la deuxième place puis tirage entre les seuls ex æquo", () => {
  let { s, reg, doAs } = setup();
  reg("phase");
  reg("open", { room: "P", kind: "selection" });
  let p = s.polls.at(-1);
  [
    ["C1", ["P1", "P2"]],
    ["C5", ["P1", "P3"]],
  ].forEach(([id, choices]) => doAs(id, "vote", { poll: p.id, choices }));
  reg("close", { poll: p.id });
  reg("announce", { poll: p.id });
  reg("tie", { poll: p.id });
  let t = s.polls.at(-1);
  assert.deepEqual(t.fixed, ["P1"]);
  assert.equal(t.seats, 1);
  assert.deepEqual(t.options, ["P2", "P3"]);
  doAs("C1", "vote", { poll: t.id, choices: ["P2"] });
  doAs("C5", "vote", { poll: t.id, choices: ["P3"] });
  reg("close", { poll: t.id });
  reg("announce", { poll: t.id });
  reg("draw", { poll: t.id, reason: "Tirage annoncé en salle" });
  assert.equal(s.rooms.P.finalists.length, 2);
  assert.equal(s.rooms.P.finalists[0], "P1");
});
test("Incident, suspension, nouvelle urne et secours papier", () => {
  let { s, reg } = setup();
  reg("phase");
  reg("open", { room: "P", kind: "selection" });
  let p = s.polls.at(-1);
  reg("close", { poll: p.id });
  assert.equal(p.status, "incident");
  reg("restart", { poll: p.id, reason: "Reprise" });
  let t = s.polls.at(-1);
  assert.notEqual(t.id, p.id);
  reg("suspend", { poll: t.id, reason: "Réseau" });
  reg("paper", {
    poll: t.id,
    count: 10,
    abstain: 2,
    raw: { P1: 6, P2: 4, P3: 1, P4: 0, P5: 0 },
    checked: true,
    reason: "Double comptage en salle",
  });
  let b = s.polls.at(-1);
  reg("announce", { poll: b.id });
  assert.equal(b.result.voters, 10);
  assert.equal(b.result.abstain, 2);
  assert.deepEqual(s.rooms.P.finalists, ["P1", "P2"]);
});
test("Messagerie et agence privées, relecture, corrections, audience et droits de Une", () => {
  let { s, doAs, reg, get } = setup(100, true);
  reg("phase");
  doAs("C1", "message", { text: "Message du territoire" });
  assert.equal(get("L1").messages.length, 0);
  reg("wire", { id: "D01" });
  assert.ok(!get("C1").wires);
  assert.equal(get("J2").wires.length, 1);
  doAs("J1", "article", {
    title: "Le débat",
    text: "Le reportage",
    publish: true,
    wire: "D01",
  });
  let id = s.articles[0].id;
  assert.equal(get("C1").news.length, 0);
  reg("editorial", { id, accept: true });
  doAs("C1", "read", { id });
  doAs("C1", "read", { id });
  doAs("L1", "read", { id });
  doAs("J1", "article", {
    id,
    title: "Correction",
    text: "Texte corrigé",
    publish: true,
  });
  reg("editorial", { id, accept: true });
  assert.equal(get("J1").desk[0].audience, 1);
  assert.ok(get("C1").news[0].corrected);
  for (let i = 0; i < 4; i++) doAs("J1", "front", { id });
  assert.throws(() => doAs("J1", "front", { id }));
  assert.throws(() => doAs("J2", "front", { id }));
  assert.ok(!get("ECR").desk);
});
test("Les quatre duels successifs débouchent sur un bilan et un journal cohérents", () => {
  let { s, reg, doAs, get } = setup(150);
  reg("phase");
  for (let room of Object.keys(s.rooms)) {
    reg("open", { room, kind: "selection" });
    let p = s.polls.at(-1);
    for (let id of p.eligible)
      doAs(id, "vote", { poll: p.id, choices: [room + "1", room + "2"] });
    reg("close", { poll: p.id });
    reg("announce", { poll: p.id });
  }
  reg("phase");
  for (let room of Object.keys(s.rooms)) {
    reg("open", { room, kind: "plenary" });
    let p = s.polls.at(-1);
    assert.equal(p.eligible.length, 105);
    for (let id of p.eligible)
      doAs(id, "vote", { poll: p.id, choices: [room + "2"] });
    reg("close", { poll: p.id });
    reg("announce", { poll: p.id });
  }
  reg("phase");
  let v = get("REG");
  assert.deepEqual(
    v.balance.chosen.map((m) => m.id),
    ["P2", "C2", "E2", "S2"],
  );
  assert.deepEqual(v.balance.final, [0, 0, -4, 4, 0]);
  reg("jt", { slide: 0 });
  assert.equal(get("ECR").slide, v.journal[0]);
  assert.equal(get("ECR").balance, undefined);
});
test("Une fusion requiert le consentement des deux auteurs", () => {
  let { s, reg, doAs } = setup();
  reg("phase");
  doAs("C1", "amend", {
    measure: "P1",
    text: "Texte un",
    why: "Première proposition",
  });
  doAs("C5", "amend", {
    measure: "P1",
    text: "Texte deux",
    why: "Deuxième proposition",
  });
  let [a, b] = s.amends;
  reg("merge", { amend: a.id, other: b.id, text: "Texte commun" });
  doAs("C1", "mergeConsent", { amend: a.id, accept: true });
  assert.equal(a.text, "Texte un");
  doAs("C5", "mergeConsent", { amend: b.id, accept: true });
  assert.equal(a.text, "Texte commun");
  assert.equal(b.status, "fusionné");
  assert.equal(a.sign.length, 2);
});
test("Les exports enseignants masquent les petites distributions et préservent les textes adoptés", async () => {
  const { reportRows } = await import("../public/report.js");
  let v = {
    balance: {
      chosen: [{ id: "P1", title: "Texte adopté", text: "Clause exacte" }],
      dimensions: [],
      territories: [],
    },
    lobby: [],
    press: [],
    coverage: [],
    code: "DEMO",
    version: "Essai",
    citizens: 36,
    minGroup: 5,
    roomNames: { P: "Prévention" },
    polls: [
      {
        id: "0123456789",
        room: "P",
        kind: "amend",
        result: {
          voters: 8,
          absent: 1,
          abstain: 1,
          rows: [{ id: "P1", raw: 1 }],
        },
      },
    ],
  };
  let rows = reportRows(v, (id) => id);
  assert.ok(rows.some((r) => r.includes("Clause exacte")));
  assert.ok(rows.some((r) => r.includes("Regroupé pour confidentialité")));
  assert.ok(!rows.some((r) => r.includes("Votants")));
});
