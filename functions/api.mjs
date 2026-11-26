import {
  create,
  identify,
  view,
  act,
  token,
  ensureProjectionScreens,
  readVisitCard,
  previewPressAwards,
} from "./engine.mjs";
import { rehearsals, rehearsal, influenceTrials } from "./rehearsal.mjs";
import { demo, check } from "./scenario.mjs";
import { timingSafeEqual, createHash, createHmac } from "node:crypto";
const hash = (v) => createHash("sha256").update(String(v)).digest();
export function api(store, adminKey, google) {
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
      const bearer = req.headers.authorization;
      if (op === "prepare-rehearsals" && google) {
        result = await google.install(store, body);
      } else if (op === "open-rehearsal" && google) {
        await google.verify(bearer);
        const i = influenceTrials.indexOf(code);
        check(i >= 0, "Répétition inconnue");
        let session;
        try {
          session = await store.get(code);
        } catch (error) {
          if (error.message !== "Session introuvable") throw error;
          const previous = await store.get(rehearsals[i][0]);
          const pack = {...previous.pack, title:previous.pack.title.replace(/^Répétition · [^·]+ · /, "")};
          const trial = rehearsal(pack, i, 2);
          try { await store.create(trial); session = trial; }
          catch (writeError) {
            if (writeError.code !== 6) throw writeError;
            session = await store.get(code);
          }
        }
        check(session.googleAdmin && session.rulesVersion === 2, "Répétition indisponible");
        result = view(session, session.members.REG);
      } else if (op === "admin-list" && google) {
        await google.verify(bearer);
        result = { sessions: await store.list() };
      } else if (op === "create") {
        if (bearer && google) await google.verify(bearer);
        else
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
        if (bearer && google) s.googleAdmin = true;
        await store.create(s);
        result = s.googleAdmin
          ? { code: s.code, id: "REG", google: true }
          : { code: s.code, id: "REG", key: token(s, "REG") };
      } else if (op === "card") {
        check(
          typeof code === "string" && /^[A-F0-9]{10}$/.test(code) &&
          typeof body.card === "string" && /^[A-Za-z0-9_-]{24}$/.test(body.card),
          "Carte de visite invalide.",
        );
        result = readVisitCard(await store.get(code), body.card);
      } else {
        check(
          /^[A-F0-9]{10}$/.test(code) &&
            ["view", "action", "picture", "press-preview"].includes(op),
          "Session ou commande invalide",
        );
        let googleAccess = false;
        if (bearer && google && id === "REG") {
          await google.verify(bearer);
          googleAccess = true;
        }
        const handle = (s, savePicture) => {
          if (op !== "press-preview") ensureProjectionScreens(s);
          check(
            id !== "REG" || !s.googleAdmin || googleAccess,
            "Connexion Google requise.",
          );
          let a = googleAccess ? s.members.REG : identify(s, id, key);
          if (op === "press-preview") return previewPressAwards(s, a, body);
          if (op === "action") {
            if (action?.type === "article") {
              const { photo, image: ignored, ...draft } = action;
              if (photo) {
                check(
                  a.role === "Journaliste" &&
                    typeof photo === "string" &&
                    photo.length <= 320000 &&
                    /^data:image\/jpeg;base64,[a-zA-Z0-9+/]+=*$/.test(photo),
                  "Photographie invalide ou trop lourde",
                );
                const bytes = Buffer.from(photo.split(",")[1], "base64");
                check(
                  bytes[0] === 255 &&
                    bytes[1] === 216 &&
                    bytes.at(-2) === 255 &&
                    bytes.at(-1) === 217,
                  "Format JPEG attendu",
                );
                draft.image = createHmac("sha256", s.secret)
                  .update(bytes)
                  .digest("hex");
                act(s, a, draft);
                savePicture(draft.image, bytes);
              } else act(s, a, draft);
            } else act(s, a, action);
            return { ok: true };
          }
          if (op === "picture") {
            const image = body.image;
            check(
              typeof image === "string" &&
                /^[0-9a-f]{64}$/.test(image) &&
                s.articles.some(
                  (n) =>
                    n.public?.image === image ||
                    ((a.role === "Régie" ||
                      (a.role === "Journaliste" && n.group === a.group)) &&
                      n.draft?.image === image),
                ),
              "Photo indisponible",
            );
            return store
              .picture(code, image)
              .then((bytes) => ({
                photo: "data:image/jpeg;base64," + bytes.toString("base64"),
              }));
          }
          return view(s, a);
        };
        result =
          op === "action"
            ? await store.change(code, handle)
            : await handle(await store.get(code));
      }
      res.end(JSON.stringify(result));
    } catch (e) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: e.message || "La demande a échoué" }));
    }
  };
}
