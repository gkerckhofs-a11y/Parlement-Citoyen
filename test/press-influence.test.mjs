import test from "node:test";
import assert from "node:assert/strict";
import { act, create, readVisitCard, token, view } from "../functions/engine.mjs";
import { api } from "../functions/api.mjs";
import { demo } from "../functions/scenario.mjs";
import { findPressSources, pressAwardNotice } from "../public/press-influence.js";

function session(review=false, rulesVersion=2) {
  const s = create(demo,50,review,{rulesVersion});
  const doAs = (id, type, args={}) => act(s,s.members[id],{type,...args});
  const get = (id) => view(s,s.members[id]);
  doAs("REG","phase");
  const article = (id, args={}) => doAs(id,"article",{title:"Au Parlement",text:"Reportage.",publish:true,...args});
  return {s,doAs,get,article};
}

test("Un contact scanné reste personnel, peut être retrouvé par nom, groupe ou identifiant et cité sans crédit",()=>{
  const {s,doAs,get,article} = session();
  doAs("C1","gameName",{gameName:"Étoile verte"});
  const card = get("C1").myCard.card;
  assert.equal(readVisitCard(s,card).gameName,"Étoile verte");
  assert.throws(()=>doAs("C2","pressContact",{card}));
  assert.throws(()=>doAs("J1","pressContact",{card:"C1"}));
  doAs("J1","pressContact",{card});
  doAs("J1","pressContact",{card});
  const j=get("J1");
  for (const q of ["etoile", "C1","Territoire 1"])
    assert.ok(findPressSources(j,q,[]).some((p)=>p.id==="C1"));
  assert.deepEqual(j.pressContacts,["C1"]);
  assert.deepEqual(get("J3").pressContacts,[]);
  assert.equal(get("ECR").pressDirectory,undefined);
  assert.equal(j.pressDirectory[0].card,undefined);
  article("J1",{cited:["C1","L1","J2"]});
  assert.deepEqual(get("C2").news[0].cited.map((p)=>p.id),["C1","L1","J2"]);
  assert.equal(get("C1").wallet.points,2);
  assert.equal(get("J1").pressRemaining,2);
  assert.deepEqual(get("C1").pressNews,[]);
});

test("Deux crédits par rédaction, un par citoyen, dont seule la première publication peut disposer",()=>{
  const {s,doAs,get,article} = session();
  const saved={cited:["C1","C2","L1"],awardTo:["C1"],requestId:"first"};
  article("J1",saved);
  article("J1",saved);
  const original=get("J3").desk[0], news=get("C2").news[0];
  assert.equal(s.articles.length,1);
  assert.equal(get("J1").pressRemaining,1);
  assert.equal(get("J3").pressRemaining,1);
  assert.equal(get("J2").pressRemaining,2);
  assert.equal(news.awardTo,undefined);assert.equal(news.pressAwards,undefined);
  assert.equal(get("C1").wallet.points,3);
  assert.equal(get("C1").pressNews[0].id,news.id);
  assert.ok(pressAwardNotice(get("C1"),{h:String}).includes("#article="+news.id));
  assert.deepEqual(get("C2").pressNews,[]);
  article("J3",{id:original.id,revision:1,cited:["C2"],awardTo:["C2"]});
  assert.equal(get("C2").wallet.points,2);
  article("J2",{cited:["C1"],awardTo:["C1"]});
  assert.equal(get("J2").desk[0].pressAwards[0].status,"already");
  assert.equal(get("J2").pressRemaining,2);
  article("J3",{cited:["C2","C3"],awardTo:["C2","C3"]});
  assert.deepEqual(get("J3").desk.at(-1).pressAwards.map((e)=>e.status),["credited","empty"]);
  assert.equal(get("J1").pressRemaining,0);
  assert.equal(get("C3").wallet.points,2);
  doAs("REG","editorial",{id:original.id,accept:false,hide:true,reason:"Vérification."});
  assert.equal(get("C1").pressNews[0].visible,false);
  assert.ok(!pressAwardNotice(get("C1"),{h:String}).includes("href="));
  assert.throws(()=>article("J2",{cited:["C3"],awardTo:["C4"]}));
  assert.throws(()=>article("J2",{cited:["L1"],awardTo:["L1"]}));
});

test("Modération, plafond, absence, clôture globale et verrou d’une salle",()=>{
  const {s,doAs,get,article} = session(true);
  s.wallets={C1:3};
  s.rooms.P.locked=true;
  doAs("REG","presence",{member:"C3",present:false});
  article("J1",{publish:false,cited:["C1","C5"],awardTo:["C1","C5"]});
  let item=get("J1").desk[0];
  assert.equal(get("J1").pressRemaining,2);
  article("J1",{id:item.id,revision:item.revision});
  assert.equal(get("J1").pressRemaining,2);
  doAs("REG","editorial",{id:item.id,accept:false,reason:"Ajoutez le lieu."});
  assert.equal(get("C5").wallet.points,2);
  article("J1",{id:item.id});
  doAs("REG","editorial",{id:item.id,accept:true});
  assert.throws(()=>doAs("REG","editorial",{id:item.id,accept:true}));
  assert.deepEqual(get("J1").desk[0].pressAwards.map((e)=>e.status),["full","credited"]);
  assert.equal(get("C5").wallet.points,3);
  s.wallets.C1=1;
  article("J1",{id:item.id,cited:["C1"],awardTo:["C1"]});
  doAs("REG","editorial",{id:item.id,accept:true});
  assert.equal(get("C1").wallet.points,1);
  article("J1",{cited:["C3"],awardTo:["C3"]});
  doAs("REG","editorial",{id:get("J1").desk.at(-1).id,accept:true});
  assert.equal(get("J1").pressRemaining,1);
  article("J1",{cited:["C2"],awardTo:["C2"]});
  s.phase="Plénière";
  doAs("REG","editorial",{id:get("J1").desk.at(-1).id,accept:true});
  assert.equal(get("C2").wallet.points,2);
  assert.equal(get("J1").pressRemaining,1);
});

test("Une séance historique conserve ses articles et ne propose aucun crédit de presse",()=>{
  const {s,get,doAs,article}=session(false,1);
  delete s.rulesVersion;
  article("J1",{cited:["C1"],awardTo:["C1"]});
  assert.equal(get("J1").pressDirectory,undefined);
  assert.equal(get("C1").pressNews,undefined);
  assert.equal(get("C1").news[0].cited,undefined);
  assert.equal(get("J1").desk[0].pressAwards,undefined);
  assert.throws(()=>doAs("J1","pressContact",{card:get("C1").myCard.card}));
});


test("L’aperçu privé vérifie uniquement les bénéficiaires nommés, sans débit, et réévalue à la publication", async () => {
  const {s,get,article} = session();
  s.wallets = {C1:3};
  const app = api({get: () => s, change: () => assert.fail("Un aperçu ne peut pas écrire.")});
  async function preview(id, recipients, extras = {}) {
    const res = { statusCode:200, setHeader(){}, end(json){this.value=JSON.parse(json);} };
    await app({method:"POST",url:"/api/press-preview",headers:{"content-type":"application/json"},
      body:{code:s.code,id,key:token(s,id),recipients,...extras}},res);
    return res;
  }
  const before = structuredClone(s);
  assert.deepEqual((await preview("J1",["C1","C2"])).value,[
    {id:"C1",status:"full"},{id:"C2",status:"available"}
  ]);
  assert.deepEqual(s,before);
  assert.equal(get("J1").pressDirectory.some((source)=>"points" in source || "status" in source),false);
  for (const id of ["C1","L1","REG"]) assert.equal((await preview(id,["C1"])).statusCode,400);
  for (const list of [[],["L1"],["C1","C1"],["C1","C2","C3"]])
    assert.equal((await preview("J1",list)).statusCode,400);
  assert.equal((await preview("J1",["C1"],{key:token(s,"C1")})).statusCode,400);
  article("J2",{cited:["C2"],awardTo:["C2"],requestId:"published-once"});
  article("J1",{cited:["C2","C3"],awardTo:["C2","C3"]});
  assert.deepEqual(get("J1").desk[0].pressAwards.map((x)=>x.status),["already","credited"]);
  assert.equal((await preview("J2",["C2"],{requestId:"published-once"})).value[0].status,"submitted");
  assert.equal((await preview("J2",["C1"],{article:get("J1").desk[0].id})).statusCode,400);
  assert.equal((await preview("J1",["C1"],{article:get("J1").desk[0].id})).value[0].status,"published");
  assert.equal(get("J1").pressRemaining,1);
});
