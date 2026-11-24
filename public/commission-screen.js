// Every participant sees the passage chosen on the control desk. Projection has no navigation of its own.
const isAnnounced = (slide) => ["annoncé", "égalité"].includes(slide.status);
const number = (value) =>
  new Intl.NumberFormat("fr-BE", { maximumFractionDigits: 3 }).format(value);
const signed = (value) => (value > 0 ? "+" : "") + number(value);

function generalScreen(view) {
  if (view.slide)
    return {
      kind: "Journal 2040",
      title: "Le journal de 2040",
      body: view.slide,
    };
  if (view.summary)
    return {
      kind: "Plan national adopté",
      title: "Le plan adopté",
      id: "balance",
      rows: view.summary.chosen.map((entry) => ({
        title: entry.title,
        version: entry.id,
      })),
    };
  const name = (id) =>
    view.measures.find((measure) => measure.id === id)?.title || id;
  return {
    id: "general",
    kind: view.phase || "Assemblée",
    title: "L’actualité du Parlement",
    body:
      view.notices
        ?.filter((notice) => !notice.startsWith("Session de répétition."))
        .at(-1) || "",
    headline: view.news?.filter((article) => article.front).at(-1),
    rows: Object.entries(view.rooms || {}).map(([id, room]) => ({
      label: view.roomNames[id],
      title: room.winner
        ? "Adoptée · " + name(room.winner)
        : room.finalists?.length
          ? "Finalistes · " + room.finalists.map(name).join(" et ")
          : room.focus
            ? "À l’ordre du jour · " + name(room.focus)
            : "En attente",
    })),
  };
}

const ballotTypes = {
  amend: {
    label: "Vote sur le texte",
    question: "Quel texte la commission retient-elle ?",
    open: "Choisissez le texte initial ou un amendement sur votre appareil, ou abstenez-vous.",
  },
  prelim: {
    label: "Tour préliminaire",
    question: "Quels amendements soumettre au vote ?",
  },
  selection: {
    label: "Sélection en commission",
    question: "Quelles propositions envoyer en plénière ?",
  },
  plenary: {
    label: "Vote en plénière",
    question: "Quelle mesure le Parlement adopte-t-il ?",
    open: "Choisissez une des deux finalistes sur votre appareil, ou abstenez-vous.",
  },
};

function countLabel(value, singular, plural = singular + "s") {
  return number(value) + " " + (Number(value) > 1 ? plural : singular);
}

function describeBallot(slide, poll) {
  if (
    !slide.ballot &&
    !slide.ballotKind &&
    slide.kind !== "Vote" &&
    slide.kind !== "Résultat du vote"
  )
    return null;
  const kind =
    poll?.kind ||
    slide.ballotKind ||
    slide.openKind ||
    (slide.id?.startsWith("select-")
      ? "selection"
      : slide.id?.startsWith("call-")
        ? "amend"
        : slide.id?.startsWith("duel-")
          ? "plenary"
          : "");
  const type = ballotTypes[kind];
  const status = slide.status || "à ouvrir";
  const announced =
    slide.kind === "Résultat du vote" &&
    isAnnounced(slide) &&
    (!poll?.status || isAnnounced(poll));
  const data = announced ? poll?.result : null;
  const rows = slide.rows || [];
  const selected = announced ? rows.filter((row) => row.selected) : [];
  const winners = announced ? poll?.winners || [] : [];
  const keptOriginal =
    kind === "amend" &&
    (winners.length
      ? winners[0] === poll.base
      : selected.some(
          (row) =>
            (row.option && row.option === poll?.base) ||
            (row.measure && row.version === row.measure),
        ));
  // A previous round can be archived as announced while its tie-break remains a separate ballot.
  const tied =
    announced &&
    (status === "égalité" ||
      (!winners.length &&
        !selected.length &&
        data?.tied?.length > 0 &&
        kind !== "amend"));
  const weighted =
    kind === "selection" &&
    !(slide.round || poll?.round) &&
    !poll?.paper &&
    (data?.rows || []).some((row) => row.bonus > 0);
  const unit =
    kind === "selection"
      ? weighted
        ? "Soutiens pondérés"
        : "Soutiens"
      : kind === "prelim"
        ? "Soutiens"
        : "Voix";
  const seats =
    slide.seats ??
    poll?.seats ??
    (kind === "selection" || kind === "prelim" ? 2 : 1);
  let title = type?.question || slide.title,
    instruction = "";
  let state =
    {
      ouvert: "Vote ouvert",
      clos: "Vote clos",
      dépouillement: "Vote clos",
      incident: "Scrutin interrompu",
      suspendu: "Vote suspendu",
      "à ouvrir": "Avant le vote",
    }[status] || "Vote";
  if (announced) {
    state = "Résultat";
    if (tied) {
      title = "Égalité à départager";
      instruction =
        slide.round || poll?.round
          ? "La présidence de séance doit départager les options à égalité."
          : "Un nouveau scrutin départage les options à égalité.";
    } else if (kind === "amend") {
      title = keptOriginal ? "Texte initial maintenu" : "Amendement adopté";
      if (keptOriginal)
        instruction =
          data?.expressed === 0
            ? "Aucun suffrage exprimé."
            : "Aucun amendement n’a obtenu plus de la moitié des suffrages exprimés.";
      else
        instruction =
          "La version amendée sera défendue lors de la sélection en commission.";
    } else if (kind === "selection") {
      title = "Les finalistes de la commission";
      instruction = winners.length
        ? winners.join(" et ") +
          (winners.length === 1
            ? " passe en plénière."
            : " passent en plénière.")
        : "Les propositions retenues passent en plénière.";
    } else if (kind === "prelim") {
      title = "Les amendements retenus";
      instruction =
        "La commission peut maintenant les comparer au texte initial.";
    } else if (kind === "plenary") {
      const winningCode = winners[0] || selected[0]?.measure;
      title = winningCode
        ? "La mesure " + winningCode + " est adoptée"
        : "Mesure adoptée";
      instruction = "Elle entre dans le plan voté par le Parlement.";
    } else title = "Résultat du scrutin";
    if (
      !tied &&
      kind !== "amend" &&
      (slide.round || poll?.round) &&
      data?.tied?.length &&
      winners.length
    )
      instruction += " Le départage a eu lieu par tirage au sort.";
  } else if (status === "ouvert") {
    const choice = kind === "prelim" ? "amendement" : "proposition";
    instruction = poll?.paper
      ? "Remettez votre bulletin à la présidence de séance."
      : type?.open ||
        "Sur votre appareil, choisissez jusqu’à " +
          countLabel(seats, choice) +
          " ou abstenez-vous.";
  } else if (status === "clos" || status === "dépouillement") {
    instruction =
      poll && isAnnounced(poll)
        ? "Le résultat de ce scrutin a été annoncé en séance."
        : "Le résultat sera affiché dès son annonce en séance.";
  } else if (status === "suspendu" || status === "incident") {
    instruction = "Attendez les consignes de la présidence de séance.";
  } else {
    instruction = "Attendez l’ouverture du scrutin pour voter.";
  }
  const participation = [];
  if (announced && slide.turnout != null) {
    participation.push(countLabel(slide.turnout, "votant"));
    const expressed =
      data?.expressed ??
      (slide.abstain != null ? slide.turnout - slide.abstain : null);
    if (expressed != null)
      participation.push(
        countLabel(expressed, "suffrage exprimé", "suffrages exprimés"),
      );
    if (slide.abstain != null)
      participation.push(countLabel(slide.abstain, "abstention"));
  }
  return {
    kind,
    announced,
    state,
    tied,
    weighted,
    unit,
    title,
    instruction,
    label: type?.label || slide.title,
    data,
    participation: participation.join(" · "),
  };
}

function outcomeFor(row, ballot, poll) {
  if (!ballot?.announced) return "";
  if (ballot.tied) {
    if (ballot.data?.tied?.includes(row.option)) return "À départager";
    if (ballot.data?.top?.includes(row.option)) return "Place acquise";
    return "";
  }
  if (ballot.kind === "amend") {
    const original = row.option
      ? row.option === poll?.base
      : row.version === row.measure;
    return original
      ? row.selected
        ? "Maintenu"
        : ""
      : row.selected
        ? "Adopté"
        : "Rejeté";
  }
  if (ballot.kind === "prelim")
    return row.selected ? "Soumis au vote" : "Écarté";
  if (ballot.kind === "selection") return row.selected ? "Finaliste" : "";
  return row.selected ? (ballot.kind === "plenary" ? "Adoptée" : "Retenu") : "";
}

function detailText(slide) {
  if (slide.kind === "Débat" && slide.until) {
    const end = new Date(slide.until);
    if (Number.isFinite(end.getTime()))
      return (
        "Fin indicative du débat à " +
        end.toLocaleTimeString("fr-BE", { hour: "2-digit", minute: "2-digit" })
      );
  }
  return "";
}

export function projectionScope(view) {
  if (view.projectionScope) return view.projectionScope;
  if (view.me.room) return "commission";
  if (view.me.id === "ECR-NEWS") return "press";
  if (view.me.id === "ECR-PL") return "plenary";
  return "general";
}

export function parliamentScreen(
  view,
  deck,
  { h, roomMark, banner, effect, icon, indicators },
) {
  const scope = projectionScope(view);
  const press = scope === "press",
    inRoom = scope === "commission",
    plenary = scope === "plenary";
  const slide =
    deck?.current ||
    (inRoom || plenary
      ? {
          kind: "Accueil",
          title: inRoom
            ? "La commission va commencer"
            : "La séance va commencer",
          body: "Le premier texte apparaîtra à l’ouverture de la séance.",
        }
      : generalScreen(view));
  const measure = view.measures.find(
    (m) => m.id === (slide.measure || slide.image),
  );
  const room = view.me.room || slide.room;
  const roomTitle = view.roomNames[room];
  const place = inRoom
    ? "Commission · " + roomTitle
    : plenary
      ? "Séance plénière"
      : press
        ? "Journal du Parlement"
        : "Écran général";
  const subject = slide.amendment ? "Débat sur l’amendement" : "Débat";
  const kind = slide.kind === "Débat" ? subject : slide.kind;
  const general = slide.id === "general",
    journal = slide.kind === "Journal 2040";
  const national = slide.id?.startsWith("indicators");
  const summary = slide.id?.startsWith("balance");
  const compare = slide.id?.startsWith("compare-");
  const trends = slide.kind === "Effets envisagés";
  const poll = view.polls?.find((p) => p.id === slide.poll);
  const ballot = describeBallot(slide, poll);
  const announced = ballot?.announced;
  const code = slide.version || slide.measure || slide.image;
  const identity = [
    ballot?.label || kind,
    code,
    (slide.round || poll?.round) && "Départage",
    ballot?.state,
    slide.part && "Page " + slide.part,
  ]
    .filter(Boolean)
    .join(" · ");
  const label = inRoom ? "Parlement citoyen" : roomTitle || "Parlement citoyen";
  let rows = slide.rows || [];
  const showPhoto = Boolean(measure && !rows.length);
  const selectedProfile = measure?.variants?.find(
    (profile) => profile.id === slide.version,
  );
  const profile =
    selectedProfile ||
    (slide.version === measure?.official?.id ? measure?.official : measure);
  const showEffects =
    showPhoto && !journal && !ballot && Array.isArray(profile?.trends);
  if (showEffects)
    rows = profile.trends.map((score, i) => ({
      title: view.dimensions[i],
      score,
    }));
  const impacts = trends || showEffects;
  const panelTitle = impacts
    ? "Effets envisagés"
    : national
      ? "Indicateurs du plan"
      : general
        ? "Dans les commissions"
        : summary
          ? "Mesures adoptées"
          : announced
            ? ballot.unit
            : compare
              ? "Propositions finalistes"
              : rows.length
                ? "Choix proposés"
                : "";
  const panelRows = rows
    .map((row, i) => {
      const selected = announced && !ballot.tied && row.selected;
      const outcome = outcomeFor(row, ballot, poll);
      const plainScore = row.score != null ? String(row.score) : "";
      const aggregate =
        ballot?.weighted &&
        ballot.data?.rows?.find((count) => count.id === row.option);
      const approx =
        aggregate &&
        ballot.data.denominator > 0 &&
        (aggregate.weight * 1000) % ballot.data.denominator !== 0
          ? "≈ "
          : "";
      const choiceStatus =
        ballot?.kind === "amend"
          ? (
              row.option
                ? row.option === poll?.base
                : row.version === row.measure
            )
            ? "Texte initial"
            : "Amendement"
          : ballot && !ballot.announced
            ? ["Texte initial", "Texte amendé"].includes(row.status)
              ? row.status
              : ""
            : row.status;
      const rowCode = [row.version || row.measure, choiceStatus]
        .filter(Boolean)
        .join(" · ");
      const rowLabel = general
        ? row.label
        : rowCode && rowCode !== row.title
          ? rowCode
          : "";
      const figure = impacts
        ? effect(String(row.score ?? ""))
        : national && Number.isFinite(row.score)
          ? signed(row.score)
          : announced && row.score != null
            ? approx + h(plainScore)
            : "";
      const mark =
        (impacts || national) && indicators[i] ? icon(indicators[i]) : "";
      return (
        '<li class="scene-row' +
        (selected ? " stage-winner" : "") +
        '">' +
        '<span class="scene-option">' +
        (rowLabel ? "<small>" + h(rowLabel) + "</small>" : "") +
        mark +
        h(row.title) +
        (outcome
          ? '<em class="' +
            (selected ? "chosen" : "other") +
            '">' +
            h(outcome) +
            "</em>"
          : "") +
        "</span>" +
        (figure !== "" ? '<b class="scene-value">' + figure + "</b>" : "") +
        "</li>"
      );
    })
    .join("");
  const pictures =
    compare || slide.ballot
      ? [...new Set(rows.map((row) => row.measure).filter(Boolean))]
          .map((id) => view.measures.find((m) => m.id === id))
          .filter(Boolean)
      : [];
  const montage =
    pictures.length === 2
      ? '<div class="scene-montage">' +
        pictures
          .map(
            (m) =>
              "<figure>" +
              banner(m) +
              "<figcaption>" +
              h(m.id) +
              "</figcaption></figure>",
          )
          .join("") +
        "</div>"
      : "";
  const differences =
    compare && rows.length === 2 && rows.every((r) => Array.isArray(r.trends))
      ? '<table class="scene-comparison"><thead><tr><th>Effets envisagés</th>' +
        rows
          .map((row) => "<th>" + h(row.version || row.measure) + "</th>")
          .join("") +
        "</tr></thead><tbody>" +
        view.dimensions
          .map(
            (title, i) =>
              "<tr><th>" +
              h(title) +
              "</th>" +
              rows.map((row) => "<td>" + h(row.trends[i]) + "</td>").join("") +
              "</tr>",
          )
          .join("") +
        "</tbody></table>"
      : "";
  const detail = ballot ? ballot.participation : detailText(slide);
  const headline = slide.headline;
  const photo = slide.pressImage || (showPhoto ? banner(measure) : "");
  // A first slide or a newscast with no photograph uses the Parliament's local illustration.
  const art =
    photo ||
    (!panelRows
      ? '<img class="measure-banner scene-emblem" src="/design/hemicycle.svg" alt="">'
      : "");
  const secondary =
    '<aside class="scene-side' +
    (art && !panelRows ? " scene-art-only" : "") +
    '">' +
    (art ? '<div class="scene-picture">' + art + "</div>" : "") +
    (panelRows
      ? '<div class="scene-statistics" data-fit-panel>' +
        "<h2>" +
        h(panelTitle) +
        "</h2>" +
        '<ul class="scene-rows' +
        (impacts || national ? " scene-indicators" : "") +
        '">' +
        panelRows +
        "</ul>" +
        differences +
        "</div>"
      : "") +
    "</aside>";
  const phase =
    view.phase &&
    view.phase !== place &&
    view.phase !== kind &&
    !(plenary && view.phase === "Plénière") &&
    !(inRoom && view.phase === "Commissions")
      ? view.phase
      : "";
  return (
    '<div class="stage-frame scene-frame' +
    (press ? " press-screen" : "") +
    '"><div class="scene-mast">' +
    '<div class="scene-signet">' +
    (inRoom ? roomMark(view.me.room) : icon("landmark")) +
    "</div>" +
    '<div><span class="scene-brand">' +
    h(label) +
    "</span><strong>" +
    h(place) +
    "</strong></div>" +
    (phase ? '<span class="scene-phase">' + h(phase) + "</span>" : "") +
    "</div>" +
    '<article class="stage-card scene-card' +
    (inRoom ? " commission-card" : "") +
    (art && panelRows ? " scene-photo-stats" : "") +
    '">' +
    '<div class="stage-text scene-content">' +
    '<section class="scene-copy" data-fit-panel><div class="stage-caption scene-kicker">' +
    h(identity) +
    "</div>" +
    "<h1>" +
    h(ballot ? ballot.title : slide.title) +
    "</h1>" +
    (ballot
      ? '<p class="scene-body">' + h(ballot.instruction) + "</p>"
      : slide.body
        ? '<p class="scene-body">' + h(slide.body) + "</p>"
        : "") +
    (slide.sources
      ? '<p class="scene-sources"><small>Sources · ' +
        h(slide.sources) +
        "</small></p>"
      : "") +
    montage +
    (headline
      ? '<div class="scene-headline"><small>À la une · ' +
        h(headline.media) +
        "</small><p>" +
        h(headline.title) +
        "</p></div>"
      : "") +
    (detail
      ? '<div class="scene-decision"><small>' + h(detail) + "</small></div>"
      : "") +
    "</section>" +
    secondary +
    "</div></article></div>"
  );
}
