import { dimensions } from "./scenario.mjs";
export function publishedAmendment(amendment) {
  return [
    "admissible",
    "adopté",
    "rejeté",
    "écarté au tour préliminaire",
  ].includes(amendment.status);
}
export function hasPendingAmendments(session, room) {
  return session.amends.some((a) => a.room === room &&
    ["admissible", "en examen", "à reformuler", "déposé"].includes(a.status));
}
const announcedPoll = (poll) => ["annoncé", "égalité"].includes(poll.status);
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
  function ballot(room, p, id, { announced = false, openKind } = {}) {
    const kind = announced ? "Résultat du vote" : "Vote";
    const title = {
      plenary: "Choix de la plénière",
      amend: "Vote sur l’amendement",
      prelim: "Sélection des amendements",
      selection: "Choix des finalistes",
    }[p.kind];
    const archivedVote = !announced && p.id && announcedPoll(p);
    const status = archivedVote ? "clos" : (p.status || "à ouvrir");
    const lines = p.options;
    const caption = archivedVote ? "Ce scrutin est terminé." : {
      ouvert: "Le scrutin est ouvert. Votez sur votre appareil.",
      clos: "Le vote est clos. Le résultat sera annoncé en séance.",
      suspendu: "Le vote est suspendu.",
      incident: "Le scrutin est interrompu.",
      égalité: "Les voix sont partagées. Un départage est nécessaire.",
      annoncé: "Le dépouillement est terminé.",
      "à ouvrir": "Le scrutin sera ouvert par la personne qui anime la séance.",
    }[status];
    // One result per option for large ballots. The two plenary finalists share a slide.
    const options = lines.flatMap((option) => {
      const measure = s.pack.measures.find((m) => m.id === option);
      const amendment = s.amends.find((a) => a.id === option);
      const official =
        measure && ["selection", "plenary"].includes(p.kind)
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
          option,
          measure: measure?.id || amendment?.measure,
          version: amendment?.profile || official?.profile || measure?.id,
          title,
          score,
          selected: announced && !!p.winners?.includes(option),
        }),
      );
    });
    const groups = pagesOfRows(options);
    groups.forEach((rows, i) => {
      const extra = {
        ballot: true,
        ballotKind: p.kind,
        seats: p.seats,
        round: p.round || 0,
        poll: p.id || null,
        status,
        rows,
        ...(p?.base ? { measure: p.base } : {}),
        ...(openKind ? { openKind } : {}),
        ...(announced
          ? { turnout: p.result.voters, abstain: p.result.abstain }
          : {}),
        ...(groups.length > 1 ? { part: i + 1 + " / " + groups.length } : {}),
      };
      add(id + (i ? "-" + i : ""), kind, room, title, caption, extra);
    });
  }
  function recordPoll(p, voteId) {
    ballot(p.room, p, voteId);
    if (announcedPoll(p)) ballot(p.room, p, "result-" + p.id, { announced: true });
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
    const roomBusy = s.polls.some((p) => p.room === room && !["invalidé", "annoncé"].includes(p.status));
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
      if (scope && s.phase === "Commissions" && !r.locked && !roomBusy) {
        const options = s.amends.filter((a) => a.measure === m.id && a.status === "admissible")
          .map((a) => a.id);
        if (options.length) {
          const preliminary = options.length > 2;
          ballot(room, {
            kind: preliminary ? "prelim" : "amend", base: m.id,
            options: preliminary ? options : [m.id, ...options], seats: preliminary ? 2 : 1,
          }, "call-" + m.id, { openKind: "amend" });
        }
      }
    }
    if (scope && s.phase === "Commissions" && !r.finalists.length &&
        !roomBusy && !hasPendingAmendments(s, room))
      ballot(room, { kind: "selection", options: measures.map((m) => m.id), seats: 2 },
        "select-" + room, { openKind: "selection" });
    if (finalists) {
      rowSlides("compare-" + room, "Comparaison", room, "Les deux finalistes",
        measureRows(room, r.finalists), 2);
      const ballots = s.polls.filter((p) =>
        p.room === room && p.kind === "plenary" && p.status !== "invalidé",
      );
      for (const previous of ballots.slice(0, -1))
        recordPoll(previous, "poll-" + previous.id);
      if (ballots.length) recordPoll(ballots.at(-1), "duel-" + room);
      else {
        const canOpen = s.phase === "Plénière" && !r.winner && !s.polls.some((p) =>
          p.kind === "plenary" && !["annoncé", "invalidé"].includes(p.status));
        ballot(room, { kind: "plenary", options: r.finalists, seats: 1 },
          "duel-" + room, { openKind: canOpen ? "plenary" : undefined });
      }
    } else
      for (const p of s.polls.filter((p) =>
        p.room === room && p.status !== "invalidé" && (!scope || p.kind !== "plenary"),
      ))
        recordPoll(p, "poll-" + p.id);
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
// The full menu remains available for manual discussion. This list is the usual order of work.
export function presentationRoute(s, slides, scope = "") {
  const pages = new Map();
  for (const slide of slides) {
    let key = slide.id.split("~")[0];
    if (slide.ballot) {
      if (slide.poll)
        key = (slide.kind === "Résultat du vote" ? "result-" : "poll-") + slide.poll;
      else if (slide.ballotKind === "plenary") key = "duel-" + slide.room;
      else if (slide.ballotKind === "selection") key = "select-" + slide.room;
      else key = "call-" + slide.measure;
    }
    if (!pages.has(key)) pages.set(key, []);
    pages.get(key).push(slide.id);
  }
  const route = [];
  const append = (key) => route.push(...(pages.get(key) || []));
  const appendPoll = (p) => append((announcedPoll(p) ? "result-" : "poll-") + p.id);
  if (!scope && s.phase === "Débriefing") {
    append("balance");
    for (const room of Object.keys(s.rooms)) {
      append("plan-" + room);
      append("plan-clause-" + room);
    }
    append("indicators");
    for (const key of pages.keys()) if (key.startsWith("journal-")) append(key);
    return route;
  }
  if (!scope) {
    append("opening");
    if (s.phase !== "Plénière") return route;
  }
  for (const room of scope ? [scope] : Object.keys(s.rooms)) {
    const state = s.rooms[room];
    const measures = scope
      ? s.pack.measures.filter((m) => m.room === room).map((m) => m.id)
      : state.finalists;
    const polls = s.polls.filter((p) => p.room === room && p.status !== "invalidé");
    for (const id of measures) {
      append("measure-" + id);
      for (const a of s.amends.filter((a) => a.measure === id && (scope || a.id === state.official[id])))
        append("amend-" + a.id);
      if (scope) {
        polls.filter((p) => p.base === id).forEach(appendPoll);
        append("call-" + id);
      }
    }
    if (scope) {
      polls.filter((p) => p.kind === "selection").forEach(appendPoll);
      append("select-" + room);
    } else {
      append("compare-" + room);
      polls.filter((p) => p.kind === "plenary").forEach(appendPoll);
      append("duel-" + room);
    }
  }
  return route;
}
export function currentSlide(s, slides, scope = "") {
  let id = scope ? s.rooms[scope].displaySlide : s.plenarySlide;
  if (!scope && s.phase === "Débriefing" && s.jt >= 0 &&
      !id?.match(/^journal-\d+(?:~\d+)?$/))
    id = "journal-" + s.jt;
  let selected = slides.find((x) => x.id === id);
  // Older sessions projected an announced result under the ID of the ballot page itself.
  const explicitSelection = scope ? s.rooms[scope].explicitBallotPage : s.explicitPlenaryBallotPage;
  if (selected?.kind === "Vote" && selected.poll && explicitSelection !== selected.id) {
    const resultPages = slides.filter((slide) => slide.poll === selected.poll && slide.kind === "Résultat du vote");
    selected = resultPages.find((page) => page.part === selected.part) || selected;
  }
  return (
    selected ||
    (scope && slides.find((x) => x.id === "measure-" + s.rooms[scope].focus)) ||
    (s.phase === "Débriefing" &&
      slides.find((x) => x.id === "balance")) ||
    slides[0]
  );
}
