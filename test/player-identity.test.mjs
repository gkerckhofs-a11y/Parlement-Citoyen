import test from "node:test";
import assert from "node:assert/strict";
import { identityMark, identityStyle, identityTheme, roleMark } from "../public/player-identity.js";

test("Rôles et territoires restent reconnaissables en couleur et en niveaux de gris", () => {
  const people = ["Citoyen","Journaliste","Lobby"].map(role => ({role}));
  assert.equal(new Set(people.map(p => identityTheme(p).color)).size, 3);
  assert.equal(new Set(people.map(roleMark)).size, 3);

  const towns = Array.from({length:7}, (_,i) => ({role:"Citoyen",group:"T"+i,groupName:"Territoire"}));
  assert.equal(new Set(towns.map(p => identityTheme(p).color)).size, 1);
  assert.equal(new Set(towns.map(p => identityTheme(p).territoryColor)).size, 7);
  assert.equal(new Set(towns.map(identityMark)).size, 7);
  const renamed = {...towns[3], groupName:"Nouveau nom",room:"C"};
  assert.equal(identityStyle(renamed),identityStyle(towns[3]));
  assert.equal(identityMark(renamed),identityMark(towns[3]));
  assert.equal(identityTheme(renamed).territoryLabel,"Nouveau nom");
  assert.notEqual(identityMark({...towns[0],group:"T7"}),identityMark(towns[0]));
  for (const role of ["Régie","Projection","Présidence","Modérateur"])
    assert.equal(identityTheme({role}).roleKey,"");
});
