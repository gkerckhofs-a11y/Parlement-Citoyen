import { projectionLink, screenForScope } from "./projection-access.js";
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
const influenceTrials = ["AC20360004","AC20360005","AC20360006"];
async function enter(code) {
  const state = await api(influenceTrials.includes(code) ? "open-rehearsal" : "view", { code, id: "REG" });
  const url = new URL(location.href);
  const rehearsal =
    url.searchParams.get("session") === code &&
    (code === "AC20360001" || influenceTrials.includes(code)) &&
    url.searchParams.get("essai");
  if (rehearsal) {
    const trials = new Map([
      ["vote", [code === "AC20360005" ? "C1" : "C2", "vote"]],
      ["presse", ["J1", "redaction"]],
      ["influence", ["C1", "influence"]],
      ["carte", ["C1", "carte"]],
      ["lobby", ["L1", "groupe"]],
    ]);
    const selected = trials.get(rehearsal);
    const person =
      selected &&
      state.roster?.find(
        (member) =>
          member.id === selected[0] &&
          ["Citoyen", "Lobby", "Journaliste"].includes(member.role),
      );
    if (!person) throw Error("Ce profil de répétition est indisponible.");
    location.replace(
      "/#" +
        new URLSearchParams({
          code,
          id: person.id,
          key: person.key,
          rubrique: selected[1],
        }),
    );
    return;
  }
  const target =
    url.searchParams.get("session") === code &&
    url.searchParams.get("projection");
  if (target) {
    const screen = screenForScope(state, target);
    const path = screen && projectionLink(code, screen);
    if (!path)
      throw Error("Cet écran de salle est indisponible dans cette session.");
    location.replace(path);
    return;
  }
  const { openGoogleDesk } = await import("./app.js?v=reserve1");
  if (url.searchParams.get("session") !== code) {
    for (const name of ["commission", "projection", "regie", "essai"])
      url.searchParams.delete(name);
  }
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
      if (new URLSearchParams(location.search).has("projection")) return;
    }
  }
  const { sessions } = await api("admin-list");
  if (sessions.some(s => s.code === "AC20360001")) {
    main.append(el("h2","Répétitions · Votes et influence"));
    const grid = el("div");
    grid.className = "grid";
    for (const [i, title] of ["Commissions", "Plénière", "Débriefing"].entries()) {
      const block = el("article");
      block.className = "session-card";
      block.append(el("h3",title),button("Ouvrir la régie",() => enter(influenceTrials[i])));
      const links = i === 0 ? [["vote","Voter · C2"],["influence","Réserve et offre · C1"],["presse","Citer un citoyen · J1"],["lobby","Proposer un point · L1"]] :
        i === 1 ? [["vote","Voter et renforcer · C1"]] : [];
      for (const [essai,label] of links) {
        const a = el("a",label);
        a.className = "desk-link";
        a.href = "/admin?" + new URLSearchParams({session:influenceTrials[i],essai});
        a.target = "_blank"; a.rel = "noopener";
        block.append(a);
      }
      grid.append(block);
    }
    main.append(grid);
  }
  for (const [title, items] of [
    [
      "Répétitions · Règles initiales",
      sessions.filter((s) => scenarios[s.code]),
    ],
    ["Autres sessions", sessions.filter((s) => !scenarios[s.code] && !influenceTrials.includes(s.code))],
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
      if (s.code === "AC20360001") {
        for (const [target, label] of [
          ["vote", "Essayer le vote · C2"],
          ["influence", "Essayer l’influence · C1"],
          ["lobby", "Scanner comme lobby · L1"],
        ]) {
          const shortcut = el("a", label);
          shortcut.className = "desk-link";
          shortcut.href =
            "/admin?" + new URLSearchParams({ session: s.code, essai: target });
          shortcut.target = "_blank";
          shortcut.rel = "noopener";
          card.append(shortcut);
        }
      }
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
