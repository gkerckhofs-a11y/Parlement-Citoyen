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
    return content + "</section>";
  }

  // deskFlow may already offer the same ballot as the next step in the projected sequence.
  const flowCommands = new Set();
  const commandKey = (cmd) => [cmd.type, cmd.kind, cmd.room, cmd.measure, cmd.poll].join("|");
  let flowHasVoteCommand = false;
  const flow = v.me.present === false ? "" : deskFlow(v, deck, active, go, {
    ...ui,
    btn(label, cmd, secondary) {
      flowCommands.add(commandKey(cmd));
      if (["open", "close", "announce", "draw", "tie", "resume", "restart"].includes(cmd.type)) flowHasVoteCommand = true;
      return btn(cmd.type === "open" && cmd.kind === "selection" ? "Ouvrir la sélection des finalistes" : label,
        cmd, secondary);
    },
  });
  function voteCommand(label, cmd) {
    return flowCommands.has(commandKey(cmd)) ? "" : btn(label, cmd);
  }
  function votePanel() {
    const wrap = (content) => '<section class="desk-ballot" aria-labelledby="desk-votes-title"><h2 id="desk-votes-title" tabindex="-1">Votes de la commission</h2>' + content + "</section>";
    if (room.finalists.length) {
      const list = room.finalists.map((id) => "<li><strong>" + h(id) + "</strong> · " +
        h(name(id)) + (room.winner === id ? " · Adoptée en plénière" : "") + "</li>").join("");
      return wrap("<h3>Finalistes de la commission</h3><ul>" + list + "</ul>");
    }
    if (!live) return wrap(para(v.phase === "Préparation"
      ? "Les scrutins de commission seront disponibles quand la régie ouvrira le Parlement."
      : "La période de vote des commissions est terminée."));
    if (v.me.present === false) return wrap(para("Votre présence est marquée « absente ». Les commandes de vote sont indisponibles."));
    if (active) {
      const subject = { amend:"Vote sur les amendements", prelim:"Présélection des amendements",
        selection:"Sélection des finalistes" }[active.kind] || "Scrutin";
      const status = { ouvert:"Vote ouvert", clos:"Vote clos, résultat à annoncer", suspendu:"Scrutin suspendu",
        incident:"Scrutin interrompu", égalité:"Égalité annoncée" }[active.status] || active.status;
      const action = active.status === "ouvert" ? ["Clore le vote", "close"] :
        active.status === "clos" ? ["Annoncer et projeter le résultat", "announce"] : null;
      let content = para([subject, active.base, active.round && "Départage", status].filter(Boolean).join(" · "));
      // The flow already reports turnout when the currently projected page is this ballot.
      if (active.status === "ouvert" && current.poll !== active.id && active.expected !== undefined)
        content += para(active.received + " / " + active.expected + " bulletins reçus.");
      if (action) content += voteCommand(action[0], { type:action[1], poll:active.id });
      return wrap(content);
    }
    // The server publishes the available actions. A paginated ballot contributes only one opener.
    const openers = new Map();
    for (const step of menu) {
      if (step.room === scope && ["amend", "selection"].includes(step.openKind)) {
        const key = step.openKind + "/" + (step.measure || "");
        if (!openers.has(key)) openers.set(key, step);
      }
    }
    let content = para("Aucun scrutin ouvert.");
    for (const step of openers.values()) {
      if (step.openKind === "selection") {
        content += para("L’ouverture de la sélection fige les textes et les points d’influence de cette commission.") +
          voteCommand("Ouvrir la sélection des finalistes", {type:"open",room:scope,kind:"selection"});
      } else {
        const label = step.ballotKind === "prelim" ? "Ouvrir la présélection des amendements" : "Ouvrir le vote sur les amendements";
        const command = {type:"open",kind:"amend",room:scope,measure:step.measure};
        content += para("Amendements prêts au vote · " + step.measure + " · " + name(step.measure)) +
          voteCommand(label + " · " + step.measure, command);
      }
    }
    const pending = amendments.filter((item) =>
      ["déposé","en examen","à reformuler"].includes(item.status));
    if (pending.length) {
      const affected = [...new Set(pending.map((item)=>item.measure))];
      content += para("La sélection des finalistes attend le traitement des amendements sur " +
        affected.join(", ") + ".") +
        '<a href="#desk-amendments" data-examine-amendments>Examiner les amendements en attente</a>';
    } else if ([...openers.values()].some((step)=>step.openKind==="amend")) {
      content += para("La sélection des finalistes suivra le vote sur les amendements admissibles.");
    } else if (!openers.size) {
      content += para("La sélection des finalistes est en attente.");
    }
    return wrap(content);
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
    '<div class="actions"><a class="desk-link" href="#' + (flowHasVoteCommand ? "desk-vote-command" : "desk-votes-title") +
      '">Votes de la commission</a>' +
    (screen
      ? deskLink({ ...screen, room: scope }, "Ouvrir l’écran de projection")
      : "") + "</div>" +
    "</div>" +
    '<div class="desk-columns"><div>' +
    deskPreview(deck, roomName, v.measures, ui) +
    "</div><div>" +
    (flowHasVoteCommand ? '<div id="desk-vote-command" tabindex="-1">' + flow + "</div>" : flow) +
    votePanel() +
    details("Choisir un texte à projeter", measureControls()) +
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
