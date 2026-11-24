// Navigation follows the current session. Moving between pages and opening a ballot
// are separate commands, so projecting a text always leaves voting under staff control.
function stepLabel(item, roomNames) {
  if (item.part && !item.part.startsWith("1 /"))
    return "Afficher la page " + item.part;
  if (item.id.startsWith("measure-"))
    return "Présenter " + item.measure + " · " + item.title;
  if (item.id.startsWith("amend-"))
    return "Présenter l’amendement à " + item.measure;
  if (item.id.startsWith("compare-"))
    return "Comparer les deux finalistes · " + roomNames[item.room];
  if (
    item.kind === "Résultat du vote" ||
    item.status === "annoncé" ||
    item.status === "égalité"
  )
    return "Afficher le résultat · " + item.title;
  if (item.id.startsWith("journal-"))
    return (
      "Projeter la séquence " + (Number(item.journalIndex) + 1) + " du journal"
    );
  return "Afficher " + item.title;
}

function openVote(step, view, btn) {
  const kind = step.openKind;
  const args = { type: "open", kind, room: step.room };
  let label;
  if (kind === "amend") {
    args.measure = step.measure;
    const amendments = view.amends.filter(
      (a) => a.measure === step.measure && a.status === "admissible",
    );
    label =
      amendments.length > 2
        ? "Ouvrir la présélection des amendements"
        : "Ouvrir le vote sur les amendements";
  } else if (kind === "selection")
    label = "Ouvrir le vote sur les deux finalistes";
  else if (kind === "plenary")
    label = "Ouvrir le vote de plénière · " + view.roomNames[step.room];
  else return "";
  return btn(label, args);
}

const commands = {
  ouvert: ["close", "Clore le vote"],
  clos: ["announce", "Annoncer et projeter le résultat"],
  suspendu: ["resume", "Reprendre le vote"],
  incident: ["restart", "Relancer le vote"],
};

export function deskFlow(view, deck, active, go, { btn, para }) {
  const { current, menu } = deck;
  const entries = new Map(menu.map((item) => [item.id, item]));
  const route = (deck.route || menu.map((item) => item.id))
    .map((id) => entries.get(id))
    .filter(Boolean);
  let index = route.findIndex((item) => item.id === current.id);
  if (index === -1) {
    // Optional debate/effects pages resume from their corresponding proposal or clause.
    const anchor = current.amendment
      ? "amend-" + current.amendment
      : "measure-" + current.measure;
    index = route.findIndex((item) => item.id === anchor);
  }
  const isPlenary = view.presentations.plenary === deck;
  const producingPhase = view.phase === "Plénière" && isPlenary;
  const nextPage = route[index + 1];
  const resultHasMorePages =
    current.kind === "Résultat du vote" &&
    nextPage?.poll &&
    nextPage.poll === current.poll;
  const next = resultHasMorePages
    ? route.slice(index + 1).find((step) => step.poll !== current.poll)
    : nextPage;
  const previous = route[index - 1];
  let primary = "",
    note = "",
    secondary = "";
  const onPoll = active && current.poll === active.id;
  if (active) {
    if (!onPoll) {
      const first =
        route.find((item) => item.poll === active.id) ||
        menu.find((item) => item.poll === active.id);
      if (first) primary = go("Revenir au vote en cours", first.id, false);
    } else {
      const cmd =
        active.status === "égalité"
          ? active.round
            ? ["draw", "Départager par tirage au sort"]
            : ["tie", "Ouvrir le vote de départage"]
          : commands[active.status];
      if (cmd)
        primary = btn(cmd[1], {
          type: cmd[0],
          poll: active.id,
          ...(["draw", "restart", "resume"].includes(cmd[0])
            ? { reasonRequired: true }
            : {}),
        });
      if (active.status === "ouvert") {
        note = active.received + " / " + active.expected + " bulletins reçus.";
        secondary += btn(
          "Suspendre le vote",
          { type: "suspend", poll: active.id, reasonRequired: true },
          true,
        );
      }
      if (active.status === "clos")
        note =
          "La salle voit que le vote est clos. Les chiffres apparaîtront à l’annonce.";
      if (active.status === "égalité")
        note = "La salle voit l’égalité annoncée.";
      if (next?.poll === active.id)
        secondary += go("Afficher la page suivante du scrutin", next.id);
    }
  } else if (current.openKind || next?.openKind) {
    const step = current.openKind ? current : next;
    primary = openVote(step, view, btn);
    if (step.openKind === "selection")
      note =
        "La commission va choisir les deux textes qui iront en plénière. L’ouverture fige les textes et les attributions d’influence.";
  } else if (isPlenary && ["Préparation", "Commissions"].includes(view.phase)) {
    if (
      view.phase === "Commissions" &&
      Object.values(view.rooms).every((room) => room.finalists.length === 2)
    )
      primary = btn("Ouvrir la plénière", { type: "phase" });
    else
      note =
        "La plénière pourra s’ouvrir quand chaque commission aura annoncé ses deux finalistes.";
  } else if (next) {
    primary = go(stepLabel(next, view.roomNames), next.id, false);
  } else if (producingPhase) {
    const remaining = Object.keys(view.rooms).find(
      (room) => !view.rooms[room].winner,
    );
    if (remaining) {
      const first = route.find((item) => item.room === remaining);
      if (first)
        primary = go(
          "Présenter le duel · " + view.roomNames[remaining],
          first.id,
          false,
        );
    } else primary = btn("Ouvrir le débriefing", { type: "phase" });
  } else if (
    view.phase === "Commissions" &&
    current.room &&
    !view.rooms[current.room]?.finalists.length
  ) {
    note =
      "Traitez les amendements en attente pour ouvrir le vote sur les deux finalistes.";
  } else if (!isPlenary && view.rooms[current.room]?.finalists.length) {
    note = "Les finalistes de cette commission sont annoncés.";
  }
  if (!note && !active && current.id === "opening" && producingPhase)
    note =
      "Pour chaque commission, présentez les deux finalistes. Après le débat, la plénière en retient un par vote.";
  if (
    !note &&
    !active &&
    (current.id.startsWith("measure-") || current.id.startsWith("amend-"))
  )
    note = "Laissez ce texte à l’écran pendant le débat.";
  if (!active && !isPlenary && view.phase === "Commissions" && current.room) {
    const pending = view.amends.filter(
      (a) =>
        a.room === current.room &&
        ["déposé", "en examen", "à reformuler"].includes(a.status),
    );
    const here = pending.some((a) => a.measure === current.measure);
    const review =
      '<a href="#desk-amendments" data-examine-amendments>Examiner les amendements en attente</a>';
    if (here && primary) {
      note =
        "Un amendement à cette proposition attend encore son admission au vote.";
      secondary = review + secondary;
    } else if (!primary && pending.length) {
      primary = review;
    } else if (!primary) {
      const missed = route.find((item) => item.openKind === "amend");
      if (missed) {
        const clause = route.find(
          (item) => item.measure === missed.measure && item.amendment,
        );
        primary = clause
          ? go("Revenir à l’amendement de " + missed.measure, clause.id, false)
          : openVote(missed, view, btn);
      }
    }
  }
  if (resultHasMorePages)
    secondary =
      go("Détail des scores · page " + nextPage.part, nextPage.id) + secondary;
  if (previous && (!active || (onPoll && previous.poll === active.id)))
    secondary = go("Page précédente", previous.id) + secondary;
  return (
    '<section class="desk-flow" aria-label="Conduire la séance"><h2>Conduire la séance</h2>' +
    (note ? para(note) : "") +
    '<div class="desk-main-action">' +
    primary +
    "</div>" +
    (secondary
      ? '<div class="desk-secondary-actions">' + secondary + "</div>"
      : "") +
    (!primary && !note
      ? para(
          view.phase === "Préparation"
            ? "Le Parlement est en préparation."
            : "Le déroulé est terminé.",
        )
      : "") +
    "</section>"
  );
}

export function slidePicker(deck, scope, { h }) {
  return (
    '<label>Page à projeter<select data-stage-slide data-scope="' +
    h(scope) +
    '">' +
    deck.menu
      .map(
        (item) =>
          '<option value="' +
          h(item.id) +
          '"' +
          (item.id === deck.current.id ? " selected" : "") +
          ">" +
          h(
            [item.kind, item.measure, item.title, item.part]
              .filter(Boolean)
              .join(" · "),
          ) +
          "</option>",
      )
      .join("") +
    "</select></label>"
  );
}
