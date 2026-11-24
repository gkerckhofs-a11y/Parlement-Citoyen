import { deskFlow, slidePicker } from "./desk-flow.js?v=vote3";

export function deskPreview(deck, roomName, measures, { h, para, banner }) {
  const { current } = deck;
  const shownKind =
    current.kind === "Débat" && current.amendment
      ? "Débat sur l’amendement"
      : current.kind;
  const image = current.image && measures.find((m) => m.id === current.image);
  return (
    '<section class="desk-live" aria-labelledby="desk-live-title">' +
    '<div class="desk-live-heading"><h2 id="desk-live-title">À l’écran en salle</h2><span>' +
    h(roomName) +
    "</span></div>" +
    '<div class="desk-preview">' +
    (image ? banner(image) : "") +
    '<div class="desk-preview-copy"><span class="desk-kind">' +
    h([shownKind, current.measure].filter(Boolean).join(" · ")) +
    (current.part ? " · " + h(current.part) : "") +
    "</span><h3>" +
    h(current.title) +
    "</h3>" +
    (current.body ? para(current.body) : "") +
    (current.rows
      ? "<ul>" +
        current.rows
          .map(
            (row) =>
              "<li><span>" +
              h(row.title) +
              (row.selected ? " · Retenu" : "") +
              "</span>" +
              "<strong>" +
              h(row.score) +
              "</strong></li>",
          )
          .join("") +
        "</ul>"
      : "") +
    (current.turnout !== undefined
      ? para(current.turnout + " votants · " + current.abstain + " abstentions")
      : "") +
    "</div></div>" +
    "</section>"
  );
}

// All commands here operate on the selected commission. The server owns its cursor and ballots.
export function commissionDesk(v, scope, selectedMeasure, ui) {
  const {
    h,
    btn,
    form,
    para,
    details,
    roomMark,
    deskLink,
    name,
    banner,
    proposals,
    polls,
  } = ui;
  const deck = v.presentations[scope];
  const { current, menu } = deck;
  const room = v.rooms[scope];
  const roomName = v.roomNames[scope];
  const measures = v.measures.filter((m) => m.room === scope);
  const measure =
    measures.find((m) => m.id === selectedMeasure) ||
    measures.find((m) => m.id === current.measure) ||
    measures.find((m) => m.id === room.focus) ||
    measures[0];
  const amendments = v.amends.filter((a) => a.room === scope);
  const roomPolls = v.polls.filter(
    (p) => p.room === scope && p.kind !== "plenary",
  );
  const active = roomPolls.find(
    (p) => !["annoncé", "invalidé"].includes(p.status),
  );
  const screen =
    v.roomScreens?.[scope] ||
    v.roomScreen ||
    v.roster?.find((m) => m.id === "ECR-" + scope);
  const isChair = v.me.role !== "Modérateur";
  const live = v.phase === "Commissions";
  const slideAction = (slide) => ({ type: "presentSlide", room: scope, slide });
  function go(label, id, secondary = true) {
    return id && menu.some((s) => s.id === id)
      ? btn(label, slideAction(id), secondary)
      : '<button type="button" disabled>' + h(label) + "</button>";
  }
  function measureControls() {
    if (!measure) return "";
    const items = amendments.filter((a) => a.measure === measure.id);
    const admissible = items.filter((a) => a.status === "admissible");
    const publicItems = items.filter((a) =>
      menu.some((s) => s.id === "amend-" + a.id),
    );
    const shownAmendment =
      current.measure === measure.id &&
      (current.amendment ||
        publicItems.find((a) => current.id.split("~")[0] === "amend-" + a.id)
          ?.id);
    const debateId = shownAmendment
      ? "discuss-" + shownAmendment
      : "debate-" + measure.id;
    const canDebate = menu.some((s) => s.id === debateId);
    let content =
      '<section class="desk-controls"><h2>Propositions et amendements</h2><label>Proposition à préparer' +
      "<select data-desk-measure>" +
      measures
        .map(
          (m) =>
            '<option value="' +
            h(m.id) +
            '"' +
            (m.id === measure.id ? " selected" : "") +
            ">" +
            h(m.id + " · " + m.title) +
            "</option>",
        )
        .join("") +
      '</select></label><div class="actions">' +
      go("Projeter la proposition", "measure-" + measure.id, false) +
      go("Projeter les effets", "effects-" + measure.id) +
      "</div>";
    if (live && canDebate) {
      content += form(
        slideAction(debateId),
        "<label>Durée du débat en minutes" +
          '<input type="number" min="1" max="180" step="1" name="minutes" required></label>',
        "Lancer le minuteur du débat",
      );
    }
    content += "<h3>Amendements</h3>";
    if (publicItems.length)
      content +=
        '<ul class="desk-amendments">' +
        publicItems
          .map(
            (a) =>
              "<li><p>" +
              h(a.text) +
              "</p>" +
              go("Projeter cet amendement", "amend-" + a.id) +
              "</li>",
          )
          .join("") +
        "</ul>";
    else if (
      items.some((a) =>
        ["déposé", "en examen", "à reformuler"].includes(a.status),
      )
    ) {
      content +=
        para(
          "Un texte est en cours d’examen. Il pourra être projeté après son admission par la régie.",
        ) +
        '<a href="#desk-amendments" data-examine-amendments>Examiner les amendements reçus</a>';
    } else
      content += para("Aucun amendement à projeter pour cette proposition.");
    if (live && !active && !room.locked && admissible.length)
      content += btn(
        admissible.length > 2
          ? "Ouvrir la présélection des amendements"
          : "Ouvrir le vote sur les amendements",
        { type: "open", kind: "amend", room: scope, measure: measure.id },
      );
    return content + "</section>";
  }
  function finals() {
    if (room.finalists.length)
      return (
        "<section><h2>Finalistes de la commission</h2>" +
        "<ul>" +
        room.finalists.map((id) => "<li>" + h(name(id)) + "</li>").join("") +
        "</ul></section>"
      );
    if (!live || active) return "";
    const unsettled = amendments.filter((a) =>
      ["admissible", "en examen", "à reformuler", "déposé"].includes(a.status),
    );
    return (
      '<section class="desk-finals"><h2>Sélection des finalistes</h2>' +
      (unsettled.length
        ? para(
            "Traitez les amendements en attente avant d’ouvrir la sélection.",
          )
        : para(
            "L’ouverture du vote fige les textes et les attributions d’influence de cette commission.",
          ) +
          btn(
            "Ouvrir la sélection des finalistes",
            { type: "open", room: scope, kind: "selection" },
            true,
          )) +
      "</section>"
    );
  }
  return (
    '<div class="commission-desk"><div class="desk-topline">' +
    (isChair
      ? '<button type="button" class="desk-back" data-desk-home>Régie générale</button>'
      : '<button type="button" class="desk-back" data-desk-observe>Consulter l’assemblée</button>') +
    "<span>" +
    h(v.phase) +
    '</span></div><div class="desk-title"><div>' +
    roomMark(scope) +
    "<div><span>Régie de commission</span><h1>" +
    h(roomName) +
    "</h1></div></div>" +
    (screen
      ? deskLink({ ...screen, room: scope }, "Ouvrir l’écran de projection")
      : "") +
    "</div>" +
    '<div class="desk-columns"><div>' +
    deskPreview(deck, roomName, v.measures, ui) +
    "</div><div>" +
    deskFlow(v, deck, active, go, ui) +
    details("Choisir un texte ou un vote", measureControls() + finals()) +
    details("Accès à toutes les pages", slidePicker(deck, scope, ui)) +
    "</div></div>" +
    (amendments.length
      ? '<div id="desk-amendments">' +
        details(
          "Examiner les amendements de la commission (" +
            amendments.length +
            ")",
          proposals(scope),
        ) +
        "</div>"
      : "") +
    (roomPolls.length
      ? details(
          "Scrutins de la commission et secours papier",
          polls(scope, true),
        )
      : "") +
    '<div class="desk-footer">' +
    btn("Quitter la session", { ui: "exit" }, true) +
    "</div></div>"
  );
}
