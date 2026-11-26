import test from "node:test";
import assert from "node:assert/strict";
import { act, create, view } from "../functions/engine.mjs";
import { demo } from "../functions/scenario.mjs";

function fixture(version = 2) {
  const s = create(structuredClone(demo), 50, false, {rulesVersion: version});
  const command = (id, type, args = {}) => act(s, s.members[id], {type, ...args});
  const reg = (type, args) => command("REG", type, args);
  reg("phase");
  const inspect = (id) => view(s, s.members[id]);
  const points = (id) => inspect(id).wallet.points;
  const open = (measure) => {
    reg("open", {room: measure[0], kind: "opinion", measure});
    return s.polls.at(-1);
  };
  const vote = (p, id, choices, extra) => command(id, "vote", {poll: p.id, choices, ...extra});
  const publish = (p) => {
    reg("close", {poll: p.id});
    reg("announce", {poll: p.id});
  };
  return {s, command, reg, inspect, points, open, vote, publish};
}

test("A chaque mesure, le coût, la recharge et les dons sont bornés, idempotents et privés", () => {
  const {s, reg, command, inspect, points, open, vote, publish} = fixture();
  assert.equal(s.rulesVersion, 2);
  assert.equal(inspect("C1").wallet.cap, 3);
  assert.equal(inspect("L1").wallet, undefined);
  assert.equal(inspect("ECR-P").wallet, undefined);
  assert.throws(() => reg("open", {room:"P",kind:"selection"}));
  let p = open("P1");
  assert.equal(points("C1"), 2);
  vote(p, "C1", []);
  vote(p, "C1", ["contre"]);
  assert.equal(points("C1"), 3);
  command("L1", "offer", {to:"C1", measure:"P2", requestId:"lobby-retry"});
  command("L1", "offer", {to:"C1", measure:"P2", requestId:"lobby-retry"});
  assert.equal(s.offers.length, 1);
  const offer = s.offers[0].id;
  assert.throws(() => command("C1","respond",{offer,accept:true}), /pleine/);
  assert.equal(s.offers[0].status,"proposé");
  vote(p,"C5",["contre"]);
  assert.equal(points("C5"),1);
  assert.equal(points("C9"),2);
  assert.equal(inspect("C1").polls[0].result, undefined);
  publish(p);
  assert.deepEqual(inspect("ECR-P").rooms.P.ranking[0], {id:"P1",score:-1,for:0,against:1,abstain:1});
  assert.throws(() => open("P1"));
  assert.throws(() => command("C1","amend",{measure:"P1",text:"Clause",why:"Motif"}));
  p=open("P2");
  vote(p,"C1",["contre"]);
  assert.equal(points("C1"),2);
  command("C1","respond",{offer,accept:true});
  command("C1","respond",{offer,accept:true});
  assert.equal(points("C1"),3);
  vote(p,"C5",["pour"]);
  publish(p);
  p=open("P3");
  assert.throws(()=>vote(p,"C5",["pour"]), /vide/);
  assert.equal(inspect("C5").polls.find((v)=>v.id===p.id).voted,false);
  vote(p,"C5",[]);
  assert.equal(points("C5"),1);
  publish(p);
  assert.equal(s.rooms.P.ranking.find((v)=>v.id==="P3").score,0);
});

test("Annuler une urne restitue ses points en conservant un don intercalé ; la substitution papier ne révèle aucun bulletin", () => {
  const {s,reg,command,points,open,vote,publish}=fixture();
  const p=open("P1");
  vote(p,"C1",["pour"]);
  command("L1","offer",{to:"C1"});
  command("C1","respond",{offer:s.offers[0].id,accept:true});
  vote(p,"C5",[]);
  assert.equal(points("C1"),2);
  assert.equal(points("C5"),3);
  reg("suspend",{poll:p.id,reason:"Connexion interrompue"});
  reg("resume",{poll:p.id,reason:"Connexion rétablie"});
  vote(p,"C1",["pour"]);
  assert.equal(points("C1"),2);
  reg("suspend",{poll:p.id,reason:"Nouveau dépouillement"});
  reg("restart",{poll:p.id,reason:"Reprendre le scrutin"});
  assert.equal(points("C1"),3);
  assert.equal(points("C5"),2);
  const reprise=s.polls.at(-1);
  vote(reprise,"C5",["contre"]);
  reg("suspend",{poll:reprise.id,reason:"Panne"});
  reg("paper",{poll:reprise.id,count:5,abstain:2,raw:{pour:1,contre:2},checked:true,reason:"Comptage vérifié"});
  assert.equal(points("C5"),2);
  const paper=s.polls.at(-1);
  reg("announce",{poll:paper.id});
  assert.deepEqual(s.rooms.P.ranking,[{id:"P1",score:-1,for:1,against:2,abstain:2}]);
  const empty=open("P2");
  reg("close",{poll:empty.id});
  assert.equal(empty.status,"incident");
  reg("restart",{poll:empty.id,reason:"Participants prêts"});
  const allAbstained=s.polls.at(-1);
  vote(allAbstained,"C5",[]);
  publish(allAbstained);
  assert.equal(allAbstained.result.score,0);
  assert.equal(points("C5"),3);
});

test("Le classement retient même un score négatif et départage gratuitement les seules mesures ex æquo", () => {
  const {s,command,inspect,reg,points,open,vote,publish}=fixture();
  command("L2","offer",{to:"C1",measure:"P2"});
  const votes=[
    [["C1","contre"]], [["C5","contre"],["C9","contre"]],
    [["C13","contre"],["C17","contre"]], [["C21","contre"],["C25","contre"],["C29","contre"]],
    [["C21","contre"],["C25","contre"],["C29","contre"],["C33","contre"]],
  ];
  votes.forEach((ballots,i)=>{
    const p=open("P"+(i+1));
    for(const [id,choice] of ballots) vote(p,id,[choice]);
    publish(p);
  });
  const ranking=s.polls.at(-1);
  assert.equal(ranking.kind,"ranking");
  assert.equal(ranking.status,"égalité");
  assert.equal(s.rooms.P.displaySlide,"result-"+s.polls.at(-2).id);
  assert.deepEqual(ranking.result.top,["P1"]);
  assert.deepEqual(ranking.result.tied,["P2","P3"]);
  assert.equal(s.rooms.P.locked,true);
  assert.equal(s.offers[0].status,"expiré");
  assert.throws(()=>command("C1","respond",{offer:s.offers[0].id,accept:true}));
  assert.equal(inspect("L2").targets.some((m)=>m.room==="P"),false);
  reg("tie",{poll:ranking.id});
  const tie=s.polls.at(-1);
  assert.deepEqual(tie.options,["P2","P3"]);
  const before=points("C1");
  assert.throws(()=>vote(tie,"C1",["P3"],{boost:true}));
  vote(tie,"C1",["P3"]);
  assert.equal(points("C1"),before);
  publish(tie);
  assert.deepEqual(s.rooms.P.finalists,["P1","P3"]);
});

test("Le duel révèle les voix ordinaires puis les renforts, et conserve le solde complet", () => {
  const {s,reg,inspect,command,points,vote}=fixture();
  command("L1","offer",{to:"C1",measure:"P1"});
  command("C1","respond",{offer:s.offers[0].id,accept:true});
  for(const [room,r] of Object.entries(s.rooms)) r.finalists=[room+"1",room+"2"];
  reg("phase");
  assert.equal(points("C1"),3);
  reg("open",{kind:"plenary",room:"P"});
  const p=s.polls.at(-1);
  assert.throws(()=>vote(p,"C5",[],{boost:true}));
  vote(p,"C1",["P2"],{boost:true});
  vote(p,"C1",["P1"],{boost:true});
  vote(p,"C2",["P1"]);
  vote(p,"C5",[]);
  assert.equal(points("C1"),2);
  assert.equal(points("C2"),2);
  assert.equal(points("C5"),2);
  reg("close",{poll:p.id});
  for(const id of ["C1","ECR-PL","REG"]) {
    const held=inspect(id).polls.at(-1);
    assert.equal(held.result,undefined);
    assert.equal(held.ordinary,undefined);
  }
  assert.throws(()=>reg("announce",{poll:p.id}));
  reg("revealOrdinary",{poll:p.id});
  for(const id of ["C1","ECR-PL","REG"]) {
    const partial=inspect(id).polls.at(-1);
    assert.equal(partial.result,undefined);
    assert.equal(partial.winners,undefined);
    assert.deepEqual(partial.ordinary,{rows:[{id:"P1",raw:1},{id:"P2",raw:1}],voters:3,abstain:1});
  }
  const reread=JSON.parse(JSON.stringify(s));
  assert.equal(view(reread,reread.members.C1).polls.at(-1).status,"ordinaire");
  assert.throws(()=>reg("open",{kind:"plenary",room:"C"}));
  reg("announce",{poll:p.id});
  assert.deepEqual(p.result.rows[0],{id:"P2",raw:1,bonus:1,weight:2});
  assert.equal(s.rooms.P.winner,"P2");
  assert.equal(inspect("ECR-PL").polls.at(-1).winners[0],"P2");
});

test("Une session enregistrée avant le versionnage conserve ses règles", () => {
  const {s,reg,inspect}=fixture(1);
  delete s.rulesVersion;
  assert.equal(inspect("C1").rulesVersion,1);
  assert.equal(inspect("C1").wallet,undefined);
  assert.throws(()=>reg("open",{kind:"opinion",room:"P",measure:"P1"}));
  reg("open",{kind:"selection",room:"P"});
  assert.equal(s.polls.at(-1).seats,2);
});

test("Une séance V2 traite un amendement gratuit, vingt mesures, quatre duels et un départage gratuit à solde nul", () => {
  const {s, reg, command, inspect, points, open, vote, publish} = fixture();
  command("C1", "amend", {measure: "P1", text: "Améliorer le projet.", why: "Motif débattu."});
  const amend = s.amends[0].id;
  command("C5", "sign", {amend});
  assert.throws(() => open("P1"), /amendements/);
  reg("review", {amend, profile: "P1-A", status: "admissible", reason: "Recevable."});
  reg("open", {kind: "amend", room: "P", measure: "P1"});
  const ap = s.polls.at(-1);
  vote(ap, "C1", [amend]);
  vote(ap, "C5", []);
  publish(ap);
  assert.equal(points("C1"), 2);
  assert.equal(points("C5"), 2);
  assert.equal(s.rooms.P.official.P1, amend);
  for (const room of Object.keys(s.rooms)) {
    for (let i = 0; i < 5; i++) {
      const p = open(room + (i + 1));
      if (i < 2) vote(p, p.eligible[0], ["pour"]);
      if (i === 0) vote(p, p.eligible[1], ["pour"]);
      if (i >= 2) vote(p, p.eligible[i], ["contre"]);
      publish(p);
    }
    assert.deepEqual(s.rooms[room].finalists, [room + "1", room + "2"]);
  }
  reg("phase");
  assert.equal(points("C1"), 0);
  for (const room of Object.keys(s.rooms)) {
    reg("open", {room, kind: "plenary"});
    const duel = s.polls.at(-1);
    assert.throws(() => vote(duel, "C1", [room + "1"], {boost:true}), /vide/);
    vote(duel, "C1", [room + "1"]);
    if (room === "P") vote(duel, "C2", ["P2"]);
    reg("close", {poll:duel.id});
    reg("revealOrdinary", {poll:duel.id});
    reg("announce", {poll:duel.id});
    if (room === "P") {
      reg("tie", {poll:duel.id});
      const runoff = s.polls.at(-1);
      assert.throws(() => vote(runoff, "C5", ["P2"], {boost:true}), /renfort/);
      vote(runoff, "C1", ["P2"]);
      publish(runoff);
      assert.equal(s.rooms.P.winner, "P2");
    }
    assert.equal(points("C1"), 0);
  }
  reg("phase");
  assert.equal(inspect("C1").phase, "Débriefing");
});
