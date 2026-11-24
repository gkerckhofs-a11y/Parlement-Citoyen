import { deskPreview } from "./commission-desk.js?v=salle2";

export function plenaryDesk(v, preparedRoom, ui) {
  const { h, btn, para, details, deskLink, name, pollLabel, icon } = ui;
  const deck = v.presentations.plenary;
  const { menu, current } = deck;
  const plenary = v.polls.filter((poll) => poll.kind === "plenary");
  const active = plenary.find(
    (p) => !["annoncé", "invalidé"].includes(p.status),
  );
  const rooms = Object.keys(v.rooms);
  const room = rooms.includes(preparedRoom)
    ? preparedRoom
    : current.room || active?.room || rooms[0];
  const finalists = v.rooms[room]?.finalists || [];
  const origin = v.roomNames[room];
  const screen =
    v.plenaryScreen || v.roster?.find((person) => person.id === "ECR-PL");
  const phaseIsLive = v.phase === "Plénière";
  const hasSlide = (id) => menu.some((item) => item.id === id);
  const present = (slide) => ({ type: "presentSlide", room: "", slide });
  function go(label, id, secondary = true) {
    return id && hasSlide(id)
      ? btn(label, present(id), secondary)
      : '<button type="button" disabled>' + h(label) + "</button>";
  }
  function ballotControls(poll) {
    const command = {
      ouvert: ["close", "Clore le vote"],
      clos: ["announce", "Annoncer le résultat"],
      suspendu: ["resume", "Reprendre le scrutin"],
      égalité: poll.round
        ? ["draw", "Effectuer le tirage au sort"]
        : ["tie", "Ouvrir le départage"],
      incident: ["restart", "Relancer le scrutin"],
    }[poll.status];
    return (
      '<section class="desk-ballot"><h2>' +
      h(pollLabel(poll)) +
      "</h2>" +
      para("Duel · " + v.roomNames[poll.room]) +
      (poll.expected === undefined
        ? ""
        : para(poll.received + " / " + poll.expected + " bulletins reçus")) +
      '<div class="actions">' +
      (command
        ? btn(command[1], {
            type: command[0],
            poll: poll.id,
            reasonRequired: ["draw", "restart", "resume"].includes(command[0]),
          })
        : "") +
      (current.poll === poll.id
        ? ""
        : go("Revenir au scrutin", "duel-" + poll.room)) +
      (poll.status === "ouvert"
        ? btn(
            "Suspendre le scrutin",
            { type: "suspend", poll: poll.id, reasonRequired: true },
            true,
          )
        : "") +
      "</div></section>"
    );
  }
  function finalistPanel() {
    if (!rooms.length) return "";
    const selector =
      "<label>Duel à préparer<select data-plenary-room>" +
      rooms
        .map(
          (id) =>
            '<option value="' +
            h(id) +
            '"' +
            (id === room ? " selected" : "") +
            ">" +
            h(v.roomNames[id]) +
            "</option>",
        )
        .join("") +
      "</select></label>";
    let body =
      selector +
      (finalists.length
        ? ""
        : para("Cette commission n’a pas encore annoncé ses deux finalistes."));
    body += finalists
      .map((id) => {
        const clause = menu.find(
          (item) =>
            item.measure === id &&
            item.amendment &&
            item.id.startsWith("amend-"),
        );
        return (
          '<div class="plenary-finalist"><h3>' +
          h(name(id)) +
          '</h3><div class="actions">' +
          go("Présenter la proposition", "measure-" + id) +
          (clause ? go("Projeter la clause adoptée", clause.id) : "") +
          (hasSlide("debate-" + id)
            ? go("Débattre du texte retenu", "debate-" + id)
            : "") +
          "</div></div>"
        );
      })
      .join("");
    if (hasSlide("compare-" + room))
      body +=
        '<div class="actions">' +
        go("Comparer les deux finalistes", "compare-" + room) +
        "</div>";
    if (
      phaseIsLive &&
      !active &&
      finalists.length === 2 &&
      !v.rooms[room].winner
    )
      body += btn("Ouvrir le vote de plénière", {
        type: "open",
        kind: "plenary",
        room,
      });
    if (v.rooms[room].winner) {
      body +=
        para("Texte adopté · " + name(v.rooms[room].winner)) +
        go("Projeter le résultat", "duel-" + room);
      const following = [
        ...rooms.slice(rooms.indexOf(room) + 1),
        ...rooms.slice(0, rooms.indexOf(room)),
      ].find((id) => !v.rooms[id].winner && v.rooms[id].finalists.length === 2);
      if (
        phaseIsLive &&
        !active &&
        following &&
        hasSlide("compare-" + following)
      )
        body +=
          '<button type="button" data-next-duel="' +
          h(following) +
          '">' +
          h("Présenter le duel suivant · " + v.roomNames[following]) +
          "</button>";
    }
    return (
      '<section class="desk-controls"><h2>Conduire la plénière</h2>' +
      body +
      "</section>"
    );
  }
  function nextPhase() {
    if (v.phase === "Commissions") {
      if (rooms.every((id) => v.rooms[id].finalists.length === 2))
        return btn("Ouvrir la plénière", { type: "phase" });
      return para(
        "La plénière pourra s’ouvrir quand chaque commission aura annoncé ses deux finalistes.",
      );
    }
    if (phaseIsLive && rooms.every((id) => v.rooms[id].winner))
      return btn("Ouvrir le débriefing", { type: "phase" });
    if (v.phase === "Préparation")
      return para(
        "La présidence pourra ouvrir la plénière après les travaux des commissions.",
      );
    return "";
  }
  const jump =
    '<label>Page à projeter<select data-stage-slide data-scope="">' +
    menu
      .map(
        (item, i) =>
          '<option value="' +
          h(item.id) +
          '"' +
          (item.id === current.id ? " selected" : "") +
          ">" +
          h(
            [
              String(i + 1) + ". " + item.kind,
              v.roomNames[item.room],
              item.title,
              item.part,
            ]
              .filter(Boolean)
              .join(" · "),
          ) +
          "</option>",
      )
      .join("") +
    "</select></label>";
  let closing = "";
  if (v.phase === "Débriefing")
    closing =
      '<section class="desk-controls"><h2>Plan adopté et journal de 2040</h2><div class="actions">' +
      go("Projeter le plan adopté", "balance") +
      go("Présenter les indicateurs", "indicators") +
      (hasSlide("journal-0")
        ? go("Lancer le journal de 2040", "journal-0", false)
        : "") +
      "</div></section>";
  return (
    '<div class="commission-desk plenary-desk"><div class="desk-topline">' +
    '<button type="button" class="desk-back" data-desk-home>Régie générale</button><span>' +
    h(v.phase) +
    "</span></div>" +
    '<div class="desk-title"><div><span class="room-mark">' +
    icon("landmark") +
    "</span><div><span>Pupitre de la présidence</span><h1>Plénière</h1></div></div>" +
    (screen ? deskLink(screen, "Ouvrir l’écran de projection") : "") +
    '</div><div class="desk-columns"><div>' +
    deskPreview(deck, "Plénière", v.measures, go, ui) +
    details("Ordre de projection", jump) +
    "</div><div>" +
    (active ? ballotControls(active) : "") +
    finalistPanel() +
    closing +
    nextPhase() +
    "</div></div></div>"
  );
}
