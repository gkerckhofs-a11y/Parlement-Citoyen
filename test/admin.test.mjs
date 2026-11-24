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
