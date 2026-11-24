// Suppress a whole distribution when a small cell or its complement could
// identify a participant. Do not export subgroup intersections or identifiers.
export function reportRows(v, name) {
  const rows = [],
    b = v.balance,
    min = v.minGroup;
  const add = (part, label, item, value) =>
    rows.push([part, label, item, value]);
  const small = (count, total) =>
    (count > 0 && count < min) || (total - count >= 0 && total - count < min);
  add("Session", v.code, "Scénario", v.scenario);
  add("Session", v.code, "Version", v.version);
  add("Session", v.code, "Citoyens présents", v.citizens);
  add("Session", v.code, "Seuil des petits groupes", min);
  for (const m of b.chosen) add("Plan", m.id, m.title, m.text);
  b.dimensions.forEach((d, i) => {
    add("Dimensions", d, "Version initiale", b.initial[i]);
    add("Dimensions", d, "Version adoptée", b.final[i]);
  });
  for (const t of b.territories)
    t.goals.forEach((g, i) =>
      add(
        "Territoires",
        t.name,
        (i === 2 ? "Garde-fou · " : "Priorité · ") +
          b.dimensions[g.index] +
          " ≥ " +
          g.threshold,
        g.met ? "Atteint" : "Non atteint",
      ),
    );
  for (const l of v.lobby) {
    l.objectives.forEach((ok, i) =>
      add(
        "Mandats",
        l.name,
        "Objectif " + (i + 1),
        ok ? "Atteint" : "Non atteint",
      ),
    );
    add("Mandats", l.name, "Ligne rouge", l.red);
    add("Influence", l.name, "Réserve", l.capacity);
  }
  for (const p of v.polls.filter((p) => p.result)) {
    let t = p.result,
      total = t.absent + t.voters,
      label = v.roomNames[p.room] + " · " + p.kind + " · " + p.id.slice(0, 8);
    if (
      t.voters < min ||
      small(t.abstain, total) ||
      t.rows.some((z) => small(z.raw, total))
    ) {
      add("Scrutins", label, "Détail", "Regroupé pour confidentialité");
      continue;
    }
    add("Scrutins", label, "Électorat", total);
    add("Scrutins", label, "Votants", t.voters);
    add("Scrutins", label, "Sans bulletin", t.absent);
    add("Scrutins", label, "Abstentions", t.abstain);
    for (const z of t.rows) {
      add("Scrutins", label, name(z.id) + " · soutiens", z.raw);
      add("Scrutins", label, name(z.id) + " · bonus", z.bonus);
      add("Scrutins", label, name(z.id) + " · total", z.weight / t.denominator);
    }
    if (t.withoutBonus)
      add(
        "Scrutins",
        label,
        "Sans bonus",
        t.withoutBonus.tied.length
          ? "Départage indéterminé"
          : t.withoutBonus.top.map(name).join(" / "),
      );
  }
  for (const m of v.press) {
    add("Presse", m.name, "Articles", m.articles);
    add("Presse", m.name, "Dépêches traitées", m.dispatches);
    add("Presse", m.name, "Corrections", m.corrections);
    add("Presse", m.name, "Unes", m.unes);
    if (!small(m.readers, v.citizens)) {
      add("Presse", m.name, "Audience", m.audience);
      add("Presse", m.name, "Lecteurs distincts", m.readers);
      add("Presse", m.name, "Portée", m.readers + " / " + v.citizens);
      add(
        "Presse",
        m.name,
        "Ouvertures par article",
        m.articles ? m.audience / m.articles : "Sans objet",
      );
    }
  }
  for (const d of v.coverage)
    add(
      "Agence",
      d.id,
      d.title,
      d.sent
        ? d.delay === null
          ? "Aucun article"
          : d.delay + " min avant la première publication"
        : "Non envoyée",
    );
  return rows;
}
