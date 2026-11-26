import test from "node:test";
import assert from "node:assert/strict";
import { api } from "../functions/api.mjs";
import { create, token } from "../functions/engine.mjs";
import { demo } from "../functions/scenario.mjs";
test("Les accès de régie Google sont contrôlés pour la liste, la vue et les actions", async () => {
  const s = create(demo, 100);
  s.googleAdmin = true;
  const store = {
    get: async () => s,
    change: async (_, fn) => fn(s),
    list: async () => [{ code: s.code }],
    create: async () => {},
  };
  const handler = api(store, "clé", {
    verify: async (h) => {
      if (h !== "Bearer autorisé") throw Error("Refusé");
    },
  });
  async function request(op, body, header) {
    const res = {
      setHeader() {},
      end(data) {
        this.json = JSON.parse(data);
      },
    };
    await handler(
      {
        method: "POST",
        url: "/api/" + op,
        headers: { "content-type": "application/json", authorization: header },
        body,
      },
      res,
    );
    return res;
  }
  for (const h of [undefined, "Bearer autre"]) {
    assert.equal((await request("admin-list", {}, h)).statusCode, 400);
    assert.equal(
      (
        await request(
          "view",
          { id: "REG", code: s.code, key: token(s, "REG") },
          h,
        )
      ).statusCode,
      400,
    );
  }
  assert.equal(
    (await request("view", { id: "REG", code: s.code }, "Bearer autorisé")).json
      .me.role,
    "Régie",
  );
  assert.equal(
    (
      await request("action", {
        id: "REG",
        code: s.code,
        action: { type: "phase" },
      })
    ).statusCode,
    400,
  );
  assert.equal(
    (await request("view", { id: "C1", code: s.code, key: token(s, "C1") }))
      .json.me.role,
    "Citoyen",
  );
  assert.equal(
    (await request("admin-list", {}, "Bearer autorisé")).json.sessions.length,
    1,
  );
});

test("Les répétitions d’influence s’ouvrent séparément et conservent les essais déjà effectués", async () => {
  const pack = structuredClone(demo);
  pack.dispatches.push({id:"D02",title:"Deuxième dépêche",text:"Exercice."});
  const sessions = new Map([["AC20360001", {pack}]]);
  const store = {
    async get(code) {
      if (!sessions.has(code)) throw Error("Session introuvable");
      return sessions.get(code);
    },
    async create(s) { sessions.set(s.code,s); },
  };
  const handler = api(store, "", {async verify(bearer) {
    if (bearer !== "Bearer régie") throw Error("Connexion requise");
  }});
  async function open(code, authorization) {
    const response = {setHeader(){}, end(body){ this.body = JSON.parse(body); }};
    await handler({method:"POST",url:"/api/open-rehearsal",headers:{"content-type":"application/json",authorization},body:{code}},response);
    return response;
  }
  assert.equal((await open("AC20360004")).statusCode,400);
  assert.equal((await open("AC20360001","Bearer régie")).statusCode,400);
  const first = (await open("AC20360004","Bearer régie")).body;
  assert.equal(first.rulesVersion,2);
  assert.equal(first.polls.find(p => p.room === "C").kind,"opinion");
  const state = sessions.get("AC20360004");
  const { act } = await import("../functions/engine.mjs");
  act(state,state.members.C2,{type:"vote",poll:first.polls.find(p => p.room === "C").id,choices:["pour"]});
  const second = (await open("AC20360004","Bearer régie")).body;
  assert.equal(second.polls.find(p => p.room === "C").received,first.polls.find(p => p.room === "C").received + 1);
  assert.equal(sessions.get("AC20360001").pack,pack);
});
