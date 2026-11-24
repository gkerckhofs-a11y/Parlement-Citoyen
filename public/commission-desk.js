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
    pollLabel,
    name,
    banner,
    proposals,
    polls,
  } = ui;
  const deck = v.presentations[scope];
  const { current, menu, position, total } = deck;
  const shownKind =
    current.kind === "Débat" && current.amendment
      ? "Débat sur l’amendement"
      : current.kind;
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
  const stageMoves = () =>
    '<div class="desk-pager">' +
    go("Précédente", menu[position - 2]?.id) +
    "<span>" +
    position +
    " / " +
    total +
    "</span>" +
    go("Suivante", menu[position]?.id, false) +
    "</div>";
  function liveCard() {
    const image =
      current.image && v.measures.find((m) => m.id === current.image);
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
        ? para(
            current.turnout + " votants · " + current.abstain + " abstentions",
          )
        : "") +
      "</div></div>" +
      stageMoves() +
      "</section>"
    );
  }
  function ballotControls() {
    if (!active) return "";
    const action = {
      ouvert: ["close", "Clore le vote"],
      clos: ["announce", "Annoncer le résultat"],
      suspendu: ["resume", "Reprendre le scrutin"],
      incident: ["restart", "Relancer le scrutin"],
      égalité: active.round
        ? ["draw", "Effectuer le tirage au sort"]
        : ["tie", "Ouvrir le départage"],
    }[active.status];
    const pollTitle = active.base
      ? name(active.base)
      : "Sélection des finalistes";
    return (
      '<section class="desk-ballot"><h2>' +
      h(pollLabel(active)) +
      "</h2><p>" +
      h(pollTitle) +
      "</p>" +
      (active.received === undefined
        ? ""
        : "<p>" +
          active.received +
          " / " +
          active.expected +
          " bulletins reçus</p>") +
      '<div class="actions">' +
      (action
        ? btn(action[1], {
            type: action[0],
            poll: active.id,
            reasonRequired: ["draw", "restart", "resume"].includes(action[0]),
          })
        : "") +
      (current.poll === active.id
        ? ""
        : go("Afficher le scrutin", "poll-" + active.id)) +
      (active.status === "ouvert"
        ? btn(
            "Suspendre",
            { type: "suspend", poll: active.id, reasonRequired: true },
            true,
          )
        : "") +
      "</div></section>"
    );
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
      '<section class="desk-controls"><h2>Conduire la discussion</h2><label>Proposition à préparer' +
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
        "<label>Durée du débat en minutes <small>(facultatif)</small>" +
          '<input type="number" min="1" max="180" step="1" name="minutes" placeholder="Sans minuteur"></label>',
        "Ouvrir le débat",
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
              (live
                ? go("Débattre de cet amendement", "discuss-" + a.id)
                : "") +
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
  const jump =
    '<label>Page à projeter<select data-stage-slide data-scope="' +
    h(scope) +
    '">' +
    menu
      .map(
        (s, i) =>
          '<option value="' +
          h(s.id) +
          '"' +
          (s.id === current.id ? " selected" : "") +
          ">" +
          h(
            i +
              1 +
              ". " +
              s.kind +
              " · " +
              s.title +
              (s.part ? " · " + s.part : ""),
          ) +
          "</option>",
      )
      .join("") +
    "</select></label>";
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
    (screen ? deskLink(screen, "Ouvrir l’écran de projection") : "") +
    "</div>" +
    '<div class="desk-columns"><div>' +
    liveCard() +
    details("Ordre de projection", jump) +
    "</div><div>" +
    ballotControls() +
    measureControls() +
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
    finals() +
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
