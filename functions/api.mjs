import { create, identify, view, act, token } from "./engine.mjs";
import { demo, check } from "./scenario.mjs";
import { timingSafeEqual, createHash } from "node:crypto";
const hash = (v) => createHash("sha256").update(String(v)).digest();
export function api(store, adminKey) {
  return async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    try {
      check(
        req.method === "POST" &&
          req.headers["content-type"]?.startsWith("application/json"),
        "Requête JSON attendue",
      );
      let body = req.body;
      if (!body) {
        let chunks = [],
          size = 0;
        for await (let c of req) {
          size += c.length;
          check(size <= 550000, "Requête trop grande");
          chunks.push(c);
        }
        body = JSON.parse(Buffer.concat(chunks).toString());
      }
      check(JSON.stringify(body).length <= 550000, "Requête trop grande");
      const { code, id, key, action } = body;
      const op = req.url.split("?")[0].split("/").filter(Boolean).at(-1);
      let result;
      if (op === "create") {
        check(
          adminKey && timingSafeEqual(hash(adminKey), hash(body.adminKey)),
          "Clé organisateur invalide",
        );
        const s = create(
          body.pack || demo,
          Number(body.count),
          !!body.review,
          body.settings || {},
        );
        await store.create(s);
        result = { code: s.code, id: "REG", key: token(s, "REG") };
      } else {
        check(
          /^[A-F0-9]{10}$/.test(code) && ["view", "action"].includes(op),
          "Session ou commande invalide",
        );
        const handle = (s) => {
          let a = identify(s, id, key);
          if (op === "action") {
            act(s, a, action);
            return { ok: true };
          }
          return view(s, a);
        };
        result =
          op === "action"
            ? await store.change(code, handle)
            : handle(await store.get(code));
      }
      res.end(JSON.stringify(result));
    } catch (e) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: e.message || "La demande a échoué" }));
    }
  };
}
