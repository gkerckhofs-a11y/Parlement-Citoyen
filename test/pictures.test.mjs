import test from "node:test";
import assert from "node:assert/strict";
import { api } from "../functions/api.mjs";
import { create, token } from "../functions/engine.mjs";
import { demo } from "../functions/scenario.mjs";

test("Une photo suit la relecture et le retrait de son article, y compris dans une session existante", async () => {
  const s = create(structuredClone(demo), 50, true);
  delete s.members["ECR-NEWS"];
  const pictures = new Map();
  const handler = api({
    get: async () => s,
    change: async (code, fn) => fn(s, (id, bytes) => pictures.set(id, bytes)),
    picture: async (code, id) => pictures.get(id),
  });
  async function request(op, id, fields = {}) {
    const res = {
      statusCode: 200,
      setHeader() {},
      end(data) {
        this.value = JSON.parse(data);
      },
    };
    await handler(
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        url: "/api/" + op,
        body: { code: s.code, id, key: token(s, id), ...fields },
      },
      res,
    );
    return res;
  }
  await request("action", "REG", { action: { type: "phase" } });
  assert.ok(s.members["ECR-NEWS"]);
  const photo =
    "data:image/jpeg;base64," +
    Buffer.from([255, 216, 255, 217]).toString("base64");
  assert.equal(
    (
      await request("action", "J1", {
        action: {
          type: "article",
          title: "À la commission",
          text: "La séance est ouverte.",
          publish: true,
          photo,
        },
      })
    ).statusCode,
    200,
  );
  const article = s.articles[0],
    image = article.draft.image;
  assert.equal(
    (await request("picture", "ECR-NEWS", { image })).statusCode,
    400,
  );
  assert.equal((await request("picture", "J1", { image })).value.photo, photo);
  assert.equal((await request("picture", "J2", { image })).statusCode, 400);
  await request("action", "REG", {
    action: { type: "editorial", id: article.id, accept: true },
  });
  assert.equal(
    (await request("picture", "ECR-NEWS", { image })).value.photo,
    photo,
  );
  await request("action", "REG", {
    action: {
      type: "editorial",
      id: article.id,
      hide: true,
      reason: "Correction",
    },
  });
  assert.equal(
    (await request("picture", "ECR-NEWS", { image })).statusCode,
    400,
  );
});
