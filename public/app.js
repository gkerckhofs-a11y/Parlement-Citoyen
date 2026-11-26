import { identityMark, identityStyle, identityTheme, roleMark } from "./player-identity.js?v=identite1";
import { currentResult, duelBallot, measureBallot, walletLabel } from "./citizen-ballot.js?v=reserve1";
import { citizenInfluencePanel, influencePanel, influenceMeasures } from "./influence.js?v=reserve1";
import { awardPreview, awardReport, changeSources, citedByline, pressAwardNotice, pressSearchResults, pressSelections, pressSourcePanel } from "./press-influence.js?v=reserve1";
import { visitBadge, showPersonalCard, showPublicCard, scanCard, printParticipantCards } from "./participant-cards.js?v=identite1";
import { plenaryDesk } from "./plenary-desk.js?v=reserve1";
import {
  projectionLink,
  projectionRoute,
  screenScope,
} from "./projection-access.js";
import { commissionDesk } from "./commission-desk.js?v=reserve1";
import { reportRows } from "./report.js?v=reserve1";
import { editor } from "./editor.js";
import {
  parliamentScreen,
  projectionScope,
} from "./commission-screen.js?v=reserve1";
const main = document.querySelector("#main"),
  feedback = document.querySelector("#feedback"),
  sessionLabel = document.querySelector("#session");
const h = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const tag = (v) => '<span class="tag">' + h(v) + "</span>",
  para = (v) => "<p>" + h(v) + "</p>";
const section = (title, body) =>
  "<article><h3>" + h(title) + "</h3>" + body + "</article>";
const field = (label, name, value = "", kind = "text") =>
  "<label>" +
  h(label) +
  (kind === "area"
    ? '<textarea required name="' + name + '">' + h(value) + "</textarea>"
    : '<input required type="' +
      kind +
      '" name="' +
      name +
      '" value="' +
      h(value) +
      '">') +
  "</label>";
const opts = (label, name, items) =>
  "<label>" +
  h(label) +
  '<select name="' +
  name +
  '">' +
  items
    .map(([v, t]) => '<option value="' + h(v) + '">' + h(t) + "</option>")
    .join("") +
  "</select></label>";
const data = (x) => h(JSON.stringify(x));
const btn = (label, x, secondary = false) =>
  '<button type="button" class="' +
  (secondary ? "secondary" : "") +
  '" data-command="' +
  data(x) +
  '">' +
  h(label) +
  "</button>";
const form = (action, body, label) =>
  '<form data-action="' +
  data(action) +
  '">' +
  body +
  "<button>" +
  h(label) +
  "</button></form>";
const details = (label, body) =>
  "<details><summary>" + h(label) + "</summary>" + body + "</details>";
const table = (heads, rows) =>
  '<div class="scroll"><table><thead><tr>' +
  heads.map((x) => "<th>" + h(x) + "</th>").join("") +
  "</tr></thead><tbody>" +
  rows
    .map(
      (r) => "<tr>" + r.map((x) => "<td>" + h(x) + "</td>").join("") + "</tr>",
    )
    .join("") +
  "</tbody></table></div>";
const projectorPage = document.body.hasAttribute("data-projector-page");
const targetWall = projectorPage && projectionRoute(location.pathname);
const wallKey = targetWall
  ? "pc.wall." + targetWall.code + "." + targetWall.scope
  : "";
let auth = projectorPage
    ? null
    : JSON.parse(sessionStorage.getItem("pc.auth") || "null"),
  v = null,
  tab = null,
  room = "",
  reading = "",
  editing = "",
  pending = false,
  last = "",
  noticeTimer;
let showPrivateCard = false, scannedCard = null, selectedCitizenId = "";
const hash = new URLSearchParams(location.hash.slice(1));
if (projectorPage) {
  if (targetWall) {
    const key = hash.get("key"),
      id = hash.get("id");
    if (key && (id === "ECR" || /^ECR-[A-Z0-9-]+$/.test(id))) {
      auth = { code: targetWall.code, id, key };
      sessionStorage.setItem(wallKey, JSON.stringify(auth));
    } else {
      try {
        auth = JSON.parse(sessionStorage.getItem(wallKey) || "null");
      } catch {
        auth = null;
      }
    }
    if (location.hash) history.replaceState(null, "", location.pathname);
  }
} else if (hash.has("key")) {
  tab = new Map([["vote","Vote"],["influence","Influence"],["carte","Ma carte"],["groupe","Mon équipe"],["redaction","Rédaction"]]).get(hash.get("rubrique")) || null;
  auth = { code: hash.get("code"), id: hash.get("id"), key: hash.get("key") };
  if (auth.id !== "ECR" && !auth.id?.startsWith("ECR-"))
    sessionStorage.setItem("pc.auth", JSON.stringify(auth));
  history.replaceState(null, "", location.pathname);
}

function offerWallAccess(message) {
  main.className = "portal";
  main.innerHTML =
    "<h1>Écran de projection</h1>" +
    para(message) +
    (targetWall
      ? '<a class="desk-link" href="/admin?' +
        h(
          new URLSearchParams({
            session: targetWall.code,
            projection: targetWall.scope,
          }).toString(),
        ) +
        '">Activer cet écran avec le compte organisateur</a>'
      : '<a href="/admin">Ouvrir la régie</a>');
}
function say(t) {
  feedback.textContent = t;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => (feedback.textContent = ""), 6500);
}
async function call(op, body) {
  let r = await fetch("/api/" + op, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(body.google
        ? {
            Authorization:
              "Bearer " +
              (await (await import("./google.js?v=regie2")).bearer()),
          }
        : {}),
    },
    body: JSON.stringify(body),
  });
  let j = await r.json();
  if (!r.ok) throw Error(j.error || "Demande interrompue");
  return j;
}
function login() {
  playerEnvironment(null);
  main.className = "portal";
  main.innerHTML =
    '<div class="mast"><h1>Parlement citoyen</h1><p>Entrez dans votre Parlement avec les accès remis par l’organisation.</p></div><div class="grid">' +
    section(
      "Rejoindre une session",
      form(
        { ui: "join" },
        field("Code de session", "code") +
          field("Identifiant de jeu", "id") +
          field("Clé personnelle", "key", "", "password"),
        "Rejoindre",
      ),
    ) +
    section(
      "Organiser une session",
      '<p><a href="/admin">Administration · Connexion Google</a></p>' +
        details(
          "Préparer une journée",
          form(
            { ui: "create" },
            field("Clé organisateur", "adminKey", "", "password") +
              field("Nombre d’élèves", "count", 100, "number") +
              '<label>Scénario privé (JSON)<input name="pack" type="file" accept=".json"></label><small>Sans fichier, la session utilise le scénario de répétition.</small><label><input name="review" type="checkbox">Relire les articles avant publication</label>' +
              details(
                "Affectations et influence",
                '<label>Citoyens, lobbyistes, journalistes (ex. 36,8,6)<input name="counts"></label><label>Points par lobby<input type="number" min="0" max="20" name="reserve"></label><label>Effectif minimal de restitution<input type="number" name="minGroup" min="3" max="30" value="5"></label>',
              ),
            "Créer la session",
          ),
        ),
    ) +
    "</div>";
  sessionLabel.textContent = "";
}
const labels = {
  amend: "Vote du texte",
  prelim: "Choix des amendements",
  selection: "Sélection des finalistes",
  opinion: "Vote sur la mesure",
  ranking: "Classement de la commission",
  plenary: "Duel de plénière",
};
const role = () => v.me.role,
  chair = () => ["Régie", "Présidence"].includes(role()),
  control = (r) => chair() || (role() === "Modérateur" && v.me.room === r);
const name = (id) =>
  ({pour:"Pour",contre:"Contre"})[id] || v.measures.find((m) => m.id === id)?.title ||
  v.amends.find((a) => a.id === id)?.text ||
  id;
const aff = (id) => "<strong>" + h(name(id)) + "</strong>";
const icon = (id) =>
  '<svg class="icon" aria-hidden="true" focusable="false"><use href="/design/icons.svg#' +
  id +
  '"/></svg>';
const roomIcons = {
  P: "shield-check",
  C: "stethoscope",
  E: "trees",
  S: "globe",
};
const indicators = ["heart-pulse", "leaf", "coins", "scale", "handshake"];
const navIcons = {
  Assemblée: "landmark", Vote: "vote", Influence: "handshake", "Ma carte": "users",
  Journal: "newspaper",
  "Mon équipe": "users",
  Rédaction: "pencil-line",
  Régie: "panels-top-left",
  Débriefing: "vote",
};
function roomMark(key) {
  return (
    '<span class="room-mark room-' +
    h(key) +
    '">' +
    icon(
      v.roomNames.P === "Prévention"
        ? roomIcons[key] || "landmark"
        : "landmark",
    ) +
    "</span>"
  );
}
function effect(t) {
  const key = t.replace("?", ""),
    words = {
      "↑": "Favorable",
      "↑↑": "Très favorable",
      "↓": "Défavorable",
      "↓↓": "Très défavorable",
      "—": "Stable",
      "": "Incertain",
    };
  return (
    '<span class="effect ' +
    (key.startsWith("↑") ? "positive" : key.startsWith("↓") ? "negative" : "") +
    '"><b aria-hidden="true">' +
    h(t) +
    "</b> " +
    h(words[key] || t) +
    (key && t.includes("?") ? ", incertain" : "") +
    "</span>"
  );
}
function trend(vv) {
  return (
    '<section class="impacts"><h4>Effets envisagés</h4><dl>' +
    vv.trends
      .map(
        (t, i) =>
          "<div><dt>" +
          icon(indicators[i]) +
          h(v.dimensions[i]) +
          "</dt><dd>" +
          effect(t) +
          "</dd></div>",
      )
      .join("") +
    "</dl>" +
    details(
      "Lire les effets",
      para(
        "Les commissions estiment les effets possibles de la mesure. « Stable » indique peu de changement attendu. « Incertain » indique que les connaissances disponibles ne permettent pas de trancher.",
      ),
    ) +
    "</section>"
  );
}
function comparison(m, t) {
  return (
    '<div class="scroll"><table class="comparison"><thead><tr><th>Indicateur</th><th>' +
    h(m.id) +
    " · Initial</th><th>" +
    h(t.id) +
    " · Amendé</th></tr></thead><tbody>" +
    v.dimensions
      .map(
        (d, i) =>
          "<tr><th>" +
          icon(indicators[i]) +
          h(d) +
          "</th><td>" +
          effect(m.trends[i]) +
          "</td><td>" +
          effect(t.trends[i]) +
          "</td></tr>",
      )
      .join("") +
    "</tbody></table></div>"
  );
}
const pollLabel = (p) =>
  ({
    ouvert: "Vote ouvert",
    clos: "Vote clos · Résultat à venir",
    dépouillement: "Vote clos · Résultat à venir",
    ordinaire: "Voix ordinaires annoncées",
    annoncé: "Résultat annoncé",
    égalité: "Égalité · Départage requis",
    suspendu: "Scrutin suspendu",
    incident: "Scrutin interrompu",
  })[p.status] || p.status;
function voterPoll() {
  if (role() !== "Citoyen" || v.phase === "Préparation") return null;
  const plenary = v.phase === "Plénière" || v.phase === "Débriefing";
  return v.polls.filter(p => plenary ? p.kind === "plenary" :
    p.kind !== "plenary" && p.room === v.me.room).at(-1);
}

function polls(r, commissionOnly = false, source = v.polls) {
  return source
    .filter((p) => p.room === r && (!commissionOnly || p.kind !== "plenary"))
    .slice()
    .reverse()
    .map((p) => {
      let body =
        tag(pollLabel(p)) +
        (p.round ? " " + tag("Départage") : "") +
        (p.kind === "opinion" ? (() => {
          const measure = v.measures.find(m => m.id === p.base);
          return "<h3>" + h(measure?.title || p.base) + "</h3>" + para(measure?.official?.text || measure?.text || "");
        })() : p.kind === "ranking" && !p.round ? "" : para(p.options.map(name).join(" • ")));
      if (p.paper) body += tag("Scrutin papier · double comptage");
      if (p.result?.withoutBonus) {
        let cf = p.result.withoutBonus;
        body += para(
          "Classement sans bonus · " +
            cf.top.map(name).join(" • ") +
            (cf.tied.length
              ? " · départage indéterminé entre " +
                cf.tied.map(name).join(" • ")
              : ""),
        );
      }
      if (p.expected !== undefined)
        body += para(p.received + " / " + p.expected + " bulletins reçus");
      if (p.voted) body += para("Vote enregistré");
      else if (p.eligible && v.me.present !== false && p.status === "ouvert") {
        if (p.kind === "opinion") body += measureBallot(v, p, {h,form});
        else if (v.rulesVersion === 2 && p.kind === "plenary" && !p.round)
          body += duelBallot(v, p, {h,form,name});
        else body += form(
          { type: "vote", poll: p.id },
          '<fieldset class="ballot-options"><legend>' +
            h(
              (p.seats === 1 ? "Choisissez une option." : "Choisissez jusqu’à " + p.seats + " options.") +
                " Pour vous abstenir, enregistrez un bulletin vide.",
            ) +
            "</legend>" +
            p.options
              .map(
                (id) =>
                  '<label><input type="' + (p.seats === 1 ? "radio" : "checkbox") + '" name="choices" value="' +
                  h(id) +
                  '">' +
                  h(name(id)) +
                  "</label>",
              )
              .join("") +
            (p.seats === 1 ? '<label><input type="radio" name="choices" value="">Je m’abstiens</label>' : '') +
            "</fieldset>",
          "Enregistrer mon bulletin",
        );
      }
      if (p.status === "ordinaire" && p.ordinary) body +=
        table(["Texte","Voix ordinaires"],p.ordinary.rows.map(row => [name(row.id), row.raw])) +
        para("Les renforts et le résultat final seront annoncés par la présidence.");
      if (p.result && p.status !== "ordinaire") {
        let t = p.result;
        body +=
          (v.rulesVersion === 2 ? currentResult(v,p,{table,name}) : table(
            ["Option", "Soutiens", "Bonus", "Total"],
            t.rows.map((z) => [
              name(z.id),
              z.raw,
              z.bonus.toLocaleString("fr-BE", { maximumFractionDigits: 3 }),
              (z.weight / t.denominator).toLocaleString("fr-BE", {
                maximumFractionDigits: 3,
              }),
            ]),
          )) +
          (p.kind === "ranking" && !p.round ? "" : para(
            t.voters +
              " votants · " +
              t.abstain +
              " abstentions · " +
              t.absent +
              " sans bulletin",
          ));
        if (p.winners)
          body += para("Retenu · " + p.winners.map(name).join(" • "));
      }
      if (control(r) && (p.kind !== "plenary" || chair())) {
        const revealInTwoSteps = v.rulesVersion === 2 && p.kind === "plenary" && !p.round && !p.paper;
        let commands =
          {
            ouvert: [
              ["close", "Clore le vote"],
              ["suspend", "Suspendre"],
            ],
            clos: revealInTwoSteps ? [["revealOrdinary", "Révéler les voix ordinaires"]]
              : [["announce", "Annoncer le résultat"]],
            ordinaire: [["announce", "Révéler les renforts et le résultat final"]],
            suspendu: [
              ["resume", "Reprendre"],
              ["restart", "Invalider et revoter"],
            ],
            incident: [["restart", "Consigner et revoter"]],
            égalité: [
              p.round
                ? ["draw", "Effectuer le tirage"]
                : ["tie", "Ouvrir le départage"],
            ],
          }[p.status] || [];
        body +=
          '<div class="actions">' +
          commands
            .map(([type, l]) =>
              btn(l, {
                type,
                poll: p.id,
                reasonRequired: [
                  "restart",
                  "suspend",
                  "resume",
                  "draw",
                ].includes(type),
              }),
            )
            .join("") +
          "</div>";
      }
      if (control(r) && (p.kind !== "plenary" || chair()) && ["suspendu", "incident"].includes(p.status))
        body += details(
          "Secours papier",
          form(
            { type: "paper", poll: p.id },
            para(
              "Invalidez cette urne pour tout l’électorat. Annoncez le nouveau vote à voix égales avant de distribuer les bulletins. Deux adultes vérifient le comptage.",
            ) +
              (v.rulesVersion === 2 && p.kind === "opinion"
                ? para("Chaque bulletin compte pour, contre ou abstention. Le dépouillement papier conserve les soldes individuels.")
                : v.rulesVersion === 2 && p.kind === "plenary" ? para("Comptez une voix par bulletin exprimé. Aucun renfort individuel n’est saisi sur papier.") : "") +
              field("Bulletins papier", "count", 0, "number") +
              field("Abstentions", "abstain", 0, "number") +
              p.options
                .map((id) => field(({ pour: "Pour", contre: "Contre" })[id] || name(id), "raw-" + id, 0, "number"))
                .join("") +
              field("Motif et provenance", "reason") +
              '<label><input type="checkbox" required name="checked">Double comptage effectué</label>',
            "Enregistrer le scrutin papier",
          ),
        );
      return section(p.round ? "Vote de départage" : labels[p.kind], body);
    })
    .join("");
}
function citizenBallotPanel() {
  const ballot = voterPoll();
  const heading = v.phase === "Plénière" || v.phase === "Débriefing" ? "Vote de plénière" : "Vote de ma commission";
  const place = v.roomNames[ballot?.room || v.me.room];
  let body;
  if (!ballot) {
    body = para(v.me.present === false ? "Vous êtes signalé absent. Adressez-vous à l’animateur de votre commission." :
      v.phase === "Préparation" ? "Le premier bulletin sera disponible lorsque votre commission ouvrira un vote." :
      v.phase === "Débriefing" ? "Les votes sont terminés." :
      "Aucun vote ouvert pour le moment. Le bulletin apparaîtra ici dès l’ouverture du scrutin.");
  } else {
    body = polls(ballot.room, false, [ballot]);
    if (ballot.status === "ouvert" && (!ballot.eligible || v.me.present === false))
      body = para("Vous ne figurez pas parmi les votants de ce scrutin. L’animateur peut vérifier votre présence.") + body;
  }
  if (v.wallet && (!ballot || ballot.voted || ballot.status !== "ouvert" || !["opinion","plenary"].includes(ballot.kind) || ballot.round))
    body += '<p class="vote-wallet">' + h(walletLabel(v.wallet)) + '</p>';
  if (v.rulesVersion === 2 && v.phase === "Commissions") {
    const measures = v.measures.filter(m => m.room === v.me.room);
    const scores = v.rooms[v.me.room]?.ranking || [];
    body += details("Les mesures de ma commission", "<ol>" + measures.map(m => {
      const record = scores.find(r => r.id === m.id);
      return "<li>" + h(m.title) + (record ? " · score " + h(record.score) : "") + "</li>";
    }).join("") + "</ol>");
  } else if (v.rulesVersion === 2 && v.phase === "Plénière") {
    body += details("Les duels de la plénière", "<ol>" + Object.entries(v.rooms).map(([id,r]) =>
      "<li><strong>" + h(v.roomNames[id]) + "</strong> · " +
      h(r.finalists.map(name).join(" ou ")) + (r.winner ? " · Vote terminé" : "") + "</li>").join("") + "</ol>");
  }
  return '<section class="current-ballot" aria-label="Mon vote"><h2>' + h(heading) + '</h2>' +
    (place ? '<p class="vote-place">' + h(place) + '</p>' : '') + body + '</section>';
}
function proposals(r) {
  return v.amends
    .filter((a) => a.room === r)
    .map((a) => {
      let html =
        tag(a.status) +
        para(a.text) +
        para(a.why) +
        (a.source ? para(a.source) : "") +
        para(a.support + " soutien(s)") +
        (a.reason ? para(a.reason) : "");
      if (a.mergeText) {
        html += section(
          "Texte commun proposé",
          para(a.mergeText) +
            (a.mergeAuthor
              ? btn("Accepter le texte commun", {
                  type: "mergeConsent",
                  amend: a.id,
                  accept: true,
                }) +
                btn(
                  "Refuser la fusion",
                  { type: "mergeConsent", amend: a.id, accept: false },
                  true,
                )
              : ""),
        );
      }
      if (v.phase === "Commissions" && !v.rooms[r].locked) {
        if (v.me.room === r && role() === "Citoyen" && !a.signed)
          html += btn("Cosigner", { type: "sign", amend: a.id });
        if (a.author && a.status === "à reformuler")
          html += form(
            { type: "revise", amend: a.id },
            field("Texte reformulé", "text", a.text, "area"),
            "Redéposer",
          );
        if (control(r)) {
          let others = v.amends.filter(
            (b) =>
              b.id !== a.id &&
              b.measure === a.measure &&
              ["déposé", "en examen", "à reformuler"].includes(b.status),
          );
          if (others.length && !a.mergeText)
            html += details(
              "Proposer une fusion",
              form(
                { type: "merge", amend: a.id },
                opts(
                  "Autre proposition",
                  "other",
                  others.map((b) => [b.id, b.text]),
                ) + field("Texte commun proposé", "text", "", "area"),
                "Demander l’accord des auteurs",
              ),
            );
          let st = [
            "en examen",
            "à reformuler",
            "non admissible",
            ...(role() === "Régie" ? ["admissible"] : []),
          ];
          html += details(
            "Instruire la proposition",
            form(
              { type: "review", amend: a.id },
              opts(
                "Décision",
                "status",
                st.map((s) => [s, s]),
              ) +
                opts(
                  "Profil associé",
                  "profile",
                  v.measures
                    .find((m) => m.id === a.measure)
                    .variants.map((t) => [t.id, t.title]),
                ) +
                field("Motif", "reason"),
              "Enregistrer la décision",
            ),
          );
        }
      }
      return section("Amendement · " + name(a.measure), html);
    })
    .join("");
}
function banner(m) {
  if (!m) return "";
  const asset =
    /^[PCES][1-5]$/.test(m.id) && v.roomNames.P === "Prévention"
      ? "/design/measures/" + m.id + ".webp"
      : "/design/hemicycle.svg";
  return (
    '<img class="measure-banner" src="' + asset + '" alt="" loading="lazy">'
  );
}
function picture(n) {
  return n?.image
    ? '<img class="press-photo" data-photo="' +
        h(n.image) +
        '" alt="Illustration de l’article">'
    : "";
}
const photos = new Map();
async function loadPhotos() {
  for (const img of main.querySelectorAll("img[data-photo]")) {
    const id = img.dataset.photo,
      key = auth.code + "." + id;
    if (!photos.has(key))
      photos.set(
        key,
        call("picture", { ...auth, image: id }).then((r) => r.photo),
      );
    photos
      .get(key)
      .then((src) => (img.src = src))
      .catch(() => {
        photos.delete(key);
        img.alt = "Illustration momentanément indisponible";
      });
  }
}
async function preparePhoto(file) {
  const url = URL.createObjectURL(file),
    img = new Image();
  try {
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    let scale = Math.min(
      1,
      1440 / Math.max(img.naturalWidth, img.naturalHeight),
    );
    for (let i = 0; i < 8; i++) {
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const photo = canvas.toDataURL("image/jpeg", 0.8);
      if (photo.startsWith("data:image/jpeg;") && photo.length <= 320000)
        return photo;
      scale *= 0.75;
    }
  } catch {
    throw Error(
      "Cette image ne peut pas être ouverte. Choisissez une photo JPEG, PNG ou WebP.",
    );
  } finally {
    URL.revokeObjectURL(url);
  }
  throw Error("Image trop volumineuse.");
}
let pressIndex = 0,
  pressDeadline = 0;
function pressScreen() {
  const news = [...v.news].sort(
    (a, b) => Number(b.front) - Number(a.front) || b.time.localeCompare(a.time),
  );
  const pages = news.flatMap((n) => {
    const parts = n.text.match(/[\s\S]{1,310}(?:\s|$)|[\s\S]{1,310}/g) || [""];
    return parts.map((text, i) => ({
      ...n,
      text,
      image: i === 0 ? n.image : "",
      sources: i === parts.length - 1 ? n.sources : "",
      page: parts.length > 1 ? i + 1 + " / " + parts.length : "",
    }));
  });
  const n = pages[pressIndex % (pages.length || 1)];
  if (!pressDeadline) pressDeadline = Date.now() + 15000;
  return stageScreen({
    current: {
      kind: n
        ? [n.media, n.front && "À la une"].filter(Boolean).join(" · ")
        : "En direct",
      title: n?.title || "Les premières éditions",
      body: n?.text || "Les rédactions préparent leurs articles.",
      part: n?.page,
      sources: n?.sources,
      pressImage: n ? picture(n) : "",
    },
  });
}
setInterval(() => {
  if (
    v?.me.role === "Projection" &&
    projectionScope(v) === "press" &&
    v.news.length > 0 &&
    Date.now() >= pressDeadline
  ) {
    pressIndex++;
    pressDeadline = 0;
    render();
  }
}, 1000);
function assembly() {
  const ballot = voterPoll();
  let list = Object.keys(v.rooms);
  if (!list.includes(room)) room = v.me.room || list[0];
  let r = v.rooms[room],
    ms = v.measures.filter((m) => m.room === room),
    m = ms.find((m) => m.id === r.focus);
  let title = roomMark(room) + h(v.roomNames[room]),
    display = role() === "Projection",
    allow = control(room),
    phase = v.phase;
  let toolbar =
    list.length > 1
      ? '<nav aria-label="Commissions">' +
        list
          .map(
            (k) =>
              '<button aria-current="' +
              (room === k) +
              '" data-room="' +
              h(k) +
              '">' +
              roomMark(k) +
              h(v.roomNames[k]) +
              "</button>",
          )
          .join("") +
        "</nav>"
      : "";
  const currentPoll = v.polls.filter((p) => p.room === room).at(-1);
  const state = currentPoll ? pollLabel(currentPoll) : "En débat";
  let focus = m
    ? '<article class="proposal">' +
      banner(m) +
      '<div class="proposal-meta">' +
      roomMark(room) +
      h(v.roomNames[room]) +
      "<span>" +
      h(m.official.id === m.id ? "Proposition" : "Proposition amendée") +
      " · " +
      h(v.phase) +
      "</span></div><h3>" +
      h(m.title) +
      "</h3>" +
      para(m.text) +
      (m.official.id !== m.id
        ? section("Clause adoptée · " + m.official.id, para(m.official.text))
        : "") +
      trend(m.official) +
      "<footer>" +
      tag(state) +
      (currentPoll?.status === "ouvert" && display
        ? " Votez sur votre appareil."
        : "") +
      (r.until
        ? " · Échéance indicative " +
          h(new Date(r.until).toLocaleTimeString("fr-BE"))
        : "") +
      "</footer></article>"
    : "";
  if (v.summary && display)
    return (
      '<div class="screen"><h2>Plan national</h2>' +
      v.summary.chosen.map((m) => section(m.title, para(m.text))).join("") +
      table(
        ["Dimension", "Initial", "Adopté"],
        v.summary.dimensions.map((d, i) => [
          d,
          v.summary.initial[i],
          v.summary.final[i],
        ]),
      ) +
      "</div>"
    );
  if (v.slide && display && !v.me.room)
    return (
      '<div class="screen"><h2>Le journal 2040</h2>' +
      tag("Fiction prospective") +
      para(v.slide) +
      "</div>"
    );
  if (display && !v.me.room) {
    let latest = v.polls.filter((p) => p.kind === "plenary").at(-1);
    let content = list
      .map((id) =>
        section(
          v.roomNames[id],
          para(
            v.rooms[id].winner
              ? "Adoptée · " + name(v.rooms[id].winner)
              : v.rooms[id].finalists.length
                ? "Finalistes · " + v.rooms[id].finalists.map(name).join(" • ")
                : "En discussion · " + name(v.rooms[id].focus),
          ),
        ),
      )
      .join("");
    return (
      '<div class="screen"><h2>' +
      h(v.me.id === "ECR-PL" ? "Plénière" : "Écran général") +
      "</h2>" +
      (latest
        ? section(
            "Duel · " + v.roomNames[latest.room],
            tag(pollLabel(latest)) +
              '<div class="duel">' +
              latest.options
                .map((id) =>
                  section(
                    name(id),
                    banner(v.measures.find((m) => m.id === id)) +
                      para(v.measures.find((m) => m.id === id)?.official.text),
                  ),
                )
                .join("") +
              "</div>",
          )
        : "") +
      content +
      v.news
        .filter((n) => n.front)
        .map((n) => section(n.media, para(n.title)))
        .join("") +
      "</div>"
    );
  }
  let cmd = "";
  if (allow) {
    cmd =
      role() === "Modérateur"
        ? '<button type="button" data-desk-return>Ouvrir ma régie de commission</button>'
        : '<button type="button" data-desk-room="' +
          h(room) +
          '">Piloter cette commission</button>';
    if (phase === "Plénière" && chair() && !r.winner)
      cmd += btn("Ouvrir le duel de plénière", {
        type: "open",
        room,
        kind: "plenary",
      });
  }
  let actions = "";
  const availableMeasures = v.rulesVersion === 2 ? ms.filter(m => !v.polls.some(
    p => p.kind === "opinion" && p.base === m.id)) : ms;
  if (
    availableMeasures.length && !display &&
    role() === "Citoyen" &&
    room === v.me.room &&
    phase === "Commissions" &&
    !r.locked
  )
    actions = details(
      "Déposer un amendement",
      form(
        { type: "amend" },
        opts(
          "Mesure",
          "measure",
          availableMeasures.map((m) => [m.id, m.title]),
        ) +
          field("Modification précise", "text", "", "area") +
          field("Justification", "why") +
          '<label>Référence facultative<input name="source"></label>',
        "Déposer",
      ),
    );
  return (
    toolbar +
    '<div class="' +
    (display ? "screen" : "") +
    '"><h2>' +
    title +
    "</h2>" +
    cmd +
    focus +
    (v.rulesVersion === 2 && r.ranking?.length ? details("Classement des mesures de la commission",
      table(["Mesure","Pour","Contre","Abst.","Score"],r.ranking.map(row => [name(row.id),row.for,row.against,row.abstain,row.score]))) : "") +
    (r.finalists.length
      ? section(
          "Finalistes",
          r.finalists
            .map(
              (id) => aff(id) + para(ms.find((m) => m.id === id).official.text),
            )
            .join(""),
        )
      : "") +
    (r.winner ? section("Mesure adoptée", aff(r.winner)) : "") +
    polls(
      room,
      false,
      ballot ? v.polls.filter((p) => p.id !== ballot.id) : v.polls,
    ) +
    actions +
    proposals(room) +
    (display
      ? ""
      : details(
          "Fiches des mesures",
          ms
            .map((m) =>
              section(
                m.title,
                banner(m) +
                  para(m.text) +
                  trend(m) +
                  para(m.caution || "") +
                  m.variants
                    .map((t) =>
                      details(
                        t.id + " · " + t.title,
                        para(t.text) + comparison(m, t),
                      ),
                    )
                    .join(""),
              ),
            )
            .join(""),
        )) +
    "</div>"
  );
}
const groupTypes = {
  Citoyen: "Territoire",
  Lobby: "Association",
  Journaliste: "Rédaction",
};
function groupIdentity() {
  const person = {...v.me, groupName:v.team.name};
  const room = v.roomNames[v.me.room];
  return '<div class="group-identity" style="' + identityStyle(person) + '">' +
    '<span class="group-mark">' + identityMark(person) + '</span><div><small>' +
    h(groupTypes[role()]) + ' · ' + h(v.me.id) + '</small><strong>' + h(v.team.name) +
    '</strong>' + (room ? '<span>Commission · ' + h(room) + '</span>' : '') + '</div></div>';
}

function playerEnvironment(person) {
  const body = document.body;
  const theme = identityTheme(person);
  if (theme.roleKey) {
    body.dataset.playerRole = theme.roleKey;
    body.style.setProperty("--role-color",theme.color);
    body.style.setProperty("--role-pale",theme.pale);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content",theme.color);
  } else if (body.dataset.playerRole) {
    delete body.dataset.playerRole;
    body.style.removeProperty("--role-color");
    body.style.removeProperty("--role-pale");
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content","#1c3443");
  }
}

function badgeGuide() {
  const territories = (v.template?.territories || []).map((t,index) => {
    const person = {role:"Citoyen", group:"T"+index, groupName:t.name};
    return '<li style="' + identityStyle(person) + '">' + identityMark(person) + h(t.name) + '</li>';
  });
  return '<section id="badges" class="badge-guide" tabindex="-1"><h3>Badges à porter</h3>' +
    para("Le QR de visite se porte autour du cou. L’accès privé est à remettre séparément à son titulaire.") +
    btn("Imprimer les badges à porter",{ui:"printCards"}) +
    '<small>Format portrait · 54 × 85 mm · 9 par feuille A4 · Imprimer à 100 %</small>' +
    '<details data-badge-preview><summary>Voir les badges avant impression</summary>' +
    '<div class="badge-previews"></div><h4>Repères des territoires</h4>' +
    '<ul class="badge-key badge-key-territories">' + territories.join("") + '</ul></details></section>';
}
main.addEventListener("toggle", event => {
  const details = event.target;
  if (!details.matches?.("[data-badge-preview]") || !details.open || !v?.roster) return;
  const preview = details.querySelector(".badge-previews");
  if (preview.childElementCount) return;
  preview.innerHTML = ["Citoyen","Journaliste","Lobby"].flatMap(role => {
    const player = v.roster.find(p => p.role === role && p.card);
    return player ? [visitBadge(player.card,h)] : [];
  }).join("");
},true);

function groupMembers() {
  const members = v.team?.members;
  if (!members) return "";
  const list = members.map((member) => {
    const self = member.id === v.me.id ? " (vous)" : "";
    const room = v.roomNames[member.room];
    return "<li><strong>" + h(member.id + self) + "</strong>" +
      (room ? " · " + h(room) : "") + (member.present ? "" : " · Absent") + "</li>";
  }).join("");
  return details("Membres du groupe (" + members.length + ")", '<ul class="group-members">' + list + "</ul>");
}
function groupFeed(messages, me) {
  if (!messages.length) return para("Aucun message pour le moment.");
  const format = new Intl.DateTimeFormat("fr-BE", { dateStyle: "short", timeStyle: "short" });
  return '<ol class="group-messages">' + [...messages].reverse().map((message) => {
    const author = message.by === me ? message.by + " (vous)" : message.by;
    return '<li><div><strong>' + h(author) + '</strong> · <time datetime="' +
      h(message.time) + '">' + h(format.format(new Date(message.time))) +
      '</time></div>' + para(message.text) +
      btn("Signaler", { type: "report", id: message.id, reasonRequired: true }, true) +
      '</li>';
  }).join("") + '</ol>';
}
function groupConversation() {
  if (!v.messages) return "";
  const composer = v.team.canMessage
    ? form({ type: "message" },
        '<label>Écrire au groupe<textarea required maxlength="1000" name="text" rows="3"></textarea></label>',
        "Envoyer au groupe")
    : para("La discussion est en lecture seule.");
  return section("Discussion du groupe", composer +
    '<div id="group-messages">' + groupFeed(v.messages, v.me.id) + '</div>');
}
function team() {
  const goals = (v.team?.goals || []).map((goal, index) =>
    (index === 2 ? "Garde-fou" : "Priorité") + " · " + v.dimensions[goal.index] +
      " : au moins " + goal.threshold);
  for (const measures of v.team?.objectives || []) {
    if (measures.length) goals.push("Faire adopter au moins une de ces mesures : " + measures.map(name).join(" / "));
  }
  const objectives = goals.length ? "<ul>" + goals.map((goal) => "<li>" + h(goal) + "</li>").join("") + "</ul>" : "";
  let out = v.team ? section("Notre mission", para(v.team.mission) + objectives + groupMembers()) : "";
  if (v.surveyDone !== undefined) {
    out += section(
      "Retour facultatif",
      v.surveyDone
        ? para("Votre réponse a été enregistrée.")
        : form(
            { type: "survey" },
            "<fieldset><legend>Quelles sources vous ont aidé ?</legend>" +
              [
                "Expert",
                "Presse",
                "Lobby",
                "Autre citoyen",
                "Dossier initial",
                "Autre",
                "Je ne sais pas",
              ]
                .map(
                  (t) =>
                    '<label><input type="checkbox" name="sources" value="' +
                    h(t) +
                    '">' +
                    h(t) +
                    "</label>",
                )
                .join("") +
              "</fieldset>" +
              opts(
                "Avez-vous changé d’avis pendant le jeu ?",
                "changed",
                ["Oui", "Non", "Incertain"].map((s) => [s, s]),
              ),
            "Répondre au sondage",
          ),
    );
  }
  if (role() === "Lobby") out += influencePanel(v, { section, para, opts, btn, form }, {recipient:selectedCitizenId});
  return out + groupConversation();
}
function journal() {
  let articles = [...v.news].sort(
    (a, b) => Number(b.front) - Number(a.front) || b.time.localeCompare(a.time),
  );
  return (
    "<h2>Journal du Parlement</h2>" +
    (!articles.length ? para("Aucun article publié pour le moment.") : "") +
    articles
      .map((n) =>
        '<article id="news-' + h(n.id) + '" tabindex="-1"><h3>' + h(n.title) + '</h3>' +
          tag(n.media) +
            (n.front ? " " + tag("À la Une") : "") +
            para(
              new Date(n.time).toLocaleString("fr-BE") +
                (n.corrected ? " · corrigé" : ""),
            ) +
            (reading === n.id
              ? picture(n) + para(n.text) + (n.sources ? para(n.sources) : "") + citedByline(n,{h})
              : btn("Lire l’article", { ui: "read", id: n.id })) + "</article>",
      )
      .join("")
  );
}
async function openPressLink() {
  const id = new URLSearchParams(location.hash.slice(1)).get("article");
  if (!id || !auth || !v?.news.some((n) => n.id === id)) return;
  await run({ui:"read",id,fromNotice:true});
  document.getElementById("news-" + id)?.focus();
}
window.addEventListener("hashchange", openPressLink);
function draftKey() {
  return "pc.draft." + auth.code + "." + auth.id + "." + editing;
}
function rememberDraft(f) {
  const { title, text, sources, wire, removeImage } = f.elements;
  const preview = f.querySelector("[data-preview]");
  const content = {
    title: title.value, text: text.value, sources: sources.value, wire: wire.value,
    ...pressSelections(f), requestId: f.dataset.requestId, sendingPublish: f.dataset.sendingPublish,
    removeImage: !!removeImage?.checked, revision: JSON.parse(f.dataset.action).revision,
  };
  if (!preview.hidden && !content.removeImage) content.photo = preview.src;
  try {
    sessionStorage.setItem(draftKey(), JSON.stringify(content));
  } catch {
    say("Le brouillon reste ouvert sur cet appareil. Enregistrez-le pour le partager avec la rédaction.");
  }
}
function wireInbox(state, open) {
  return "<h3>Dépêches · " + h(state.wireAgency) + "</h3>" +
    (state.wires.length ? [...state.wires].reverse().map((w) =>
      details(w.title, para(w.text) + (open
        ? btn("Traiter cette dépêche", { ui: "useWire", id: w.id }, true)
        : "")),
    ).join("") : para("Aucune dépêche reçue pour le moment."));
}
function wireOptions(wires, selected) {
  return [["", "Sujet libre"], ...wires.map((w) => [w.id, w.title])]
    .map(([id, label]) => '<option value="' + h(id) + '"' +
      (id === selected ? " selected" : "") + ">" + h(label) + "</option>").join("");
}
function conflictControls(item, revision) {
  if (!item || (item.revision || 0) === revision) return "";
  return section("Une nouvelle version a été enregistrée",
    para("Votre saisie reste disponible. Comparez-la au texte de votre rédaction avant de continuer.") +
      details("Lire la version enregistrée", para(item.draft.title) + para(item.draft.text) +
        para(item.draft.sources) + picture(item.draft)) +
      btn("Reprendre la version enregistrée", { ui: "reopenDraft" }, true) +
      btn("Enregistrer ma saisie dans un nouveau brouillon", { ui: "copyDraft" }, true));
}
function newsroom() {
  const open = ["Commissions", "Plénière"].includes(v.phase);
  const item = v.desk.find((n) => n.id === editing);
  const saved = JSON.parse(sessionStorage.getItem(draftKey()) || "null");
  const d = saved || item?.draft || {};
  const revision = saved?.revision ?? item?.revision ?? 0;
  const formAction = { type: "article", id: editing, revision };
  const contacts = (v.pressDirectory || []).filter((p) => v.pressContacts.includes(p.id));
  const notebook = v.pressDirectory ? section("Mes contacts",
    (contacts.length ? para(contacts.map((p) => [p.gameName,p.id,p.groupName].filter(Boolean).join(" · ")).join(" / ")) :
      para("Scannez une carte de visite pour retrouver cette source au moment de rédiger.")) +
    (v.phase !== "Débriefing" ? btn("Scanner une carte de visite",{ui:"scanPress"},true) : "")) : "";
  return '<h2>Bureau de rédaction · ' + h(v.team.name) + '</h2><div class="news-desk"><aside><div data-wire-inbox>' +
    wireInbox(v, open) + "</div>" + notebook + "</aside><div>" +
    (open ? section(editing ? "Modifier l’article" : "Nouvel article",
      '<form data-news-article data-request-id="' + h(saved?.requestId) + '" data-sending-publish="' + h(saved?.sendingPublish) + '" data-action="' + data(formAction) + '">' +
        field("Titre", "title", d.title || "") + field("Article", "text", d.text || "", "area") +
        picture(item?.draft) +
        '<label>Photo ou illustration<input type="file" name="attachment" accept="image/*"></label>' +
        '<label>Prendre une photo<input type="file" name="camera" accept="image/*" capture="environment"></label>' +
        '<img class="press-photo" data-preview ' + (d.photo ? 'src="' + h(d.photo) + '"' : "hidden") +
        ' alt="Aperçu de l’image choisie">' +
        (item?.draft?.image ? '<label><input type="checkbox" name="removeImage"' +
          (d.removeImage ? " checked" : "") + '>Retirer l’image actuelle</label>' : "") +
        pressSourcePanel(v,d,item,{h,btn}) +
        '<label>Autres sources et références<input name="sources" maxlength="500" value="' + h(d.sources) + '"></label>' +
        '<label>Dépêche traitée<select name="wire">' + wireOptions(v.wires, d.wire) + '</select></label>' +
        '<div data-draft-conflict>' + conflictControls(item, revision) + '</div>' +
        '<div class="actions"><button class="secondary" type="submit">Enregistrer le brouillon</button>' +
        '<button type="submit" name="publish" value="1">' +
        (v.reviewArticles ? "Envoyer en relecture" : "Publier dans le journal") + '</button></div></form>') +
        (editing ? btn("Nouvel article", { ui: "edit", id: "" }, true) : "")
      : para(v.phase === "Préparation" ? "La rédaction ouvrira au début des commissions." : "La rédaction est clôturée.")) +
    "</div></div><h3>Articles de la rédaction</h3>" +
    (v.desk.length ? v.desk.map((n) => section(n.draft.title,
      tag(n.status) + (n.reason ? para(n.reason) : "") + awardReport(n.pressAwards,{h}) +
      (open ? btn("Ouvrir l’article", { ui: "edit", id: n.id }) :
        details("Relire le texte", para(n.draft.text) + picture(n.draft))) +
      (open && n.public ? btn(n.front ? "Retirer la Une" : "Mettre à la Une",
        { type: "front", id: n.id }, true) : ""),
    )).join("") : para("Aucun article enregistré."));
}
function updateWritingDesk(next, f) {
  if (JSON.stringify(v.wires) !== JSON.stringify(next.wires)) {
    const inbox = main.querySelector("[data-wire-inbox]");
    const opened = [...inbox.querySelectorAll("details[open] summary")].map((n) => n.textContent);
    inbox.innerHTML = wireInbox(next, true);
    for (const summary of inbox.querySelectorAll("summary"))
      if (opened.includes(summary.textContent)) summary.parentElement.open = true;
    f.elements.wire.innerHTML = wireOptions(next.wires, f.elements.wire.value);
    say("Le fil de votre rédaction a été mis à jour.");
  }
  const item = next.desk.find((n) => n.id === editing);
  const sourcePanel = f.querySelector("[data-press-sources]");
  if (sourcePanel && (next.phase !== v.phase || next.pressRemaining !== v.pressRemaining ||
      item?.wasPublished !== v.desk.find((n) => n.id === editing)?.wasPublished ||
      JSON.stringify(next.pressDirectory) !== JSON.stringify(v.pressDirectory))) {
    const query = sourcePanel.querySelector("[data-press-search]").value;
    const focusSearch = document.activeElement === sourcePanel.querySelector("[data-press-search]");
    const selected = pressSelections(f);
    sourcePanel.outerHTML = pressSourcePanel(next,selected,item,{h,btn});
    const search = f.querySelector("[data-press-search]");
    search.value = query;
    f.querySelector("[data-press-results]").innerHTML = pressSearchResults(next,query,selected.cited,{h});
    if (focusSearch) search.focus();
  }
  if (item && item.revision !== v.desk.find((n) => n.id === editing)?.revision) {
    f.querySelector("[data-draft-conflict]").innerHTML = conflictControls(item, JSON.parse(f.dataset.action).revision);
    loadPhotos();
  }
  v = next;
}
const deskLink = (a, label) =>
  '<a class="desk-link" target="_blank" rel="noopener noreferrer" href="' +
  h(link(a)) +
  '">' +
  h(label) +
  "</a>";

function projectionPanel() {
  if (!chair()) return "";
  const screens = [
    [v.generalScreen, "Écran général"],
    ...Object.entries(v.roomScreens || {}).map(([room, access]) => [
      { ...access, room },
      v.roomNames[room],
    ]),
    [v.plenaryScreen, "Plénière"],
    [v.pressScreen, "Actualités des rédactions"],
  ];
  return (
    '<section class="access-panel projection-panel" aria-labelledby="projection-title"><h2 id="projection-title" tabindex="-1">Afficher en salle</h2><p>Ouvrez la page publique sur le projecteur.</p><div>' +
    screens
      .filter(([access]) => access)
      .map(([access, label]) => deskLink(access, label))
      .join("") +
    "</div></section>"
  );
}
function accessPanels() {
  if (!v.roster) return "";
  let html = "";
  if (/^AC2036000[1-6]$/.test(v.code)) {
    if (["AC20360001","AC20360004"].includes(v.code)) html += '<section class="access-panel"><h3>Essayer un citoyen en commission</h3><div>' +
      '<a class="desk-link" target="_blank" rel="noopener" href="/admin?session=' + v.code + '&amp;essai=vote">Vote de Soins · C2</a>' +
      '<a class="desk-link" target="_blank" rel="noopener" href="/admin?session=' + v.code + '&amp;essai=influence">Influence en Prévention · C1</a>' +
      '<a class="desk-link" target="_blank" rel="noopener" href="/admin?session=' + v.code + '&amp;essai=lobby">Proposer un point · L1</a></div></section>';
    const roles = {
      Citoyen: "Citoyen",
      Lobby: "Groupe d’influence",
      Journaliste: "Journaliste",
      Modérateur: "Modération de commission",
      Expert: "Expert",
      Enseignant: "Enseignant",
      Présidence: "Présidence",
    };
    html +=
      '<section class="access-panel"><h3>Essayer un rôle</h3><div>' +
      Object.entries(roles)
        .map(([role, label]) => {
          const a = v.roster.find((a) => a.role === role);
          return a ? deskLink(a, label) : "";
        })
        .join("") +
      "</div></section>";
  }
  return html;
}
let observingAsModerator = false;
const preparedMeasures = new Map();
let preparedDuel = "";
let presidencyHome = false;
function plenaryRequested() {
  if (!chair()) return false;
  const q = new URLSearchParams(location.search);
  return (
    q.get("regie") === "pleniere" ||
    (role() === "Présidence" && !presidencyHome && !q.has("commission"))
  );
}
function changeDesk(scope, plenary = false) {
  const url = new URL(location.href);
  presidencyHome = !plenary && !scope;
  if (plenary) url.searchParams.set("regie", "pleniere");
  else url.searchParams.delete("regie");
  if (scope) url.searchParams.set("commission", scope);
  else url.searchParams.delete("commission");
  if (url.href !== location.href) history.pushState(null, "", url);
  tab = "Régie";
  render();
  window.scrollTo(0, 0);
}
function openDeskScope() {
  if (role() === "Modérateur") return observingAsModerator ? "" : v.me.room;
  if (!chair()) return "";
  const requested = new URLSearchParams(location.search).get("commission");
  return requested && Object.hasOwn(v.rooms, requested) ? requested : "";
}
window.addEventListener("popstate", () => {
  if (v && chair()) {
    tab = "Régie";
    render();
  }
});
function deskDirectory() {
  return (
    '<section class="desk-directory"><h2>Régies des commissions</h2><div class="room-board">' +
    Object.keys(v.rooms)
      .map((id) => {
        const stage = v.presentations?.[id]?.current;
        const moderator = v.roster?.find(
          (member) => member.role === "Modérateur" && member.room === id,
        );
        return (
          '<div class="desk-room-card"><button type="button" class="room-tile" data-desk-room="' +
          h(id) +
          '" aria-label="' +
          h("Piloter la commission " + v.roomNames[id]) +
          '">' +
          roomMark(id) +
          "<span><strong>" +
          h(v.roomNames[id]) +
          "</strong><small>" +
          h(stage ? stage.kind + " · " + stage.title : "Ouvrir la régie") +
          "</small></span></button>" +
          (moderator ? deskLink(moderator, "Accès de l’animateur") : "") +
          "</div>"
        );
      })
      .join("") +
    "</div></section>"
  );
}

main.addEventListener("change", (e) => {
  if (e.target.matches("[data-plenary-room]") && plenaryRequested()) {
    preparedDuel = e.target.value;
    renderPreservingDetails();
    main.querySelector("[data-plenary-room]")?.focus({ preventScroll: true });
    return;
  }
  if (e.target.matches("[data-desk-measure]")) {
    const scope = openDeskScope();
    if (!scope) return;
    preparedMeasures.set(v.code + "/" + scope, e.target.value);
    renderPreservingDetails();
    main.querySelector("[data-desk-measure]")?.focus({ preventScroll: true });
  }
  if (e.target.matches("[data-stage-slide]"))
    run({
      type: "presentSlide",
      room: e.target.dataset.scope,
      slide: e.target.value,
    });
});
function stageScreen(deck) {
  return parliamentScreen(v, deck, {
    h,
    roomMark,
    banner,
    effect,
    icon,
    indicators,
  });
}
function fitStage() {
  const panels = main.querySelectorAll("[data-fit-panel]");
  for (const panel of panels) {
    if (!panel.clientWidth || !panel.clientHeight) continue;
    const panelRect = panel.getBoundingClientRect();
    const style = getComputedStyle(panel);
    const top = panelRect.top + parseFloat(style.paddingTop);
    const bottom = panelRect.bottom - parseFloat(style.paddingBottom);
    const isStats = panel.classList.contains("scene-statistics");
    let low = 1;
    let high = Math.min(
      isStats ? 50 : 64,
      Math.max(17, panel.clientWidth / (isStats ? 19 : 15)),
      Math.max(18, innerHeight / 13),
    );
    for (let i = 0; i < 12; i++) {
      const mid = (low + high) / 2;
      panel.style.fontSize = mid + "px";
      const fits =
        panel.scrollWidth <= panel.clientWidth &&
        panel.firstElementChild.getBoundingClientRect().top >= top - 0.25 &&
        panel.lastElementChild.getBoundingClientRect().bottom <= bottom + 0.25;
      if (fits) low = mid;
      else high = mid;
    }
    panel.style.fontSize = low + "px";
  }
}
window.addEventListener("resize", fitStage);
document.fonts.ready.then(fitStage);
document.fonts.addEventListener("loadingdone", fitStage);
main.addEventListener(
  "load",
  (event) => {
    if (
      event.target instanceof HTMLImageElement &&
      main.classList.contains("scene-projector")
    )
      fitStage();
  },
  true,
);

function admin() {
  let out =
    '<section class="desk-plenary-entry"><h2>Plénière</h2><div class="actions"><button type="button" data-desk-plenary>Piloter la plénière</button>' +
    (v.plenaryScreen
      ? deskLink(v.plenaryScreen, "Ouvrir l’écran de plénière")
      : "") +
    "</div></section>" +
    deskDirectory() +
    projectionPanel() +
    accessPanels() +
    (v.phase !== "Débriefing"
      ? btn(
          {
            Préparation: "Ouvrir le Parlement",
            Commissions: "Passer en plénière",
            Plénière: "Ouvrir le débriefing",
          }[v.phase],
          { type: "phase" },
        )
      : "");
  out += section(
    "Canal institutionnel",
    form({ type: "notice" }, field("Annonce publique", "text"), "Diffuser"),
  );
  if (role() === "Régie") {
    const pressOpen = ["Commissions", "Plénière"].includes(v.phase);
    out += details(v.wireAgency + " · Diffuser aux rédactions",
      (pressOpen ? form({ type: "writeWire" },
        field("Titre de la dépêche", "title") + field("Texte de la dépêche", "text", "", "area"),
        "Diffuser cette dépêche aux rédactions") : "") +
        v.wires.map((w) => section(w.title, para(w.text) +
          (w.sent ? tag("Envoyée") : pressOpen
            ? btn("Diffuser aux rédactions", { type: "wire", id: w.id }) : tag("À diffuser")))).join(""));
    out += details(
      "Accès et présences · " + v.roster.length,
      badgeGuide() + '<div class="actions">' +
      btn("Imprimer les accès privés", {ui:"printCards",private:true},true) + '</div>' +
      btn("Télécharger les accès", { ui: "access" }) +
        v.roster
          .map(
            (a) =>
              "<p><b>" +
              h(a.id) +
              "</b> · " +
              h(a.role) +
              " " +
              h(a.room) +
              " · " +
              (a.present ? "présent" : "absent") +
              "</p>" +
              btn(
                "Ouvrir cet accès",
                { ui: "accessLink", member: a.id },
                true,
              ) +
              btn(
                a.present ? "Signaler absent" : "Signaler présent",
                { type: "presence", member: a.id, present: !a.present },
                true,
              ) +
              btn("Renouveler la clé", { type: "rotate", member: a.id }, true),
          )
          .join(""),
    );
    if (v.phase === "Préparation")
      out += details(
        "Réaffecter un citoyen",
        form(
          { type: "assign" },
          opts(
            "Citoyen",
            "member",
            v.roster
              .filter((m) => m.role === "Citoyen")
              .map((m) => [m.id, m.id + " · " + m.room + " · " + m.group]),
          ) +
            opts("Commission", "room", Object.entries(v.roomNames)) +
            opts(
              "Territoire",
              "group",
              v.template.territories.map((t, i) => ["T" + i, t.name]),
            ),
          "Enregistrer l’affectation",
        ),
      );
    out += details(
      "Modération éditoriale",
      v.desk
        .map((n) =>
          section(
            n.draft.title,
            tag(n.status) +
              picture(n.draft) +
              para(n.draft.text) +
              (n.draft.sources ? para(n.draft.sources) : "") +
              (n.draft.cited?.length ? para("Personnes citées · " + n.draft.cited.map((id) => {
                const person = v.roster.find((p) => p.id === id);
                return [person?.gameName,id].filter(Boolean).join(" · ");
              }).join(", ")) : "") +
              (!n.wasPublished && n.draft.awardTo?.length ?
                para("Points demandés par la rédaction à la publication · " + n.draft.awardTo.join(", ")) : "") +
              awardReport(n.pressAwards,{h}) +
              (n.status === "à relire"
                ? btn("Autoriser la publication", {
                    type: "editorial",
                    revision: n.revision || 0,
                    id: n.id,
                    accept: true,
                  })
                : "") +
              btn(
                "Demander une correction",
                {
                  type: "editorial",
                  revision: n.revision || 0,
                  id: n.id,
                  accept: false,
                  reasonRequired: true,
                },
                true,
              ) +
              (n.public
                ? btn(
                    "Retirer du journal",
                    {
                      type: "editorial",
                    revision: n.revision || 0,
                      id: n.id,
                      hide: true,
                      reasonRequired: true,
                    },
                    true,
                  )
                : ""),
          ),
        )
        .join(""),
    );
    out += details(
      "Messages signalés",
      v.reports
        .map((n) =>
          section(
            n.reason,
            para(n.text) +
              btn("Retirer le message", {
                type: "moderate",
                id: n.id,
                reasonRequired: true,
              }),
          ),
        )
        .join(""),
    );
    out += details(
      "Éditeur de scénario",
      btn("Modifier les fiches et les profils", { ui: "editor" }) +
        '<div id="scenario-editor"></div>' +
        para(
          "Modifiez la copie JSON, puis téléchargez-la pour créer une autre session. La partie en cours conserve sa version.",
        ) +
        form(
          { ui: "template" },
          field(
            "Scénario versionné",
            "pack",
            JSON.stringify(v.template, null, 2),
            "area",
          ),
          "Télécharger cette version",
        ),
    );
    out += details(
      "Historique de séance",
      v.events
        .map((e) => para(e.time + " · " + e.what + " " + e.reason))
        .join(""),
    );
  }
  return out;
}
function bilan() {
  let b = v.balance;
  return (
    "<h2>Bilan de la session</h2>" +
    para(v.scenario + " · " + v.version + " · " + v.code) +
    section(
      "Plan national",
      b.chosen.map((m) => section(m.title, para(m.text))).join(""),
    ) +
    table(
      ["Dimension", "Textes initiaux", "Plan adopté"],
      b.dimensions.map((d, i) => [d, b.initial[i], b.final[i]]),
    ) +
    section(
      "Priorités territoriales",
      b.territories
        .map((t) =>
          para(
            t.name +
              " · " +
              t.goals
                .map(
                  (g) =>
                    b.dimensions[g.index] +
                    " ≥ " +
                    g.threshold +
                    " " +
                    (g.met ? "atteint" : "non atteint"),
                )
                .join(" / "),
          ),
        )
        .join(""),
    ) +
    section(
      "Mandats",
      v.lobby
        .map((l) =>
          para(
            l.name +
              " · " +
              l.objectives
                .map(
                  (x, i) =>
                    "Objectif " +
                    (i + 1) +
                    " " +
                    (x ? "atteint" : "non atteint"),
                )
                .join(" / ") +
              " · Ligne rouge : " +
              l.red,
          ),
        )
        .join(""),
    ) +
    table(
      ["Média", "Articles", "Ouvertures", "Citoyens distincts"],
      v.press.map((p) => [p.name, p.articles, p.audience, p.readers]),
    ) +
    details(
      "Points d’influence",
      table(
        [
          "Lobby",
          "Réserve",
          "Attribués",
          "Restants",
          "Acceptés",
          ...(v.rulesVersion === 2 ? [] : ["Activés", "Acceptés inutilisés", "Bonus retenu"]),
        ],
        v.lobby.map((l) => [
          l.name,
          l.capacity,
          l.offered,
          l.capacity - l.offered,
          l.accepted,
          ...(v.rulesVersion === 2 ? [] : [l.activated, l.accepted - l.activated, l.bonus.toLocaleString("fr-BE")]),
        ]),
      ),
    ) +
    details(
      "Audience et portée",
      table(
        [
          "Média",
          "Dépêches",
          "Unes",
          "Corrections",
          "Moyenne / article",
          "Portée",
        ],
        v.press.map((p) => [
          p.name,
          p.dispatches,
          p.unes,
          p.corrections,
          p.articles ? (p.audience / p.articles).toFixed(2) : "Sans objet",
          p.readers + " / " + v.citizens,
        ]),
      ),
    ) +
    details(
      "Ouvertures par article",
      v.circulation
        .map((a) =>
          section(
            a.title,
            para(a.media + " · " + a.total + " ouvertures uniques") +
              table(
                ["Scrutin", "Ouvertures avant clôture"],
                a.before.map((row) => {
                  let p = v.polls.find((p) => p.id === row.poll);
                  return [
                    v.roomNames[p.room] + " · " + labels[p.kind],
                    row.count,
                  ];
                }),
              ),
          ),
        )
        .join(""),
    ) +
    details(
      "Sondage facultatif",
      v.survey.respondents
        ? para(
            v.survey.respondents + " réponses / " + v.citizens + " citoyens",
          ) +
            table(
              ["Source citée", "Réponses"],
              Object.entries(v.survey.sources),
            ) +
            table(
              ["Changement d’avis", "Réponses"],
              Object.entries(v.survey.changed),
            )
        : para("Effectif insuffisant pour une restitution anonyme."),
    ) +
    section(
      "Journal du futur",
      para(v.journal[Math.max(0, v.jt)]) +
        btn("Projeter la séquence " + Math.min(v.jt + 2, v.journal.length), {
          type: "jt",
          slide: Math.min(v.jt + 1, v.journal.length - 1),
        }) +
        btn("Précédente", { type: "jt", slide: Math.max(-1, v.jt - 1) }, true) +
        btn("Quitter la projection", { type: "jt", slide: -1 }, true),
    ) +
    btn(
      v.showBalance
        ? "Masquer le bilan public"
        : "Projeter le plan et ses indicateurs",
      { type: "projectBalance", show: !v.showBalance },
    ) +
    details(
      "Circulation des dépêches",
      table(
        ["Dépêche", "Envoi", "Premier article (min)", "Titres publiés"],
        v.coverage.map((d) => [
          d.title,
          d.sent || "Non envoyée",
          d.delay ?? "—",
          d.titles.map((t) => t.media + " · " + t.title).join(" / ") ||
            "Non traitée",
        ]),
      ),
    ) +
    btn("Exporter les agrégats CSV", { ui: "csv" }) +
    btn("Imprimer / PDF", { ui: "print" }, true) +
    v.polls
      .filter((p) => p.result)
      .map((p) =>
        section(
          v.roomNames[p.room] + " · " + labels[p.kind],
          v.rulesVersion === 2 ? currentResult(v,p,{table,name}) : table(
            ["Texte", "Soutiens", "Bonus"],
            p.result.rows.map((z) => [name(z.id), z.raw, z.bonus]),
          ) +
            para(
              p.result.voters +
                " votants · " +
                p.result.abstain +
                " abstentions",
            ),
        ),
      )
      .join("")
  );
}
function fullElement() {
  return document.fullscreenElement || document.webkitFullscreenElement;
}
function updateFullButton() {
  const button = main.querySelector("[data-fullscreen]");
  if (button) {
    button.textContent = fullElement()
      ? "Quitter le plein écran"
      : "Plein écran";
    button.setAttribute("aria-pressed", String(Boolean(fullElement())));
  }
}
document.addEventListener("fullscreenchange", updateFullButton);
document.addEventListener("webkitfullscreenchange", updateFullButton);
main.addEventListener("click", async (e) => {
  if (!e.target.closest("[data-fullscreen]")) return;
  const root = document.documentElement;
  try {
    if (fullElement())
      await (document.exitFullscreen || document.webkitExitFullscreen).call(
        document,
      );
    else
      await (root.requestFullscreen || root.webkitRequestFullscreen).call(root);
    updateFullButton();
  } catch {
    say(
      "Le navigateur ne permet pas ce passage en plein écran. Utilisez son menu d’affichage.",
    );
  }
});
function render() {
  playerEnvironment(v.me);
  main.className = role() === "Projection" ? "projector" : "session-view";
  sessionLabel.textContent = v.code + " · " + v.me.role;
  if (role() === "Projection") {
    const screen = projectionScope(v);
    sessionLabel.textContent =
      screen === "commission"
        ? v.roomNames[v.me.room]
        : { press: "Actualités", plenary: "Plénière", general: "Parlement" }[
            screen
          ];
    const deck =
      screen === "commission"
        ? v.presentations?.[v.me.room]
        : screen === "plenary"
          ? v.presentations?.plenary
          : null;
    document.documentElement.classList.add("projecting-parliament");
    document.body.classList.add("projecting-parliament");
    main.classList.add("stage", "scene-projector");
    if (v.me.room) main.classList.add("commission-stage");
    main.innerHTML =
      '<div class="projection-tools"><button type="button" data-fullscreen>Plein écran</button></div>' +
      (screen === "press" ? pressScreen() : stageScreen(deck));
    fitStage();
    updateFullButton();
    loadPhotos();
    return;
  }
  document.documentElement.classList.remove("projecting-parliament");
  document.body.classList.remove("projecting-parliament");
  if (plenaryRequested() && v.presentations?.plenary?.menu) {
    sessionLabel.textContent = "Présidence · Régie";
    main.innerHTML = plenaryDesk(v, preparedDuel, {
      polls,
      h,
      btn,
      form,
      para,
      details,
      roomMark,
      deskLink,
      pollLabel,
      name,
      banner,
      icon,
    });
    return;
  }
  const scope = openDeskScope();
  if (scope && v.presentations?.[scope]?.menu) {
    sessionLabel.textContent = v.roomNames[scope] + " · Régie";
    main.innerHTML = commissionDesk(
      v,
      scope,
      preparedMeasures.get(v.code + "/" + scope),
      {
        h,
        btn,
        form,
        para,
        details,
        roomMark,
        deskLink,
        pollLabel,
        name,
        banner,
        proposals,
        polls,
      },
    );
    return;
  }
  const participant = !chair();
  if (v.team) sessionLabel.innerHTML = roleMark(v.me) + "<b>" + h(identityTheme(v.me).roleLabel) + "</b>";
  else if (participant) sessionLabel.textContent = role();
  const citizen = role() === "Citoyen";
  let tabs = citizen ? ["Assemblée","Vote","Influence","Journal"] : ["Assemblée","Journal"];
  if (v.me.group) tabs.push("Mon équipe");
  if (role() === "Journaliste") tabs.push("Rédaction");
  if (v.myCard) tabs.push("Ma carte");
  if (role() === "Journaliste" && v.pressDirectory)
    sessionStorage.setItem("pc.press." + v.code + "." + v.me.id, "2");
  if (chair()) tabs.push("Régie");
  if (v.balance) tabs.push("Débriefing");
  if (!tabs.includes(tab)) {
    if (chair()) tab = "Régie";
    else if (role() === "Journaliste" && ["Commissions", "Plénière"].includes(v.phase)) tab = "Rédaction";
    else if (role() === "Lobby") tab = "Mon équipe";
    else tab = "Assemblée";
  }
  main.innerHTML =
    '<div class="lead">' +
    tag(v.phase === "Préparation" ? "Préparation en classe" : v.phase) +
    " " +
    (participant ? "" : tag(v.version)) +
    "<h1>" +
    h(
      participant
        ? v.scenario.replace(
            /^Répétition · (?:Commissions|Plénière|Débriefing) · /,
            "",
          )
        : v.scenario,
    ) +
    "</h1>" +
    (v.team ? groupIdentity() : v.me.room ? para(v.roomNames[v.me.room]) : "") +
    (v.phase === "Préparation"
      ? para(
          v.context.replace(
            "Les effets présentés sont des hypothèses de jeu soumises à relecture.",
            "Les commissions examinent les effets attendus de chaque mesure.",
          ),
        ) +
        (v.composition
          ? details(
              "Composition du Parlement",
              table(
                ["Commission", "Citoyens présents"],
                v.composition.map((z) => [z.name, z.count]),
              ),
            )
          : "")
      : "") +
    "</div>" +
    v.notices
      .filter(
        (n) =>
          !participant || !n.startsWith("Session de répétition. Les identités"),
      )
      .slice(-1)
      .map((n) => section("Annonce du Parlement", para(n)))
      .join("") +
    '<nav class="player-tabs">' +
    (role() === "Modérateur"
      ? '<button type="button" data-desk-return>Ma régie de commission</button>'
      : "") +
    tabs
      .map(
        (t) =>
          '<button data-tab="' +
          h(t) +
          '" aria-current="' +
          (t === tab) +
          '">' +
          icon(navIcons[t]) +
          h(t === "Mon équipe" ? "Mon groupe" : t) +
          "</button>",
      )
      .join("") +
    btn("Quitter", { ui: "exit" }, true) +
    "</nav>" +
    (citizen && tab === "Assemblée" ? citizenBallotPanel() + pressAwardNotice(v,{h,btn}) + citizenInfluencePanel(v,{h,btn},{compact:true}) : "") +
    {
      Assemblée: assembly,
      Vote: citizenBallotPanel,
      Influence: () => pressAwardNotice(v,{h,btn}) + citizenInfluencePanel(v,{h,btn}),
      "Ma carte": () => scannedCard
        ? showPublicCard(scannedCard,role() === "Lobby" ? v : null,{h,btn}) +
          (v.pressDirectory && v.phase !== "Débriefing" ? btn("Enregistrer cette source dans mes contacts",{ui:"savePressCard",card:scannedCard.card},true) : "") +
          btn("Revenir à ma carte", {ui:"ownCard"}, true)
        : showPersonalCard(v.myCard,link({...v.me,key:auth.key}),showPrivateCard,{h,btn}) +
          (v.rulesVersion === 2 && citizen && !showPrivateCard && v.phase !== "Débriefing"
            ? section("Mon nom de jeu",form({type:"gameName"},
              '<label>Nom de jeu facultatif<input name="gameName" maxlength="40" value="' + h(v.myCard.gameName) +
                '" autocomplete="off"></label><p>Un surnom suffit. Il apparaît sur votre carte publique et permet aux journalistes de vous retrouver. Vous pouvez aussi garder uniquement votre identifiant.</p>',
              "Enregistrer mon nom de jeu")) : ""),
      Journal: journal,
      "Mon équipe": team,
      Rédaction: newsroom,
      Régie: admin,
      Débriefing: bilan,
    }[tab]();
  loadPhotos();
}
function renderPreservingDetails() {
  let expanded = [...main.querySelectorAll("details[open] > summary")].map(
    (e) => e.textContent,
  );
  render();
  for (let sum of main.querySelectorAll("summary"))
    if (expanded.includes(sum.textContent)) sum.parentNode.open = true;
}
function editingCurrentForm(next) {
  return [...main.querySelectorAll("form:focus-within, form[data-dirty]")].some(
    (f) => {
      const action = f.dataset.action && JSON.parse(f.dataset.action);
      if (action?.type === "article")
        return ["Commissions", "Plénière"].includes(next.phase);
      if (action?.type === "message") return next.team?.canMessage && next.me.group === v.me.group;
      if (action?.type === "offer") {
        const hasReserve = next.offers.filter((o) => ["proposé","accepté"].includes(o.status)).length < next.capacity;
        return next.me.present !== false && hasReserve &&
          next.targets.some((t) => t.id === f.elements.to.value);
      }
      return (
        action?.type !== "vote" ||
        next.wallet?.points === v.wallet?.points && next.polls.some(
          (p) => p.id === action.poll && p.status === "ouvert" && !p.voted,
        )
      );
    },
  );
}
let readSequence = 0,
  appliedRead = 0;
async function refresh(force = false) {
  if (!auth || (pending && !force)) return;
  const requestNumber = ++readSequence;
  let current = auth,
    next = await call("view", current);
  if (current !== auth || requestNumber < appliedRead) return;
  appliedRead = requestNumber;
  if (
    projectorPage &&
    (next.me?.role !== "Projection" ||
      next.code !== targetWall?.code ||
      screenScope(next.me) !== targetWall.scope)
  )
    throw Error(
      "Cet accès correspond à une autre salle. Ouvrez le lien du projecteur depuis sa régie.",
    );
  if (!projectorPage && next.me?.role === "Projection") {
    const path = projectionLink(next.code, { ...next.me, key: auth.key });
    if (path) {
      location.replace(path);
      return;
    }
  }
  const writing = main.querySelector("form[data-news-article]:is(:focus-within, [data-dirty])");
  if (!force && writing && ["Commissions", "Plénière"].includes(next.phase)) {
    if (v.phase !== next.phase) {
      const phaseLabel = main.querySelector(".lead > .tag");
      if (phaseLabel) phaseLabel.textContent = next.phase;
    }
    updateWritingDesk(next, writing);
    return;
  }
  let json = JSON.stringify(next);
  if (!force && (json === last || document.querySelector("#scenario-editor form"))) return;
  if (!force && editingCurrentForm(next)) {
    // Keep the composer and its caret in place as other group members send messages.
    const feed = main.querySelector("#group-messages");
    if (feed && next.messages && next.me.group === v.me.group &&
        JSON.stringify(next.messages) !== JSON.stringify(v.messages)) {
      feed.innerHTML = groupFeed(next.messages, next.me.id);
      v.messages = next.messages;
    }
    return;
  }
  last = json;
  v = next;
  renderPreservingDetails();
}
function download(file, body, type) {
  let url = URL.createObjectURL(new Blob([body], { type })),
    a = document.createElement("a");
  a.href = url;
  a.download = file;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function csv(rows) {
  return (
    "\uFEFF" +
    rows
      .map((r) =>
        r
          .map(
            (v) =>
              '"' +
              String(v ?? "")
                .replace(/^([=+@-])/, "'$1")
                .replaceAll('"', '""') +
              '"',
          )
          .join(";"),
      )
      .join("\r\n")
  );
}
function link(a) {
  if (a.role === "Projection" || a.id === "ECR" || a.id.startsWith("ECR-")) {
    const wall = projectionLink(v.code, a);
    if (wall) return location.origin + wall;
  }
  if (a.id === "REG" && auth?.google)
    return location.origin + "/admin?session=" + encodeURIComponent(v.code);
  return (
    location.origin +
    "/" +
    "#" +
    new URLSearchParams({ code: v.code, id: a.id, key: a.key })
  );
}
async function run(x) {
  if (pending) return;
  pending = true;
  try {
    if (x.ui === "scanPress" && v.pressDirectory) {
      const f = main.querySelector("[data-news-article]");
      if (f) rememberDraft(f);
      scanCard({session:v.code, lookup:target=>call("card",target), onCard:person=>run({ui:"savePressCard",card:person.card})});
      return;
    }
    if (x.ui === "savePressCard" && v.pressDirectory) {
      await call("action",{...auth,action:{type:"pressContact",card:x.card}});
      scannedCard=null; tab="Rédaction";
      await refresh(true); say("Source enregistrée dans vos contacts.");
      return;
    }
    if (x.ui === "scanCard" && v.myCard) {
      scanCard({session:v.code,lookup:target=>call("card",target),onCard:person=>{
        scannedCard = person; showPrivateCard = false; tab = "Ma carte"; render(); window.scrollTo(0,0);
      }});
      return;
    }
    if (x.ui === "useRecipient" && role() === "Lobby" && scannedCard?.id === x.id && scannedCard.code === v.code) {
      selectedCitizenId = x.id; scannedCard=null; tab="Mon équipe"; render();
      main.querySelector(".influence-lobby, [data-command*='scanCard']")?.closest("article")?.scrollIntoView({block:"start"}); return;
    }
    if (x.ui === "cardPrivacy" || x.ui === "ownCard") {
      if (!v.myCard) return;
      scannedCard=null; showPrivateCard=x.ui==="cardPrivacy" && x.private===true;
      render(); return;
    }
    if (x.ui === "printCards" && v.roster) { printParticipantCards(v, x.private===true, {h,link}); return; }
    if (x.ui === "editor") {
      editor(document.querySelector("#scenario-editor"), v.template, say);
      return;
    }
    if (x.ui === "exit") {
      scannedCard=null; selectedCitizenId=""; showPrivateCard=false;
      observingAsModerator = false;
      preparedMeasures.clear();
      const url = new URL(location.href);
      url.searchParams.delete("commission");
      url.searchParams.delete("regie");
      history.replaceState(null, "", url);
      const wasGoogle = auth?.google;
      auth = null;
      v = null;
      sessionStorage.removeItem("pc.auth");
      tab = null;
      room = "";
      editing = "";
      reading = "";
      if (wasGoogle) {
        location.assign("/admin");
        return;
      }
      login();
      return;
    }
    if (x.ui === "join" || x.ui === "create") {
      let next =
        x.ui === "join"
          ? {
              code: x.code.trim().toUpperCase(),
              id: x.id.trim().toUpperCase(),
              key: x.key.trim(),
            }
          : await call("create", x);
      await call("view", next);
      auth = next;
      if (auth.id !== "ECR" && !auth.id?.startsWith("ECR-"))
        sessionStorage.setItem("pc.auth", JSON.stringify(auth));
      observingAsModerator = false;
      tab = null;
      room = "";
      editing = "";
      reading = "";
    } else if (x.ui === "read") {
      await call("action", { ...auth, action: { type: "read", id: x.id } });
      reading = x.id;
      if (x.fromNotice) tab = "Journal";
    } else if (x.ui === "useWire") {
      const f = main.querySelector("[data-news-article]");
      if (!f) return;
      f.elements.wire.value = x.id;
      f.elements.wire.dispatchEvent(new Event("input", { bubbles: true }));
      f.elements.title.focus();
      return;
    } else if (x.ui === "reopenDraft") {
      sessionStorage.removeItem(draftKey());
      render();
      return;
    } else if (x.ui === "copyDraft") {
      const f = main.querySelector("[data-news-article]");
      if (!f.reportValidity()) return;
      const action = articleAction(f, false);
      delete action.id;
      const originalImage = f.querySelector("img[data-photo]")?.dataset.photo;
      if (originalImage && !action.photo && !action.removeImage)
        action.photo = (await call("picture", { ...auth, image: originalImage })).photo;
      await call("action", { ...auth, action });
      sessionStorage.removeItem(draftKey());
      editing = "";
      say("Votre saisie a été enregistrée dans un nouveau brouillon.");
    } else if (x.ui === "edit") {
      editing = x.id;
      render();
      return;
    } else if (x.ui === "accessLink") {
      window.open(
        link(v.roster.find((a) => a.id === x.member)),
        "_blank",
        "noopener,noreferrer",
      );
      return;
    } else if (x.ui === "access") {
      download(
        v.code + "-acces.csv",
        csv([
          ["Identifiant", "Rôle", "Groupe", "Commission", "Accès privé"],
          ...v.roster.map((a) => [a.id, a.role, a.group, a.room, link(a)]),
        ]),
        "text/csv",
      );
      return;
    } else if (x.ui === "template") {
      let p = JSON.parse(x.pack);
      download("scenario.json", JSON.stringify(p, null, 2), "application/json");
      return;
    } else if (x.ui === "print") {
      const print = document.createElement("section");
      print.id = "teacher-report";
      print.innerHTML =
        "<h1>Parlement citoyen</h1>" +
        table(
          ["Rubrique", "Groupe ou session", "Indicateur", "Résultat"],
          reportRows(v, name),
        );
      document.body.append(print);
      try {
        window.print();
      } finally {
        print.remove();
      }
      return;
    } else if (x.ui === "csv") {
      download(
        v.code + "-bilan.csv",
        csv([
          ["Rubrique", "Groupe ou session", "Indicateur", "Résultat"],
          ...reportRows(v, name),
        ]),
        "text/csv",
      );
      return;
    } else {
      if (x.reasonRequired) {
        x.reason = prompt("Motif à consigner");
        if (!x.reason?.trim()) return;
      }
      await call("action", { ...auth, action: x });
      if (x.type === "offer") selectedCitizenId="";
      say(
        x.type === "article" ? (x.publish ? (v.reviewArticles ? "Article transmis à la régie pour relecture." : "Article publié dans le journal.") : "Brouillon enregistré pour votre rédaction.") :
        x.type === "vote"
          ? "Votre bulletin a été enregistré."
          : x.type === "offer" ? "Le point a été proposé au citoyen."
          : x.type === "respond" ? (x.accept ? "Vous avez accepté le point." : "Vous avez refusé le point.")
          : "Action enregistrée.",
      );
      if (x.type === "article") {
        sessionStorage.removeItem(draftKey());
        editing = "";
      }
    }
    await refresh(true);
  } catch (e) {
    if (x.type === "article" && x.id) {
      const f = main.querySelector("[data-news-article]");
      if (f) {
        try { updateWritingDesk(await call("view", auth), f); } catch { /* Keep the form available offline. */ }
      }
    }
    say(
      x.type === "vote" && e instanceof TypeError
        ? "Envoi à vérifier · Reconnectez-vous pour retrouver votre confirmation."
        : e.message,
    );
  } finally {
    pending = false;
  }
}
main.addEventListener("click", (e) => {
  const pressLink = e.target.closest('a[href^="#article="]');
  if (pressLink && pressLink.hash === location.hash) { e.preventDefault(); openPressLink(); return; }
  if (e.target.closest("[data-examine-amendments]")) {
    e.preventDefault();
    const list = main.querySelector("#desk-amendments details");
    if (list) {
      list.open = true;
      list.querySelector("summary").focus();
      list.scrollIntoView({ block: "start" });
    }
    return;
  }
  let b = e.target.closest("button");
  if (!b) return;
  if (b.hasAttribute("data-press-add") || b.hasAttribute("data-press-remove")) {
    const f = b.form;
    changeSources(f,v,v.desk.find((n) => n.id === editing),{h},{add:b.dataset.pressAdd,remove:b.dataset.pressRemove});
    f.dataset.dirty = "1"; delete f.dataset.requestId; rememberDraft(f);
    if (b.hasAttribute("data-press-remove")) void checkPressRecipients(f);
    return;
  }
  if (b.hasAttribute("data-desk-plenary")) {
    changeDesk("", true);
    return;
  }
  if (b.hasAttribute("data-desk-home")) {
    changeDesk("");
    return;
  }
  if (b.dataset.deskRoom) {
    changeDesk(b.dataset.deskRoom);
    return;
  }
  if (
    b.hasAttribute("data-desk-observe") ||
    b.hasAttribute("data-desk-return")
  ) {
    observingAsModerator = b.hasAttribute("data-desk-observe");
    room = v.me.room;
    tab = "Assemblée";
    render();
    window.scrollTo(0, 0);
    return;
  }
  if (b.dataset.follow) {
    room = b.dataset.follow;
    tab = "Assemblée";
    render();
    return;
  }
  if (b.dataset.tab) {
    showPrivateCard = false; scannedCard = null;
    tab = b.dataset.tab;
    render();
  }
  if (b.dataset.room) {
    room = b.dataset.room;
    render();
  }
  if (b.dataset.command) run(JSON.parse(b.dataset.command));
});
main.addEventListener("change", async (e) => {
  const input = e.target;
  if (input.name === "awardTo" && input.form?.hasAttribute("data-news-article")) {
    const f = input.form;
    changeSources(f,v,v.desk.find((n) => n.id === editing),{h});
    f.dataset.dirty = "1"; delete f.dataset.requestId; rememberDraft(f);
    await checkPressRecipients(f);
    return;
  }
  if (input.name === "to" && input.form?.elements.measure && v?.targets) {
    selectedCitizenId = input.value;
    const choices = influenceMeasures(v, input.value);
    input.form.elements.measure.replaceChildren(...choices.map(([id, title]) => new Option(title, id)));
    return;
  }
  if (!["attachment", "camera"].includes(input.name)) return;
  const f = input.form,
    file = input.files[0];
  if (!file) return;
  f.elements[input.name === "camera" ? "attachment" : "camera"].value = "";
  const preview = f.querySelector("[data-preview]"),
    submit = f.querySelectorAll('button[type="submit"]');
  const request = String(Number(f.dataset.upload || 0) + 1);
  f.dataset.upload = request;
  for (const b of submit) b.disabled = true;
  try {
    const photo = await preparePhoto(file);
    if (f.dataset.upload === request) {
      preview.src = photo;
      preview.hidden = false;
      if (f.elements.removeImage) f.elements.removeImage.checked = false;
      rememberDraft(f);
    }
  } catch (err) {
    if (f.dataset.upload === request) {
      input.value = "";
      preview.hidden = true;
      preview.removeAttribute("src");
      say(err.message);
    }
  } finally {
    if (f.dataset.upload === request)
      for (const b of submit) b.disabled = false;
  }
});
main.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.target.matches("[data-press-search]")) e.preventDefault();
});
main.addEventListener("input", (e) => {
  if (e.target.matches("[data-press-search]")) {
    const form = e.target.form;
    form.querySelector("[data-press-results]").innerHTML =
      pressSearchResults(v,e.target.value,pressSelections(form).cited,{h});
    return;
  }
  if (e.target.form?.dataset.action) {
    let f = e.target.form;
    f.dataset.dirty = "1";
    if (e.target.name === "choices" && f.elements.boost) {
      const boost = f.elements.boost;
      boost.disabled = !e.target.value || !v.wallet?.points;
      if (boost.disabled) boost.checked = false;
    }
    if (f.hasAttribute("data-news-article")) { delete f.dataset.requestId; rememberDraft(f); }
  }
});
const previewRequests = new WeakMap();
async function checkPressRecipients(form) {
  const status = form.querySelector("[data-press-preview]");
  if (!status) return true;
  const { awardTo } = pressSelections(form);
  const request = Symbol();
  previewRequests.set(form, request);
  if (!awardTo.length) {
    status.replaceChildren();
    return true;
  }
  const current = () => form.isConnected && previewRequests.get(form) === request &&
    JSON.stringify(pressSelections(form).awardTo) === JSON.stringify(awardTo);
  status.textContent = "Vérification des points demandés…";
  try {
    const entries = await call("press-preview",{...auth, article:editing, recipients:awardTo,
      requestId: form.dataset.sendingPublish === "true" ? form.dataset.requestId : undefined});
    if (!current()) return false;
    if (entries.every((entry) => entry.status === "submitted")) {
      form.querySelector("[data-press-preview]").textContent = "Votre envoi a déjà été enregistré.";
      return true;
    }
    const unavailable = new Set(entries.filter((e) => e.status !== "available").map((e) => e.id));
    if (unavailable.size) {
      for (const option of form.querySelectorAll('input[name="awardTo"]:checked')) {
        if (unavailable.has(option.value)) option.checked = false;
      }
      changeSources(form,v,v.desk.find((n) => n.id === editing),{h});
      delete form.dataset.requestId;
      rememberDraft(form);
    }
    form.querySelector("[data-press-preview]").innerHTML = awardPreview(entries,{h});
    return unavailable.size === 0;
  } catch {
    if (current()) form.querySelector("[data-press-preview]").textContent =
      "Vérification indisponible. Réessayez ou décochez les points pour publier les citations seules.";
    return false;
  }
}
function articleAction(f, publish) {
  if (!f.dataset.requestId || f.dataset.sendingPublish !== String(publish)) {
    f.dataset.requestId = [...crypto.getRandomValues(new Uint8Array(16))]
      .map((byte) => byte.toString(16).padStart(2,"0")).join("");
    f.dataset.sendingPublish = String(publish);
    rememberDraft(f);
  }
  const x = { ...JSON.parse(f.dataset.action), ...Object.fromEntries(new FormData(f)),
    ...pressSelections(f), publish, requestId:f.dataset.requestId };
  delete x.attachment;
  delete x.camera;
  const preview = f.querySelector("[data-preview]");
  if (!preview.hidden && !x.removeImage) x.photo = preview.src;
  return x;
}
main.addEventListener("submit", async (e) => {
  e.preventDefault();
  let f = e.target,
    d = new FormData(f),
    x = { ...JSON.parse(f.dataset.action), ...Object.fromEntries(d) };
  try {
    if (x.type === "article") {
      const publish = e.submitter?.name === "publish";
      if (publish && pressSelections(f).awardTo?.length && !await checkPressRecipients(f)) return;
      x = articleAction(f, publish);
    }
    if (x.type === "offer" && globalThis.crypto?.randomUUID) {
      const choice = JSON.stringify([x.to, x.measure]);
      if (f.dataset.offerChoice !== choice) {
        f.dataset.offerChoice = choice;
        f.dataset.offerRequest = crypto.randomUUID();
      }
      x.requestId = f.dataset.offerRequest;
    }
    if (x.type === "survey") x.sources = d.getAll("sources");
    if (x.type === "paper") {
      x.count = Number(x.count);
      x.abstain = Number(x.abstain);
      x.checked = x.checked === "on";
      x.raw = Object.fromEntries(
        [...d]
          .filter(([k]) => k.startsWith("raw-"))
          .map(([k, n]) => [k.slice(4), Number(n)]),
      );
    }
    if (x.type === "vote") {
      x.choices = d.getAll("choices").filter(Boolean);
      if (f.elements.boost) x.boost = Boolean(x.choices.length && f.elements.boost.checked);
    }
    if (x.ui === "create") {
      x.pack = x.pack.size ? JSON.parse(await x.pack.text()) : null;
      x.settings = {};
      if (x.counts) x.settings.counts = x.counts.split(",").map(Number);
      if (x.reserve !== "") x.settings.reserve = Number(x.reserve);
      if (x.minGroup) x.settings.minGroup = Number(x.minGroup);
    }
    await run(x);
  } catch (err) {
    say(err.message);
  }
});
export function openGoogleDesk(code, state) {
  auth = { code, id: "REG", google: true };
  tab = "Régie";
  room = "";
  v = state;
  last = JSON.stringify(state);
  render();
  if (location.hash === "#badges") {
    const guide = document.getElementById("badges");
    if (guide) {
      guide.closest("details").open = true;
      guide.focus();
    }
  }
}
if (projectorPage) {
  if (auth) refresh(true).catch((error) => offerWallAccess(error.message));
  else if (targetWall) {
    location.replace(
      "/admin?" +
        new URLSearchParams({
          session: targetWall.code,
          projection: targetWall.scope,
        }),
    );
  } else offerWallAccess("Adresse d’écran inconnue.");
} else if (
  location.pathname !== "/admin" &&
  location.pathname !== "/admin.html"
) {
  if (auth?.google)
    location.replace("/admin?session=" + encodeURIComponent(auth.code));
  else if (auth)
    refresh(true).then(async () => {
      if (hash.has("article")) return openPressLink();
      const card = hash.get("carte");
      if (!card || (role() !== "Lobby" && !v.pressDirectory)) return;
      history.replaceState(null,"",location.pathname);
      try {
        scannedCard=await call("card",{code:v.code,card});
        if (v.pressDirectory) return run({ui:"savePressCard",card:scannedCard.card});
        tab="Ma carte"; render();
      } catch(e) { say(e.message); }
    }).catch((e) => {
      say(e.message);
      login();
    });
  else login();
}
setInterval(
  () =>
    refresh().catch(() => say("Connexion interrompue. Reconnexion en cours.")),
  3500,
);
