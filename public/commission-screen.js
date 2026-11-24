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

function detailText(slide) {
  if (isAnnounced(slide) && slide.turnout != null) {
    const voters = Number(slide.turnout),
      abstain = Number(slide.abstain || 0);
    return (
      number(voters) +
      (voters > 1 ? " votants" : " votant") +
      " · " +
      number(abstain) +
      (abstain > 1 ? " abstentions" : " abstention")
    );
  }
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
  const announced = isAnnounced(slide);
  const poll = view.polls?.find((p) => p.id === slide.poll);
  const scoreUnit =
    poll?.kind === "selection" ? "soutiens" : poll ? "voix" : "";
  const code = slide.version || slide.measure || slide.image;
  const identity = [kind, code, slide.part && "Page " + slide.part]
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
  const showEffects = showPhoto && !journal && Array.isArray(profile?.trends);
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
            ? "Résultats annoncés"
            : compare
              ? "Propositions finalistes"
              : rows.length
                ? "Options du scrutin"
                : "";
  const panelRows = rows
    .map((row, i) => {
      const selected = announced && row.selected;
      const rowCode = [row.version || row.measure, row.status]
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
            ? h(row.score)
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
        (selected ? "<em>Retenu</em>" : "") +
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
  const detail = detailText(slide);
  const headline = slide.headline;
  const photo = slide.pressImage || (showPhoto ? banner(measure) : "");
  // A first slide or a newscast with no photograph uses the Parliament's local illustration.
  const art =
    photo ||
    (!panelRows
      ? '<img class="measure-banner scene-emblem" src="/design/hemicycle.svg" alt="">'
      : "");
  const stamp = isAnnounced(slide)
    ? slide.status === "égalité"
      ? "Départage requis"
      : "Résultat annoncé"
    : {
        ouvert: "Vote ouvert",
        clos: "Vote clos",
        dépouillement: "Vote clos",
        suspendu: "Vote suspendu",
        incident: "Scrutin interrompu",
      }[slide.status];
  const secondary =
    '<aside class="scene-side' +
    (art && !panelRows ? " scene-art-only" : "") +
    '">' +
    (art ? '<div class="scene-picture">' + art + "</div>" : "") +
    (panelRows
      ? '<div class="scene-statistics" data-fit-panel>' +
        "<h2>" +
        h(panelTitle) +
        (announced && scoreUnit
          ? " <small>· " + h(scoreUnit) + "</small>"
          : "") +
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
    view.phase && view.phase !== place && view.phase !== kind ? view.phase : "";
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
    h(slide.title) +
    "</h1>" +
    (slide.body ? '<p class="scene-body">' + h(slide.body) + "</p>" : "") +
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
    (stamp || detail
      ? '<div class="scene-decision">' +
        (stamp ? "<strong>" + h(stamp) + "</strong>" : "") +
        (detail ? "<small>" + h(detail) + "</small>" : "") +
        "</div>"
      : "") +
    "</section>" +
    secondary +
    "</div></article></div>"
  );
}
