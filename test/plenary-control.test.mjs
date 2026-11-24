import test from "node:test";
import assert from "node:assert/strict";
import { act, create, identify, view } from "../functions/engine.mjs";
import { demo } from "../functions/scenario.mjs";
import { plenarySlides } from "../functions/plenary.mjs";

function inPlenary() {
  const session = create(structuredClone(demo), 50);
  const run = (id, type, data = {}) => act(session, session.members[id], { type, ...data });
  run("PRE", "phase");
  for (const [room, state] of Object.entries(session.rooms))
    state.finalists = [room + "1", room + "2"];
  run("PRE", "phase");
  const get = (id) => view(session, session.members[id]);
  const screen = () => get("ECR-PL").presentations.plenary.current;
  const show = (slide, args = {}) => run("PRE", "presentSlide", { room: "", slide, ...args });
  return { session, run, get, screen, show };
}

test("Présidence et régie ouvrent le bon projecteur, même pour une ancienne session", () => {
  const { session, get, show, screen } = inPlenary();
  delete session.members["ECR-PL"];
  const access = get("PRE").plenaryScreen;
  assert.equal(identify(session, access.id, access.key).id, "ECR-PL");
  assert.deepEqual(get("REG").plenaryScreen, access);
  for (const member of ["ECR", "ECR-PL", "ECR-P", "ECR-NEWS", "MOD-P", "C1"])
    assert.equal(get(member).plenaryScreen, undefined);
  assert.equal(get("ECR").presentations, undefined);
  assert.equal(get("ECR-PL").presentations.plenary.menu, undefined);
  assert.equal(get("ECR-PL").roomScreens, undefined);
  assert.equal(get("ECR-PL").roster, undefined);
  assert.ok(!JSON.stringify(get("ECR-PL")).includes(access.key));
  const other = get("ECR-P").presentations.P.current.id;
  show("debate-P2", { minutes: 3 });
  assert.ok(screen().until > Date.now());
  assert.equal(screen().body, demo.measures.find((m) => m.id === "P2").text);
  assert.equal(get("ECR-P").presentations.P.current.id, other);
  assert.equal(session.rooms.P.until, undefined);
  assert.equal(get("ECR-NEWS").presentations, undefined);
  const restored = structuredClone(session);
  assert.deepEqual(view(restored, restored.members["ECR-PL"]).presentations.plenary.current, screen());
  session.members["ECR-GEN"] = { ...session.members.ECR, id: "ECR-GEN" };
  delete session.members.ECR;
  assert.equal(get("PRE").generalScreen.id, "ECR-GEN");
  assert.equal(get("ECR-GEN").projectionScope, "general");
});

test("Les projecteurs transversaux gardent leur identité quand une salle utilise un code réservé", () => {
  const pack = structuredClone(demo);
  const names = { P: "PL", C: "NEWS", E: "GENERAL", S: "GEN" };
  pack.rooms = Object.fromEntries(Object.entries(pack.rooms).map(([room, title]) => [names[room], title]));
  for (const measure of pack.measures) measure.room = names[measure.room];
  const session = create(pack, 50);
  const get = (member) => view(session, session.members[member]);
  const { plenaryScreen, pressScreen, generalScreen, roomScreens } = get("PRE");
  assert.equal(get(plenaryScreen.id).projectionScope, "plenary");
  assert.equal(get(pressScreen.id).projectionScope, "press");
  assert.equal(get(generalScreen.id).projectionScope, "general");
  for (const [room, access] of Object.entries(roomScreens)) {
    assert.equal(get(access.id).projectionScope, "commission");
    assert.equal(get(access.id).me.room, room);
    assert.deepEqual(Object.keys(get(access.id).presentations), [room]);
    assert.equal(get(access.id).pressScreen, undefined);
  }
  assert.equal(new Set([plenaryScreen, pressScreen, generalScreen, ...Object.values(roomScreens)]
    .map((access) => access.id)).size, 7);
});

test("Les deux versions qualifiées, la clause votée et le résultat annoncé sont identifiables", () => {
  const { session, get, show, screen, run } = inPlenary();
  const text = "Conserver un exemplaire accessible pour chaque classe. ".repeat(16).trim();
  const approved = { id: "proposition-adoptee", room: "P", measure: "P1", status: "adopté", profile: "P1-A", text, sign: [] };
  session.amends.push(approved, { ...approved, id: "autre", status: "rejeté", text: "Autre clause" });
  session.rooms.P.official.P1 = approved.id;
  const menu = get("PRE").presentations.plenary.menu;
  assert.ok(!menu.some((s) => s.id === "amend-autre" || s.id === "measure-P3"));
  const parts = menu.filter((s) => s.id === "debate-P1" || s.id.startsWith("debate-P1~"));
  assert.ok(parts.length > 1);
  assert.equal(parts.map((s) => { show(s.id); return screen().body; }).join(" "), text);
  show("compare-P");
  assert.deepEqual(screen().rows.map((r) => [r.measure, r.version]), [["P1", "P1-A"], ["P2", "P2"]]);
  assert.ok(screen().rows.every((r) => r.trends.length === 5));
  show("duel-P");
  assert.equal(get("PRE").presentations.plenary.current.openKind, "plenary");
  assert.equal(screen().openKind, undefined);
  run("PRE", "open", { room: "P", kind: "plenary" });
  const poll = session.polls.at(-1);
  assert.throws(() => run("PRE", "open", { room: "C", kind: "plenary" }));
  assert.throws(() => run("MOD-P", "close", { poll: poll.id }));
  assert.ok(!get("PRE").presentations.plenary.menu.find((s) => s.id === "duel-C").openKind);
  run("C2", "vote", { poll: poll.id, choices: ["P2"] });
  run("PRE", "close", { poll: poll.id });
  assert.ok(screen().rows.every((r) => r.score === ""));
  run("PRE", "announce", { poll: poll.id });
  assert.equal(screen().turnout, 1);
  assert.equal(screen().rows.find((r) => r.selected).measure, "P2");
});

test("Le bilan, le journal et leurs passages sont projetables depuis les anciennes et nouvelles commandes", () => {
  const { session, get, show, screen, run } = inPlenary();
  for (const [room, state] of Object.entries(session.rooms)) state.winner = room + "1";
  const long = "Cette édition présente les décisions des quatre commissions. ".repeat(20).trim();
  session.pack.clips = { "J2040-INTRO": long };
  run("REG", "phase");
  run("PRE", "projectBalance", { show: true });
  assert.equal(screen().id, "balance");
  assert.equal(screen().rows.length, 4);
  assert.ok(get("ECR").summary);
  assert.equal(get("ECR-NEWS").summary, undefined);
  show("indicators");
  assert.equal(screen().rows.length, 5);
  run("PRE", "jt", { slide: 0 });
  assert.equal(screen().id, "journal-0");
  assert.equal(get("ECR").slide, long);
  assert.equal(get("ECR-PL").slide, null);
  const pages = get("REG").presentations.plenary.menu.filter((s) => s.journalIndex === 0);
  assert.ok(pages.length > 1);
  assert.equal(pages.map((s) => { show(s.id); return screen().body; }).join(" "), long);
  assert.ok(screen().body.length <= 300);
});

test("Les intitulés complets restent des titres sur les propositions, débats et effets", () => {
  const { session } = inPlenary();
  const measure = session.pack.measures.find((m) => m.id === "S1");
  measure.title = "Interdiction temporaire d’importer des animaux vivants depuis les régions à forte circulation de H36";
  for (const scope of ["S", ""]) {
    const deck = plenarySlides(session, scope);
    for (const id of ["measure-S1", "debate-S1", "effects-S1"]) {
      const slide = deck.find((s) => s.id === id);
      assert.equal(slide.title, measure.title);
      assert.ok(!slide.body.includes(measure.title));
    }
  }
  measure.title = "Consulter toutes les communes et les associations de terrain ".repeat(8).trim();
  const pages = plenarySlides(session, "S")
    .filter((s) => s.id === "debate-S1" || s.id.startsWith("debate-S1~"));
  assert.ok(pages.length > 1);
  assert.equal(pages.map((s) => s.title).join(" "), measure.title);
  assert.equal(pages.map((s) => s.body).filter(Boolean).join(" "), measure.text);
});
