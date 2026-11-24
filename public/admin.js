import { connect, bearer, logout, signedIn } from "./google.js?v=regie2";
const main = document.querySelector("#main"),
  notice = document.querySelector("#feedback");
function el(tag, text) {
  let n = document.createElement(tag);
  if (text) n.textContent = text;
  return n;
}
function button(text, fn) {
  let n = el("button", text);
  n.onclick = async () => {
    n.disabled = true;
    notice.textContent = "";
    try {
      await fn();
    } catch (e) {
      notice.textContent = e.message;
    } finally {
      n.disabled = false;
    }
  };
  return n;
}
async function api(op, body = {}) {
  let r = await fetch("/api/" + op, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + (await bearer()),
    },
    body: JSON.stringify(body),
  });
  let j = await r.json();
  if (!r.ok) throw Error(j.error);
  return j;
}
async function enter(code) {
  const state = await api("view", { code, id: "REG" });
  const { openGoogleDesk } = await import("./app.js?v=commission1");
  const url = new URL(location.href);
  if (url.searchParams.get("session") !== code) url.searchParams.delete("commission");
  url.searchParams.set("session", code);
  history.replaceState(null, "", url);
  openGoogleDesk(code, state);
  notice.textContent = "";
}
const scenarios = {
  AC20360001:
    "Prévention : instruire l’amendement de C1 et tester l’offre d’influence. Soins : voter avec C2. Environnement : lancer le départage. Sécurité : vérifier les finalistes. Ouvrir J1, J2 ou J3 pour explorer la presse.",
  AC20360002:
    "Ouvrir C1 pour voter dans le premier duel, puis annoncer les résultats en présidence. Les huit finalistes sont déjà qualifiés.",
  AC20360003:
    "Consulter le bilan en régie, projeter le journal 2040 et exporter les résultats. Ouvrir C1 pour essayer le sondage facultatif.",
};
async function home() {
  main.className = "portal";
  const mast = el("div");
  mast.className = "mast";
  mast.append(el("h1", "Administration du Parlement"));
  main.replaceChildren(mast);
  if (!signedIn()) {
    mast.append(
      el(
        "p",
        "Connectez-vous avec le compte Google autorisé pour ouvrir la régie.",
      ),
      button("Continuer avec Google", async () => {
        await connect();
        await home();
      }),
    );
    return;
  }
  main.append(
    button("Déconnexion Google", async () => {
      await logout();
      sessionStorage.removeItem("pc.auth");
      await home();
    }),
  );
  const selected = new URLSearchParams(location.search).get("session");
  if (selected && /^[A-F0-9]{10}$/.test(selected)) {
    try {
      await enter(selected);
      return;
    } catch (e) {
      notice.textContent = e.message;
    }
  }
  const { sessions } = await api("admin-list");
  for (const [title, items] of [
    [
      "Répétition · Urgence citoyenne",
      sessions.filter((s) => scenarios[s.code]),
    ],
    ["Autres sessions", sessions.filter((s) => !scenarios[s.code])],
  ]) {
    if (!items.length) continue;
    main.append(el("h2", title));
    let grid = el("div");
    grid.className = "grid";
    main.append(grid);
    for (const s of items) {
      let card = el("article");
      card.className = "session-card";
      card.append(
        el("small", s.code),
        el(
          "h3",
          scenarios[s.code] ? s.title.split(" · ")[1] || s.title : s.title,
        ),
      );
      card.append(el("small", "Phase actuelle · " + s.phase));
      if (scenarios[s.code]) card.append(el("p", scenarios[s.code]));
      card.append(
        button("Ouvrir la régie", () => enter(s.code)),
        button("Afficher en salle", async () => {
          await enter(s.code);
          const title = document.getElementById("projection-title");
          title?.focus();
          title?.scrollIntoView({ block: "start" });
        }),
      );
      grid.append(card);
    }
  }
  let card = el("article"),
    count = el("input"),
    file = el("input"),
    review = el("input");
  count.type = "number";
  count.min = "12";
  count.max = "150";
  count.value = "100";
  file.type = "file";
  file.accept = ".json";
  review.type = "checkbox";
  card.append(el("h2", "Créer une session"));
  for (let [name, input] of [
    ["Nombre d’élèves", count],
    ["Scénario JSON (facultatif)", file],
    ["Relire les articles avant publication", review],
  ]) {
    let label = el("label", name);
    label.append(input);
    card.append(label);
  }
  card.append(
    button("Créer et ouvrir", async () => {
      let pack = file.files[0] ? JSON.parse(await file.files[0].text()) : null;
      let s = await api("create", {
        pack,
        count: Number(count.value),
        review: review.checked,
      });
      await enter(s.code);
    }),
  );
  main.append(card);
}
home().catch((e) => (notice.textContent = e.message));
