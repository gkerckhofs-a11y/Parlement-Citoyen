import { reportRows } from "./report.js";
import { editor } from "./editor.js";
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
let auth = JSON.parse(sessionStorage.getItem("pc.auth") || "null"),
  v = null,
  tab = auth?.google ? "Régie" : "Assemblée",
  room = "",
  reading = "",
  editing = "",
  pending = false,
  last = "",
  noticeTimer;
const hash = new URLSearchParams(location.hash.slice(1));
if (hash.has("key")) {
  auth = { code: hash.get("code"), id: hash.get("id"), key: hash.get("key") };
  sessionStorage.setItem("pc.auth", JSON.stringify(auth));
  history.replaceState(null, "", location.pathname);
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
              "Bearer " + (await (await import("./google.js")).bearer()),
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
  main.innerHTML =
    '<div class="intro"><h1>Parlement citoyen</h1><p>Entrez dans votre Parlement avec les accès remis par l’organisation.</p></div><div class="grid">' +
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
  plenary: "Duel de plénière",
};
const role = () => v.me.role,
  chair = () => ["Régie", "Présidence"].includes(role()),
  control = (r) => chair() || (role() === "Modérateur" && v.me.room === r);
const name = (id) =>
  v.measures.find((m) => m.id === id)?.title ||
  v.amends.find((a) => a.id === id)?.text ||
  id;
const aff = (id) => "<strong>" + h(name(id)) + "</strong>";
function trend(vv) {
  const keys = {
    "↑↑": "très favorable",
    "↑": "favorable",
    "—": "aucun effet significatif modélisé",
    "↓": "défavorable",
    "↓↓": "très défavorable",
    "": "incertain",
  };
  return (
    '<p class="meta">' +
    vv.trends
      .map(
        (t, i) =>
          h(v.dimensions[i]) +
          " " +
          h(t) +
          " " +
          h(keys[t.replace("?", "")] || "") +
          (t.includes("?") ? " (incertain)" : ""),
      )
      .join(" · ") +
    "</p>"
  );
}
function polls(r) {
  return v.polls
    .filter((p) => p.room === r)
    .slice()
    .reverse()
    .map((p) => {
      let body =
        tag(p.status) +
        (p.round ? " " + tag("Départage") : "") +
        para(p.options.map(name).join(" • "));
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
      if (p.voted) body += para("Votre bulletin a été enregistré.");
      else if (p.eligible && p.status === "ouvert")
        body += form(
          { type: "vote", poll: p.id },
          "<fieldset><legend>" +
            h(
              "Choisissez au maximum " +
                p.seats +
                " option(s). Un bulletin vide vaut abstention.",
            ) +
            "</legend>" +
            p.options
              .map(
                (id) =>
                  '<label><input type="checkbox" name="choices" value="' +
                  h(id) +
                  '">' +
                  h(name(id)) +
                  "</label>",
              )
              .join("") +
            "</fieldset>",
          "Enregistrer mon bulletin",
        );
      if (p.result) {
        let t = p.result;
        body +=
          table(
            ["Option", "Soutiens", "Bonus", "Total"],
            t.rows.map((z) => [
              name(z.id),
              z.raw,
              z.bonus.toLocaleString("fr-BE", { maximumFractionDigits: 3 }),
              (z.weight / t.denominator).toLocaleString("fr-BE", {
                maximumFractionDigits: 3,
              }),
            ]),
          ) +
          para(
            t.voters +
              " votants · " +
              t.abstain +
              " abstentions · " +
              t.absent +
              " sans bulletin",
          );
        if (p.winners)
          body += para("Retenu · " + p.winners.map(name).join(" • "));
      }
      if (control(r) && (p.kind !== "plenary" || chair())) {
        let commands =
          {
            ouvert: [
              ["close", "Clore"],
              ["suspend", "Suspendre"],
            ],
            clos: [["announce", "Annoncer le résultat"]],
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
      if (control(r) && ["suspendu", "incident"].includes(p.status))
        body += details(
          "Secours papier",
          form(
            { type: "paper", poll: p.id },
            para(
              "Invalidez cette urne pour tout l’électorat. Annoncez le nouveau vote à voix égales avant de distribuer les bulletins. Deux adultes vérifient le comptage.",
            ) +
              field("Bulletins papier", "count", 0, "number") +
              field("Abstentions", "abstain", 0, "number") +
              p.options
                .map((id) => field(name(id), "raw-" + id, 0, "number"))
                .join("") +
              field("Motif et provenance", "reason") +
              '<label><input type="checkbox" required name="checked">Double comptage effectué</label>',
            "Enregistrer le scrutin papier",
          ),
        );
      return section(labels[p.kind], body);
    })
    .join("");
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
function assembly() {
  let list = Object.keys(v.rooms);
  if (!list.includes(room)) room = v.me.room || list[0];
  let r = v.rooms[room],
    ms = v.measures.filter((m) => m.room === room),
    m = ms.find((m) => m.id === r.focus);
  let title = h(v.roomNames[room]),
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
              h(v.roomNames[k]) +
              "</button>",
          )
          .join("") +
        "</nav>"
      : "";
  let focus = m
    ? section(
        m.title,
        tag("Texte en discussion") +
          para(m.text) +
          (m.official.id !== m.id
            ? section("Clause adoptée", para(m.official.text))
            : "") +
          trend(m.official) +
          (r.until
            ? para(
                "Échéance indicative · " +
                  new Date(r.until).toLocaleTimeString("fr-BE"),
              )
            : ""),
      )
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
  if (v.slide && display)
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
            tag(latest.status) +
              latest.options
                .map(
                  (id) =>
                    aff(id) +
                    para(v.measures.find((m) => m.id === id)?.official.text),
                )
                .join(""),
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
    cmd += form(
      { type: "focus", room },
      opts(
        "Texte à projeter",
        "measure",
        ms.map((m) => [m.id, m.title]),
      ) +
        '<label>Minuteur (minutes)<input type="number" name="minutes" min="1" max="180"></label>',
      "Afficher en salle",
    );
    if (phase === "Commissions" && !r.finalists.length)
      cmd +=
        form(
          { type: "open", kind: "amend", room },
          opts(
            "Mesure amendée",
            "measure",
            ms.map((m) => [m.id, m.title]),
          ),
          "Ouvrir le vote des amendements",
        ) +
        btn("Verrouiller l’influence et ouvrir la sélection", {
          type: "open",
          room,
          kind: "selection",
        });
    if (phase === "Plénière" && chair() && !r.winner)
      cmd += btn("Ouvrir le duel de plénière", {
        type: "open",
        room,
        kind: "plenary",
      });
    cmd = details("Commandes de salle", cmd);
  }
  let actions = "";
  if (
    !display &&
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
          ms.map((m) => [m.id, m.title]),
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
    polls(room) +
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
                para(m.text) +
                  trend(m) +
                  para(m.caution || "") +
                  m.variants
                    .map((t) => details(t.title, para(t.text) + trend(t)))
                    .join(""),
              ),
            )
            .join(""),
        )) +
    "</div>"
  );
}
function team() {
  let out = v.team ? section(v.team.name, para(v.team.mission)) : "";
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
  if (v.offers) {
    out += section(
      "Propositions d’influence",
      (role() === "Lobby"
        ? para("Réserve partagée · " + v.capacity + " point(s)")
        : "") +
        v.offers
          .map(
            (o) =>
              "<p>" +
              h(o.measure + " · " + o.to + " · " + o.status) +
              "</p>" +
              (role() === "Citoyen" && o.status === "proposé"
                ? btn("Accepter", {
                    type: "respond",
                    offer: o.id,
                    accept: true,
                  }) +
                  btn(
                    "Refuser",
                    { type: "respond", offer: o.id, accept: false },
                    true,
                  )
                : ""),
          )
          .join("") +
        (role() === "Lobby" && v.phase === "Commissions"
          ? form(
              { type: "offer" },
              opts(
                "Citoyen",
                "to",
                v.targets.map((t) => [
                  t.id,
                  t.id + " · " + v.roomNames[t.room],
                ]),
              ) +
                opts(
                  "Mesure de sa commission",
                  "measure",
                  v.measures.map((m) => [m.id, m.title]),
                ),
              "Proposer un point",
            )
          : ""),
    );
  }
  if (v.messages)
    out += section(
      "Conversation privée",
      v.messages
        .map(
          (m) =>
            "<p><b>" +
            h(m.by) +
            "</b> · " +
            h(m.text) +
            "</p>" +
            btn(
              "Signaler",
              { type: "report", id: m.id, reasonRequired: true },
              true,
            ),
        )
        .join("") +
        form(
          { type: "message" },
          field("Message", "text", "", "area"),
          "Envoyer",
        ),
    );
  return out;
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
        section(
          n.title,
          tag(n.media) +
            (n.front ? " " + tag("À la Une") : "") +
            para(
              new Date(n.time).toLocaleString("fr-BE") +
                (n.corrected ? " · corrigé" : ""),
            ) +
            (reading === n.id
              ? para(n.text) + para(n.sources)
              : btn("Lire l’article", { ui: "read", id: n.id })),
        ),
      )
      .join("")
  );
}
function draftKey() {
  return "pc.draft." + auth.code + "." + auth.id + "." + editing;
}
function newsroom() {
  let item = v.desk.find((n) => n.id === editing),
    d =
      JSON.parse(sessionStorage.getItem(draftKey()) || "null") ||
      item?.draft ||
      {};
  return (
    "<h2>Bureau de rédaction</h2>" +
    v.wires.map((w) => details(w.id + " · " + w.title, para(w.text))).join("") +
    section(
      editing ? "Modifier l’article" : "Nouvel article",
      form(
        { type: "article", id: editing },
        field("Titre", "title", d.title || "") +
          field("Article", "text", d.text || "", "area") +
          '<label>Sources et interviews<input name="sources" value="' +
          h(d.sources) +
          '"></label>' +
          opts("Dépêche traitée", "wire", [
            ["", "Sujet libre"],
            ...v.wires.map((w) => [w.id, w.title]),
          ]) +
          '<label><input type="checkbox" name="publish">Soumettre à publication</label>',
        "Enregistrer",
      ),
    ) +
    btn("Nouveau brouillon", { ui: "edit", id: "" }, true) +
    v.desk
      .map((n) =>
        section(
          n.draft.title,
          tag(n.status) +
            para(n.reason || "") +
            btn("Ouvrir le brouillon", { ui: "edit", id: n.id }) +
            (n.public
              ? btn(
                  n.front ? "Retirer la Une" : "Mettre à la Une",
                  { type: "front", id: n.id },
                  true,
                )
              : ""),
        ),
      )
      .join("")
  );
}
function admin() {
  let out =
    "<h2>Conduite de séance</h2>" +
    para(v.phase) +
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
  out += details(
    "Agence de presse",
    v.wires
      .map((w) =>
        section(
          w.title,
          para(w.text) +
            (w.sent
              ? tag("Envoyée")
              : btn("Diffuser aux rédactions", { type: "wire", id: w.id })),
        ),
      )
      .join(""),
  );
  if (role() === "Régie") {
    out += details(
      "Accès et présences · " + v.roster.length,
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
              para(n.draft.text) +
              (n.status === "à relire"
                ? btn("Autoriser la publication", {
                    type: "editorial",
                    id: n.id,
                    accept: true,
                  })
                : "") +
              btn(
                "Demander une correction",
                {
                  type: "editorial",
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
          "Activés",
          "Acceptés inutilisés",
          "Bonus retenu",
        ],
        v.lobby.map((l) => [
          l.name,
          l.capacity,
          l.offered,
          l.capacity - l.offered,
          l.accepted,
          l.activated,
          l.accepted - l.activated,
          l.bonus.toLocaleString("fr-BE"),
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
          table(
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
function render() {
  sessionLabel.textContent = v.code + " · " + v.me.role;
  let tabs = ["Assemblée", "Journal"];
  if (v.me.group) tabs.push("Mon équipe");
  if (role() === "Journaliste") tabs.push("Rédaction");
  if (chair()) tabs.push("Régie");
  if (v.balance) tabs.push("Débriefing");
  if (!tabs.includes(tab)) tab = tabs[0];
  main.innerHTML =
    '<div class="lead">' +
    tag(v.phase) +
    " " +
    tag(v.version) +
    "<h1>" +
    h(v.scenario) +
    "</h1>" +
    (!v.me.room && !v.me.group
      ? ""
      : para(
          [v.team?.name, v.roomNames[v.me.room]].filter(Boolean).join(" · "),
        )) +
    (v.phase === "Préparation"
      ? para(v.context) +
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
      .slice(-1)
      .map((n) => section("Annonce du Parlement", para(n)))
      .join("") +
    "<nav>" +
    tabs
      .map(
        (t) =>
          '<button data-tab="' +
          h(t) +
          '" aria-current="' +
          (t === tab) +
          '">' +
          h(t) +
          "</button>",
      )
      .join("") +
    btn("Quitter", { ui: "exit" }, true) +
    "</nav>" +
    {
      Assemblée: assembly,
      Journal: journal,
      "Mon équipe": team,
      Rédaction: newsroom,
      Régie: admin,
      Débriefing: bilan,
    }[tab]();
}
async function refresh(force = false) {
  if (!auth || (pending && !force)) return;
  let current = auth,
    next = await call("view", current);
  if (current !== auth) return;
  let json = JSON.stringify(next);
  if (
    !force &&
    (document.querySelector("#scenario-editor form") ||
      main.querySelector("form:focus-within, form[data-dirty]") ||
      json === last)
  )
    return;
  let expanded = [...main.querySelectorAll("details[open] > summary")].map(
    (e) => e.textContent,
  );
  last = json;
  v = next;
  render();
  for (let sum of main.querySelectorAll("summary"))
    if (expanded.includes(sum.textContent)) sum.parentNode.open = true;
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
  return (
    location.origin +
    location.pathname +
    "#" +
    new URLSearchParams({ code: v.code, id: a.id, key: a.key })
  );
}
async function run(x) {
  if (pending) return;
  pending = true;
  try {
    if (x.ui === "editor") {
      editor(document.querySelector("#scenario-editor"), v.template, say);
      return;
    }
    if (x.ui === "exit") {
      const wasGoogle = auth?.google;
      auth = null;
      v = null;
      sessionStorage.removeItem("pc.auth");
      tab = "Assemblée";
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
      sessionStorage.setItem("pc.auth", JSON.stringify(auth));
      tab = x.ui === "create" ? "Régie" : "Assemblée";
    } else if (x.ui === "read") {
      await call("action", { ...auth, action: { type: "read", id: x.id } });
      reading = x.id;
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
      say(
        x.type === "vote"
          ? "Votre bulletin a été enregistré."
          : "Action enregistrée.",
      );
      if (x.type === "article") {
        sessionStorage.removeItem(draftKey());
        editing = "";
      }
    }
    await refresh(true);
  } catch (e) {
    say(e.message);
  } finally {
    pending = false;
  }
}
main.addEventListener("click", (e) => {
  let b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.tab) {
    tab = b.dataset.tab;
    render();
  }
  if (b.dataset.room) {
    room = b.dataset.room;
    render();
  }
  if (b.dataset.command) run(JSON.parse(b.dataset.command));
});
main.addEventListener("input", (e) => {
  if (e.target.form?.dataset.action) {
    let f = e.target.form;
    f.dataset.dirty = "1";
    if (JSON.parse(f.dataset.action).type === "article")
      sessionStorage.setItem(
        draftKey(),
        JSON.stringify(Object.fromEntries(new FormData(f))),
      );
  }
});
main.addEventListener("submit", async (e) => {
  e.preventDefault();
  let f = e.target,
    d = new FormData(f),
    x = { ...JSON.parse(f.dataset.action), ...Object.fromEntries(d) };
  try {
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
    if (x.type === "vote") x.choices = d.getAll("choices");
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
if (auth)
  refresh(true).catch((e) => {
    say(e.message);
    login();
  });
else login();
setInterval(
  () =>
    refresh().catch(() => say("Connexion interrompue. Reconnexion en cours.")),
  3500,
);
