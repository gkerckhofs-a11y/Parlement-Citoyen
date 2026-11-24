// The controller selects each passage on the server. This screen renders only that passage.
export function commissionScreen(
  slide,
  room,
  { h, mark, image, effect, icon, indicators },
) {
  const current = slide || {
    kind: "Accueil",
    title: "La commission va commencer",
    body: "Le prochain texte apparaîtra ici.",
  };
  const announced =
    current.status === "annoncé" || current.status === "égalité";
  const trends = current.kind === "Effets envisagés";
  const rows = (current.rows || [])
    .map((row, index) => {
      const selected = announced && row.selected;
      const label =
        (trends && indicators[index] ? icon(indicators[index]) : "") +
        h(row.title);
      let value = "";
      if (trends) value = effect(String(row.score ?? ""));
      else if (announced && row.score !== "" && row.score != null)
        value = h(row.score);
      return (
        '<li><span class="commission-option">' +
        label +
        (selected
          ? '<strong class="commission-selected">Retenu</strong>'
          : "") +
        "</span>" +
        (value
          ? '<strong class="commission-value">' + value + "</strong>"
          : "") +
        "</li>"
      );
    })
    .join("");
  let detail = "";
  if (announced && current.turnout != null) {
    const voters = Number(current.turnout),
      abstentions = Number(current.abstain || 0);
    detail =
      voters +
      (voters > 1 ? " votants" : " votant") +
      " · " +
      abstentions +
      (abstentions > 1 ? " abstentions" : " abstention");
  } else if (current.kind === "Débat" && current.until) {
    const end = new Date(current.until);
    if (Number.isFinite(end.getTime())) {
      detail =
        "Fin indicative du débat à " +
        end.toLocaleTimeString("fr-BE", { hour: "2-digit", minute: "2-digit" });
    }
  }
  return (
    '<section class="stage-frame"><article class="stage-card commission-card">' +
    image +
    '<div class="stage-text">' +
    '<div class="commission-caption">' +
    mark +
    "<span>Commission · " +
    h(room) +
    "</span></div>" +
    '<div class="commission-context">' +
    h(
      [
        current.kind === "Débat" && current.amendment
          ? "Débat sur l’amendement"
          : current.kind,
        current.measure,
      ]
        .filter(Boolean)
        .join(" · "),
    ) +
    (current.part ? " · Page " + h(current.part) : "") +
    "</div>" +
    "<h1>" +
    h(current.title) +
    "</h1>" +
    (current.body ? "<p>" + h(current.body) + "</p>" : "") +
    (rows
      ? '<ul class="commission-rows' +
        (trends ? " commission-trends" : "") +
        '">' +
        rows +
        "</ul>"
      : "") +
    (detail ? "<small>" + h(detail) + "</small>" : "") +
    "</div></article></section>"
  );
}
