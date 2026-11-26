import test from "node:test";
import assert from "node:assert/strict";
import { act, view } from "../functions/engine.mjs";
import { demo } from "../functions/scenario.mjs";
import { create } from "../functions/engine.mjs";
test("Chaque salle avance indépendamment et seuls ses pilotes peuvent la commander", () => {
  const s = create(demo, 50, false, { rulesVersion: 1 }),
    show = (member, scope, slide) =>
      act(s, s.members[member], { type: "presentSlide", room: scope, slide });
  const slide = (screen, scope) =>
    view(s, s.members[screen]).presentations[scope].current.id;
  show("REG", "", "measure-C2");
  show("MOD-P", "P", "measure-P2");
  assert.equal(slide("ECR-PL", "plenary"), "measure-C2");
  assert.equal(slide("ECR-P", "P"), "measure-P2");
  assert.equal(slide("ECR-C", "C"), "measure-C1");
  for (const [member, scope, id] of [
    ["MOD-P", "C", "measure-C2"],
    ["MOD-P", "", "measure-P1"],
    ["C1", "P", "measure-P1"],
    ["REG", "P", "measure-C2"],
  ])
    assert.throws(() => show(member, scope, id));
  assert.equal(view(s, s.members["ECR-P"]).presentations.P.menu, undefined);
});
test("Le projecteur passe du scrutin au dépouillement puis au résultat annoncé", () => {
  const s = create(demo, 50, false, { rulesVersion: 1 }),
    reg = (type, x = {}) => act(s, s.members.REG, { type, ...x });
  reg("phase");
  for (const [id, r] of Object.entries(s.rooms))
    r.finalists = [id + "1", id + "2"];
  reg("phase");
  reg("open", { kind: "plenary", room: "P" });
  let p = s.polls.at(-1),
    slide = () => view(s, s.members["ECR-PL"]).presentations.plenary.current;
  act(s, s.members.C1, { type: "vote", poll: p.id, choices: ["P1"] });
  reg("close", { poll: p.id });
  assert.ok(slide().rows.every((o) => o.score === ""));
  assert.equal(slide().turnout, undefined);
  reg("announce", { poll: p.id });
  assert.equal(slide().kind, "Résultat du vote");
  assert.equal(
    slide().rows.find((o) => o.selected).title,
    demo.measures[0].title,
  );
});
