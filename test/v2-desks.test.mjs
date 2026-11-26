import assert from "node:assert/strict";
import test from "node:test";
import { act, create, view } from "../functions/engine.mjs";
import { demo } from "../functions/scenario.mjs";
import { deskFlow } from "../public/desk-flow.js";
import { parliamentScreen } from "../public/commission-screen.js";

function setup() {
  const state = create(structuredClone(demo), 50);
  const run = (id, command) => act(state, state.members[id], command);
  const get = (id) => view(state, state.members[id]);
  const vote = (who, poll, choices, boost = false) => run(who, { type: "vote", poll:poll.id, choices, boost });
  function advance(scope = "P") {
    const role = scope ? "MOD-" + scope : "PRE";
    const pilot = get(role);
    const deck = pilot.presentations[scope || "plenary"];
    const active = pilot.polls.find((p) => (scope
      ? p.room === scope && p.kind !== "plenary" : p.kind === "plenary") &&
      !["annoncé", "invalidé"].includes(p.status));
    const commands = [];
    const btn = (label, command) => String(commands.push(command) - 1);
    const go = (label, slide) => btn(label, {type:"presentSlide", room:scope, slide});
    const html = deskFlow(pilot, deck, active, go, {btn, para:String});
    const key = /class="desk-main-action">(\d+)</.exec(html);
    assert.ok(key, "une prochaine commande est proposée à l’animateur");
    const command = commands[Number(key[1])];
    run(role, command);
    return command;
  }
  function projected(scope = "P") {
    const stage = get("ECR-" + (scope || "PL"));
    const deck = stage.presentations[scope || "plenary"];
    const html = parliamentScreen(stage, deck, {h:String, roomMark:String, banner:() => "", effect:String, icon:String, indicators:[]});
    return {stage, slide:deck.current, html};
  }
  run("REG", {type:"phase"});
  return {state, run, get, vote, advance, projected};
}

test("Pour ou contre chaque proposition, après l’amendement, puis classement net et départage à voix égales", () => {
  const {state, run, get, vote, advance, projected} = setup();
  run("C1", {type:"amend", measure:"P1", text:"Atelier en classe.", why:"Ouvrir le débat."});
  const amendment = state.amends[0].id;
  run("C5", {type:"sign", amend:amendment});
  assert.ok(!get("MOD-P").presentations.P.menu.some((s) => s.openKind === "opinion" && s.measure === "P1"));
  run("REG", {type:"review", amend:amendment, profile:"P1-A", status:"admissible", reason:"Clause vérifiée"});
  assert.equal(advance().slide, "amend-" + amendment);
  assert.equal(advance().kind, "amend");
  vote("C1", state.polls.at(-1), [amendment]);
  assert.equal(advance().type, "close");
  assert.equal(advance().type, "announce");
  for (let i=1;i<=5;i++) {
    const id = "P" + i;
    const command = advance();
    assert.deepEqual(command, {type:"open",kind:"opinion",room:"P",measure:id});
    const poll = state.polls.at(-1);
    assert.match(projected().html, /votez pour, contre ou abstenez-vous/);
    const voter = poll.eligible[i-1];
    vote(voter, poll, [i < 4 ? "pour" : "contre"]);
    assert.equal(advance().type, "close");
    assert.ok(projected().slide.rows.every((r) => r.score === ""));
    assert.equal(advance().type, "announce");
    assert.equal(projected().slide.net, i < 4 ? 1 : -1);
    assert.match(projected().html, /Score net/);
    assert.equal(get("MOD-P").rooms.P.ranking.length, i);
    if (i < 5) assert.equal(advance().slide, "measure-P" + (i+1));
  }
  const ranking = state.polls.at(-1);
  assert.equal(ranking.kind,"ranking");
  assert.equal(advance().slide,"result-" + ranking.id);
  assert.match(projected().html, /Égalité à départager/);
  assert.ok(!projected().html.includes("0 votant"));
  assert.equal(advance().type,"tie");
  const tie=state.polls.at(-1);
  vote("C1",tie,["P1","P2"]);
  assert.equal(advance().type,"close");
  assert.equal(advance().type,"announce");
  assert.deepEqual(get("REG").rooms.P.finalists,["P1","P2"]);
});

test("Une proposition à zéro affiche son score et ne provoque pas de départage entre pour et contre", () => {
  const {state, vote, advance, projected} = setup();
  advance();
  const poll = state.polls.at(-1);
  vote("C1", poll, ["pour"]);
  vote("C5", poll, ["contre"]);
  advance();
  advance();
  const result = projected();
  assert.equal(result.slide.net, 0);
  assert.match(result.html, /Score net de la proposition : 0/);
  assert.doesNotMatch(result.html, /Égalité à départager/);
  assert.equal(advance().slide, "measure-P2");
});

test("La régie révèle les voix ordinaires avant les renforts, y compris après rechargement et dans l’historique", () => {
  const {state, run, get, vote, advance, projected} = setup();
  for (const [room, settings] of Object.entries(state.rooms))
    settings.finalists = [room+"1",room+"2"];
  run("PRE",{type:"phase"});
  assert.equal(advance("").slide,"measure-P1");
  assert.equal(advance("").slide,"measure-P2");
  assert.equal(advance("").slide,"compare-P");
  assert.equal(advance("").kind,"plenary");
  const poll = state.polls.at(-1);
  vote("C1",poll,["P1"],true);
  vote("C2",poll,["P2"]);
  const menu = () => get("PRE").presentations.plenary.menu;
  assert.equal(advance("").type,"close");
  assert.ok(!menu().some((s) => s.id.startsWith("ordinary-") || s.id.startsWith("result-")));
  assert.equal(advance("").type,"revealOrdinary");
  const ordinary = projected("");
  assert.equal(ordinary.slide.kind, "Voix ordinaires");
  assert.deepEqual(ordinary.slide.rows.map((r)=>r.score),["1","1"]);
  assert.ok(ordinary.slide.rows.every((r)=>!r.selected && !Object.hasOwn(r,"boosts")));
  assert.ok(!ordinary.stage.polls[0].result && !ordinary.stage.rooms.P.winner);
  assert.ok(!menu().some((s)=>s.id.startsWith("result-")));
  assert.doesNotMatch(ordinary.html,/class="[^"]*stage-winner|class="chosen"/);
  assert.equal(advance("").type,"announce");
  const final = projected("");
  assert.deepEqual(final.slide.rows.map((r)=>[r.ordinaryVotes,r.boosts,r.score]),[[1,1,"2"],[1,0,"1"]]);
  assert.match(final.html,/La mesure P1 est adoptée/);
  assert.match(final.html,/1 voix ordinaire \+ 1 renfort/);
  assert.equal(advance("").slide,"measure-C1");
  run("PRE", {type:"presentSlide",room:"",slide:"ordinary-" + poll.id});
  assert.deepEqual(projected("").slide.rows, ordinary.slide.rows);
});
