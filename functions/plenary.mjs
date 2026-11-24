import { dimensions } from "./scenario.mjs";
export function publishedAmendment(amendment) {
  return [
    "admissible",
    "adopté",
    "rejeté",
    "écarté au tour préliminaire",
  ].includes(amendment.status);
}
// Split long contributions at word boundaries so a projector never needs scrolling.
function passages(text, limit = 300) {
  const chunks = [];
  let line = "";
  for (const word of String(text || "").match(/\S+/gu) || []) {
    if (line && line.length + word.length + 1 > limit) {
      chunks.push(line);
      line = "";
    }
    let rest = word;
    while (rest.length > limit) {
      chunks.push(rest.slice(0, limit));
      rest = rest.slice(limit);
    }
    line = line ? line + " " + rest : rest;
  }
  if (line || !chunks.length) chunks.push(line);
  return chunks;
}
export function plenarySlides(s, scope = "", journal = []) {
  const slides = [];
  function add(id, kind, room, title, text, extra = {}) {
    // Ordinary titles stay intact. Unusually long titles continue as headings on later pages.
    const headings = title.length <= 140 ? [title] : passages(title, 140);
    const bodies = passages(text);
    const pageCount = Math.max(headings.length, bodies.length);
    for (let i = 0; i < pageCount; i++)
      slides.push({
        id: id + (i ? "~" + i : ""),
        kind,
        room,
        title: headings[Math.min(i, headings.length - 1)],
        body: bodies[i] || "",
        ...(pageCount > 1 ? { part: i + 1 + " / " + pageCount } : {}),
        ...extra,
      });
  }
  // Paginate the options themselves so long custom titles and every result stay readable.
  function pagesOfRows(rows, maxRows = 2, maxLength = 245) {
    const groups = [];
    let group = [], length = 0;
    for (const row of rows) {
      if (group.length && (group.length >= maxRows || length + row.title.length > maxLength)) {
        groups.push(group);
        group = [];
        length = 0;
      }
      group.push(row);
      length += row.title.length;
    }
    if (group.length) groups.push(group);
    return groups.length ? groups : [[]];
  }
  function measureRows(room, ids) {
    return ids.flatMap((id) => {
      const m = s.pack.measures.find((v) => v.id === id);
      const clause = s.amends.find((a) => a.id === s.rooms[room].official[id]);
      const version = m.variants.find((v) => v.id === clause?.profile) || m;
      return passages(m.title, 175).map((title) => ({
        title, measure: id, version: version.id, trends: version.trends,
        status: clause ? "Texte amendé" : "Texte initial",
      }));
    });
  }
  function rowSlides(id, kind, room, title, rows, maxRows) {
    const groups = pagesOfRows(rows, maxRows);
    groups.forEach((list, i) => add(id + (i ? "~" + i : ""), kind, room, title, "", {
      rows: list,
      ...(groups.length > 1 ? { part: (i + 1) + " / " + groups.length } : {}),
    }));
  }
  function ballot(room, p, id) {
    const announced = p && ["annoncé", "égalité"].includes(p.status);
    const kind = announced ? "Résultat du vote" : "Vote";
    const title = {
      plenary: "Choix de la plénière",
      amend: "Vote sur l’amendement",
      prelim: "Sélection des amendements",
      selection: "Choix des finalistes",
    }[p?.kind || "plenary"];
    const status = p?.status || "à ouvrir";
    const lines = p?.options || s.rooms[room].finalists;
    const caption = {
      ouvert: "Le scrutin est ouvert. Votez sur votre appareil.",
      clos: "Le vote est clos. Le résultat sera annoncé en séance.",
      suspendu: "Le vote est suspendu.",
      incident: "Le scrutin est interrompu.",
      égalité: "Les voix sont partagées. Un départage est nécessaire.",
      annoncé: "Le dépouillement est terminé.",
      "à ouvrir": "La présidence va ouvrir le scrutin.",
    }[status];
    // One result per option for large ballots. The two plenary finalists share a slide.
    const options = lines.flatMap((option) => {
      const measure = s.pack.measures.find((m) => m.id === option);
      const amendment = s.amends.find((a) => a.id === option);
      const official =
        measure && (!p || ["selection", "plenary"].includes(p.kind))
          ? s.amends.find((a) => a.id === s.rooms[room].official[measure.id])
          : null;
      const row = announced && p.result?.rows.find((r) => r.id === option);
      const score = row
        ? (row.weight / p.result.denominator).toLocaleString("fr-BE", {
            maximumFractionDigits: 3,
          })
        : "";
      return passages(measure?.title || amendment?.text || option, 200).map(
        (title) => ({
          measure: measure?.id || amendment?.measure,
          version: amendment?.profile || official?.profile || measure?.id,
          title,
          score,
          selected: !!p?.winners?.includes(option),
        }),
      );
    });
    const groups = pagesOfRows(options);
    groups.forEach((rows, i) => {
      const extra = {
        ballot: true,
        poll: p?.id || null,
        status,
        rows,
        ...(p?.base ? { measure: p.base } : {}),
        ...(!p && s.phase === "Plénière" && !s.polls.some((poll) =>
          poll.kind === "plenary" && !["annoncé", "invalidé"].includes(poll.status),
        ) ? { openKind: "plenary" } : {}),
        ...(announced
          ? { turnout: p.result.voters, abstain: p.result.abstain }
          : {}),
        ...(groups.length > 1 ? { part: i + 1 + " / " + groups.length } : {}),
      };
      add(id + (i ? "-" + i : ""), kind, room, title, caption, extra);
    });
  }
  if (!scope)
    add(
      "opening",
      "Séance plénière",
      "",
      "Parlement citoyen",
      s.phase === "Débriefing"
        ? "Le Parlement a arrêté son plan national."
        : s.phase === "Plénière"
          ? "Les commissions présentent leurs propositions finalistes."
          : "Les commissions préparent leurs propositions.",
    );
  for (const [room, r] of Object.entries(s.rooms)) {
    if (scope && scope !== room) continue;
    const finalists =
      !scope && (s.phase === "Plénière" || s.phase === "Débriefing");
    const measures = s.pack.measures.filter(
      (m) => m.room === room && (!finalists || r.finalists.includes(m.id)),
    );
    for (const m of measures) {
      add("measure-" + m.id, "Proposition", room, m.title, m.text, {
        image: m.id,
        measure: m.id,
      });
      const adopted = s.amends.find((a) => a.id === r.official[m.id]);
      const profile = m.variants.find((t) => t.id === adopted?.profile) || m;
      const until = scope ? (r.focus === m.id && r.until)
        : (s.plenaryTimer?.measure === m.id && s.plenaryTimer.until);
      const timer = until ? { until } : {};
      for (const a of s.amends.filter(
        (a) => a.measure === m.id && publishedAmendment(a) && (!finalists || a.id === adopted?.id),
      )) {
        const subject = { measure: m.id, amendment: a.id, version: a.profile };
        add(
          "amend-" + a.id,
          "Amendement · " + a.status,
          room,
          m.title,
          a.text,
          subject,
        );
        if (scope || finalists)
          add("discuss-" + a.id, "Débat", room, m.title, a.text, {
            ...subject,
            ...timer,
          });
      }
      add("effects-" + m.id, "Effets envisagés", room, m.title, "", {
        measure: m.id,
        rows: dimensions.map((title, i) => ({
          title,
          score: profile.trends[i],
        })),
      });
      if (scope || finalists)
        add("debate-" + m.id, "Débat", room, m.title, adopted?.text || m.text, {
          measure: m.id,
          version: profile.id,
          ...timer,
        });
      if (
        scope &&
        s.phase === "Commissions" &&
        !r.locked &&
        s.amends.some((a) => a.measure === m.id && a.status === "admissible") &&
        !s.polls.some(
          (p) => p.room === room && !["invalidé", "annoncé"].includes(p.status),
        )
      )
        add("call-" + m.id, "Vote", room, "Vote des amendements", m.title, {
          openKind: "amend",
          measure: m.id,
        });
    }
    if (
      scope &&
      s.phase === "Commissions" &&
      !r.finalists.length &&
      !s.polls.some(
        (p) => p.room === room && !["invalidé", "annoncé"].includes(p.status),
      )
    )
      add(
        "select-" + room,
        "Vote",
        room,
        "Sélection des finalistes",
        "Chaque citoyen peut soutenir deux propositions.",
        { openKind: "selection" },
      );
    if (finalists) {
      rowSlides("compare-" + room, "Comparaison", room, "Les deux finalistes",
        measureRows(room, r.finalists), 2);
      const ballots = s.polls.filter((p) =>
        p.room === room && p.kind === "plenary" && p.status !== "invalidé",
      );
      for (const previous of ballots.slice(0, -1))
        ballot(room, previous, "poll-" + previous.id);
      ballot(room, ballots.at(-1), "duel-" + room);
    } else
      for (const p of s.polls.filter(
        (p) =>
          p.room === room &&
          p.status !== "invalidé" &&
          (!scope || p.kind !== "plenary"),
      ))
        ballot(room, p, "poll-" + p.id);
  }
  if (!scope && s.phase === "Débriefing") {
    const rows = Object.entries(s.rooms).flatMap(([room, r]) =>
      r.winner ? measureRows(room, [r.winner]) : [],
    );
    rowSlides("balance", "Bilan de la plénière", "", "Les décisions adoptées", rows, 4);
    for (const [room, r] of Object.entries(s.rooms)) {
      const m = s.pack.measures.find((m) => m.id === r.winner);
      if (!m) continue;
      add("plan-" + room, "Plan national adopté", room, m.title, m.text, {
        image: m.id, measure: m.id, version: m.id,
      });
      const clause = s.amends.find((a) => a.id === r.official[m.id]);
      if (clause)
        add(
          "plan-clause-" + room,
          "Clause adoptée",
          room,
          m.title,
          clause.text,
          { measure: m.id, amendment: clause.id, version: clause.profile },
        );
    }
    const adopted = Object.entries(s.rooms).map(([room, r]) => {
      const m = s.pack.measures.find((m) => m.id === r.winner);
      const a = s.amends.find((a) => a.id === r.official[m?.id]);
      return m?.variants.find((t) => t.id === a?.profile) || m;
    });
    add(
      "indicators",
      "Plan national adopté",
      "",
      "Effets du plan national",
      "",
      {
        rows: dimensions.map((title, i) => ({
          title,
          score: adopted.reduce((n, m) => n + (m?.scores[i] || 0) / 2, 0),
        })),
      },
    );
    journal.forEach((text, index) => add(
      "journal-" + index, "Journal 2040", "", "Le journal du futur",
      text, { journalIndex: index },
    ));
  }
  return slides;
}
export function currentSlide(s, slides, scope = "") {
  let id = scope ? s.rooms[scope].displaySlide : s.plenarySlide;
  if (!scope && s.phase === "Débriefing" && s.jt >= 0 &&
      !id?.match(/^journal-\d+(?:~\d+)?$/))
    id = "journal-" + s.jt;
  return (
    slides.find((x) => x.id === id) ||
    (scope && slides.find((x) => x.id === "measure-" + s.rooms[scope].focus)) ||
    (s.phase === "Débriefing" &&
      slides.find((x) => x.id === "balance")) ||
    slides[0]
  );
}
