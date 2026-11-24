import { deskFlow, slidePicker } from "./desk-flow.js?v=vote3";
import { deskPreview } from "./commission-desk.js?v=vote3";

export function plenaryDesk(v, preparedRoom, ui) {
  const { h, btn, para, details, deskLink, name, icon } = ui;
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
          h(id + " · " + name(id)) +
          '</h3><div class="actions">' +
          go("Présenter la proposition", "measure-" + id) +
          (clause ? go("Projeter la clause adoptée", clause.id) : "") +
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
      const result = menu.find(
        (item) =>
          item.room === room &&
          item.id.startsWith("result-") &&
          plenary.some(
            (poll) =>
              poll.id === item.poll &&
              poll.winners?.includes(v.rooms[room].winner),
          ),
      );
      body +=
        para("Texte adopté · " + name(v.rooms[room].winner)) +
        (result ? go("Reprojeter le résultat", result.id) : "");
    }
    return (
      '<section class="desk-controls"><h2>Conduire la plénière</h2>' +
      body +
      "</section>"
    );
  }
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
    deskPreview(deck, "Plénière", v.measures, ui) +
    "</div><div>" +
    deskFlow(v, deck, active, go, ui) +
    details("Choisir un duel", finalistPanel()) +
    details("Accès à toutes les pages", slidePicker(deck, "", ui)) +
    closing +
    "</div></div></div>"
  );
}
