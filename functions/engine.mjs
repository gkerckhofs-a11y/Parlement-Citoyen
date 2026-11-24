import {
  randomBytes,
  randomInt,
  randomUUID,
  createHmac,
  timingSafeEqual,
} from "node:crypto";
import { plenarySlides, currentSlide, publishedAmendment, hasPendingAmendments, presentationRoute } from "./plenary.mjs";
import { check, validate, dimensions } from "./scenario.mjs";
const now = () => new Date().toISOString();
const str = (v, max = 2400) => {
  check(
    typeof v === "string" && v.trim().length > 0 && v.length <= max,
    "Texte manquant ou trop long",
  );
  return v.trim();
};
export const token = (s, id) =>
  createHmac("sha256", s.secret)
    .update(id + ":" + (s.members[id].epoch || 0))
    .digest("base64url")
    .slice(0, 22);
export function create(pack, n, review = false, custom = {}) {
  validate(pack);
  check(
    Number.isInteger(n) && n >= 12 && n <= 150,
    "Effectif attendu entre 12 et 150",
  );
  let counts =
    n === 50 ? [36, 8, 6] : [Math.round(n * 0.7), Math.round(n * 0.2)];
  counts[2] = n - counts[0] - counts[1];
  if (custom.counts) {
    counts = custom.counts;
    check(
      counts.length === 3 &&
        counts.every((v) => Number.isInteger(v) && v > 0) &&
        counts.reduce((a, b) => a + b) === n,
      "Répartition incohérente",
    );
  }
  let rooms = Object.keys(pack.rooms),
    nt = Math.min(
      pack.territories.length,
      Math.floor(counts[0] / rooms.length),
    );
  check(nt >= 2, "Deux territoires par commission sont nécessaires");
  let s = {
    code: randomBytes(5).toString("hex").toUpperCase(),
    secret: randomBytes(32).toString("hex"),
    pack,
    phase: "Préparation",
    review,
    n,
    capacity: custom.reserve ?? (n >= 125 ? 3 : 2),
    members: {},
    rooms: {},
    polls: [],
    amends: [],
    offers: [],
    messages: [],
    dispatches: [],
    articles: [],
    reports: [],
    events: [],
    notices: [],
    jt: -1,
  };
  s.minGroup = custom.minGroup ?? 5;
  check(
    Number.isInteger(s.minGroup) && s.minGroup >= 3 && s.minGroup <= 30,
    "Seuil de confidentialité invalide",
  );
  check(
    Number.isInteger(s.capacity) && s.capacity >= 0 && s.capacity <= 20,
    "Réserve invalide",
  );
  const add = (id, role, group = "", room = "") =>
    (s.members[id] = { id, role, group, room, present: true });
  add("REG", "Régie");
  add("PRE", "Présidence");
  add("EXP", "Expert");
  add("ENS", "Enseignant");
  add("ECR", "Projection");
  add("ECR-PL", "Projection");
  rooms.forEach((r) => {
    s.rooms[r] = {
      focus: pack.measures.find((m) => m.room === r).id,
      finalists: [],
      winner: null,
      official: {},
      locked: false,
    };
    add("MOD-" + r, "Modérateur", "", r);
    add("ECR-" + r, "Projection", "", r);
  });
  ensureProjectionScreens(s);
  const nl = Math.min(pack.lobbies.length, n === 50 ? 4 : counts[1], counts[1]),
    nm = Math.min(pack.media.length, n === 50 ? 2 : counts[2], counts[2]);
  const offsets = rooms.map(
    (_, j) =>
      j * Math.floor(counts[0] / rooms.length) +
      Math.min(j, counts[0] % rooms.length),
  );
  for (let i = 0; i < counts[0]; i++)
    add(
      "C" + (i + 1),
      "Citoyen",
      "T" + ((Math.floor(i / rooms.length) + offsets[i % rooms.length]) % nt),
      rooms[i % rooms.length],
    );
  for (let i = 0; i < counts[1]; i++)
    add("L" + (i + 1), "Lobby", "L" + (i % nl));
  for (let i = 0; i < counts[2]; i++)
    add("J" + (i + 1), "Journaliste", "J" + (i % nm));
  return s;
}
function plenaryScreenId(s) {
  // A custom commission with code PL already owns ECR-PL.
  return s.members["ECR-PL"]?.room ? "ECR-PLENIERE-PUBLIQUE" : "ECR-PL";
}
function pressScreenId(s) {
  return s.members["ECR-NEWS"]?.room ? "ECR-PRESSE-PUBLIQUE" : "ECR-NEWS";
}
function generalScreenId(s) {
  const legacy = s.members["ECR-GEN"];
  return !s.members.ECR && legacy?.role === "Projection" && !legacy.room ? "ECR-GEN" : "ECR";
}
// Restore missing read-only screens on demand without replacing pre-existing credentials.
export function ensureProjectionScreens(s) {
  for (const id of [generalScreenId(s), pressScreenId(s), plenaryScreenId(s)])
    s.members[id] ??= { id, role: "Projection", group: "", room: "", present: true };
}
export { ensureProjectionScreens as ensurePressScreen };
export function identify(s, id, key) {
  let m = s.members[id];
  check(
    m &&
      typeof key === "string" &&
      key.length === 22 &&
      timingSafeEqual(Buffer.from(token(s, id)), Buffer.from(key, "ascii")),
    "Accès invalide",
  );
  return m;
}
const full = (a) => a.role === "Régie";
const chair = (a) => full(a) || a.role === "Présidence";
const controls = (a, r) =>
  chair(a) || (a.role === "Modérateur" && a.room === r);
function deadline(minutes) {
  if (minutes === "" || minutes == null) return 0;
  const duration = Number(minutes);
  check(
    (typeof minutes === "number" ||
      (typeof minutes === "string" && /^\d+$/.test(minutes))) &&
      Number.isInteger(duration) &&
      duration >= 1 &&
      duration <= 180,
    "Durée attendue entre 1 et 180 minutes.",
  );
  return Date.now() + duration * 60000;
}
const note = (s, a, what, reason = "") =>
  s.events.push({ time: now(), actor: a.id, what, reason });
const measure = (s, id) => {
  let m = s.pack.measures.find((v) => v.id === id);
  check(m, "Mesure inconnue");
  return m;
};
const official = (s, m) => {
  let a = s.amends.find((a) => a.id === s.rooms[m.room].official[m.id]);
  return a
    ? {
        ...m.variants.find((v) => v.id === a.profile),
        text: a.text,
        base: m.id,
      }
    : m;
};
const electorate = (s, p) =>
  Object.values(s.members).filter(
    (a) =>
      a.role === "Citoyen" &&
      a.present &&
      (p.kind === "plenary" || a.room === p.room),
  );
function showRoomSlide(room, id, measureId) {
  if (measureId && room.focus !== measureId) {
    room.focus = measureId;
    room.until = 0;
  }
  room.displaySlide = id;
}
function slidesFor(s, scope) {
  const narrations = !scope && s.phase === "Débriefing" ? journal(s) : [];
  return plenarySlides(s, scope, narrations);
}
function start(s, room, kind, options, seats, extra = {}) {
  let p = {
    id: randomUUID(),
    room,
    kind,
    options,
    seats,
    status: "ouvert",
    opened: now(),
    receipts: {},
    raw: {},
    active: {},
    abstain: 0,
    ...extra,
  };
  p.eligible = electorate(s, p).map((a) => a.id);
  s.polls.push(p);
  if (kind === "plenary") {
    s.plenarySlide = "duel-" + room;
    delete s.plenaryTimer;
  }
  else showRoomSlide(s.rooms[room], "poll-" + p.id, p.base);
  return p;
}
export function tally(p) {
  let n = p.paper?.count ?? Object.keys(p.receipts).length,
    k = Object.values(p.active).reduce((a, b) => a + b, 0);
  // Integer numerators preserve exact ties at the 10% cap.
  let denominator = k ? 10 * k : 1,
    unit = k ? Math.min(5 * k, n) : 0;
  let rows = p.options
    .map((id) => ({
      id,
      raw: p.raw[id] || 0,
      bonus: ((p.active[id] || 0) * unit) / denominator,
      weight: (p.raw[id] || 0) * denominator + (p.active[id] || 0) * unit,
    }))
    .sort((a, b) => b.weight - a.weight);
  let cut = rows[Math.min(p.seats, rows.length) - 1].weight,
    top = rows.filter((x) => x.weight > cut).map((x) => x.id),
    tied = rows.filter((x) => x.weight === cut).map((x) => x.id);
  if (top.length + tied.length === p.seats) {
    top.push(...tied);
    tied = [];
  }
  return {
    rows,
    top,
    tied,
    voters: n,
    absent: p.eligible.length - n,
    abstain: p.abstain,
    expressed: n - p.abstain,
    denominator,
  };
}
function finish(s, p, winners) {
  let r = s.rooms[p.room];
  if (p.kind === "amend") {
    if (winners[0] !== p.base) r.official[p.base] = winners[0];
    for (let a of s.amends.filter((a) => p.options.includes(a.id)))
      a.status = winners.includes(a.id) ? "adopté" : "rejeté";
  } else if (p.kind === "prelim") {
    for (let a of s.amends.filter((a) => p.pool.includes(a.id)))
      a.status = winners.includes(a.id)
        ? "admissible"
        : "écarté au tour préliminaire";
  } else if (p.kind === "plenary") r.winner = winners[0];
  else r.finalists = winners;
  p.winners = winners;
}
export function act(s, a, x) {
  let { type } = x,
    r = s.rooms[x.room],
    m = x.measure ? measure(s, x.measure) : null,
    p = x.poll ? s.polls.find((v) => v.id === x.poll) : null;
  let live = s.phase === "Commissions",
    active = ["Commissions", "Plénière"].includes(s.phase);
  let am = x.amend ? s.amends.find((v) => v.id === x.amend) : null;
  if (type === "assign") {
    check(full(a) && s.phase === "Préparation");
    let member = s.members[x.member];
    check(
      member &&
        member.role === "Citoyen" &&
        Object.hasOwn(s.rooms, x.room) &&
        /^T[0-9]+$/.test(x.group) &&
        s.pack.territories[Number(x.group.slice(1))],
    );
    member.room = x.room;
    member.group = x.group;
    note(s, a, "Affectation " + member.id);
    return;
  }
  if (type === "presence" || type === "rotate") {
    if (type === "presence") check(s.phase !== "Débriefing");
    check(full(a) && s.members[x.member]);
    if (type === "presence") {
      check(!s.polls.some((v) => ["ouvert", "suspendu"].includes(v.status)));
      s.members[x.member].present = !!x.present;
    } else s.members[x.member].epoch = (s.members[x.member].epoch || 0) + 1;
    note(s, a, type, x.member);
    return;
  }
  check(a.present, "Accès signalé absent");
  if (type === "presentSlide") {
    check(x.room ? r && controls(a, x.room) : chair(a));
    const slides = slidesFor(s, x.room);
    const selected = slides.find((slide) => slide.id === x.slide);
    check(selected, "Cette diapositive n’est plus disponible.");
    const setTimer = Object.hasOwn(x, "minutes");
    check(
      !setTimer || selected.kind === "Débat",
      "Le minuteur accompagne une diapositive de débat.",
    );
    const until = setTimer ? deadline(x.minutes) : undefined;
    if (x.room) {
      if (selected.kind === "Vote" && selected.poll) r.explicitBallotPage = selected.id;
      showRoomSlide(r, selected.id, selected.measure);
      if (setTimer) r.until = until;
    } else {
      if (selected.kind === "Vote" && selected.poll) s.explicitPlenaryBallotPage = selected.id;
      if (s.plenaryTimer?.measure !== selected.measure) delete s.plenaryTimer;
      if (setTimer)
        s.plenaryTimer = { measure: selected.measure, until };
      s.plenarySlide = x.slide;
      s.showBalance = false;
      s.jt = -1;
    }
    return;
  }
  if (type === "phase") {
    check(chair(a));
    let next = {
      Préparation: "Commissions",
      Commissions: "Plénière",
      Plénière: "Débriefing",
    }[s.phase];
    check(next);
    if (next === "Commissions")
      for (const room of Object.keys(s.rooms))
        check(
          new Set(
            Object.values(s.members)
              .filter(
                (m) => m.role === "Citoyen" && m.present && m.room === room,
              )
              .map((m) => m.group),
          ).size >= 2,
          "Deux territoires présents requis dans chaque commission",
        );
    if (next === "Plénière")
      check(
        Object.values(s.rooms).every((v) => v.finalists.length === 2),
        "Chaque commission doit annoncer ses finalistes",
      );
    if (next === "Débriefing")
      check(
        Object.values(s.rooms).every((v) => v.winner),
        "Les duels doivent être annoncés",
      );
    s.phase = next;
    delete s.plenarySlide;
    delete s.plenaryTimer;
    note(s, a, next);
    return;
  }
  if (type === "focus") {
    check(r && controls(a, x.room) && m?.room === x.room);
    r.focus = m.id;
    r.displaySlide = "measure-" + m.id;
    r.until = x.minutes
      ? Date.now() + Math.min(180, Math.max(1, Number(x.minutes))) * 60000
      : 0;
    return;
  }
  if (type === "notice") {
    check(chair(a));
    s.notices.push(str(x.text));
    return;
  }
  if (type === "amend") {
    check(
      live &&
        a.role === "Citoyen" &&
        m?.room === a.room &&
        !s.rooms[a.room].locked &&
        !s.polls.some((v) => v.base === m.id && v.status !== "invalidé"),
    );
    s.amends.push({
      id: randomUUID(),
      measure: m.id,
      room: a.room,
      text: str(x.text),
      why: str(x.why),
      source: String(x.source || "").slice(0, 400),
      sign: [a.id],
      status: "déposé",
    });
    return;
  }
  if (["sign", "review", "revise"].includes(type)) {
    check(
      live &&
        am &&
        !s.rooms[am.room].locked &&
        !s.polls.some(
          (v) =>
            v.base === am.measure &&
            v.status !== "invalidé" &&
            !(v.kind === "prelim" && v.status === "annoncé"),
        ),
    );
    if (type === "sign") {
      check(
        a.role === "Citoyen" && a.room === am.room && !am.sign.includes(a.id),
      );
      am.sign.push(a.id);
    }
    if (type === "revise") {
      check(a.id === am.sign[0] && am.status === "à reformuler");
      am.text = str(x.text);
      am.sign = [a.id];
      am.status = "déposé";
    }
    if (type === "review") {
      check(
        ![
          "fusionné",
          "adopté",
          "rejeté",
          "écarté au tour préliminaire",
        ].includes(am.status),
      );
      check(!am.merge, "Fusion en attente");
      check(
        controls(a, am.room) &&
          [
            "en examen",
            "à reformuler",
            "non admissible",
            "admissible",
          ].includes(x.status),
      );
      if (x.status === "admissible") {
        check(
          full(a) &&
            new Set(am.sign.map((id) => s.members[id].group)).size >= 2,
          "Deux territoires et une validation de régie sont requis",
        );
        check(measure(s, am.measure).variants.some((v) => v.id === x.profile));
        am.profile = x.profile;
      }
      am.status = x.status;
      am.reason = str(x.reason);
      note(s, a, am.status, am.reason);
    }
    return;
  }
  if (type === "merge" || type === "mergeConsent") {
    check(
      live &&
        am &&
        !s.rooms[am.room].locked &&
        ["déposé", "en examen", "à reformuler"].includes(am.status),
    );
    if (type === "merge") {
      let other = s.amends.find((v) => v.id === x.other);
      check(
        controls(a, am.room) &&
          other &&
          other !== am &&
          other.measure === am.measure &&
          !other.merge &&
          !am.merge &&
          ["déposé", "en examen", "à reformuler"].includes(other.status),
      );
      let merge = {
        primary: am.id,
        other: other.id,
        text: str(x.text),
        yes: [],
      };
      am.merge = merge;
      other.merge = { ...merge };
      return;
    }
    check(am.merge);
    let { primary, other, text } = am.merge,
      items = [primary, other].map((id) => s.amends.find((v) => v.id === id)),
      authors = items.map((v) => v.sign[0]);
    check(authors.includes(a.id));
    if (!x.accept) {
      items.forEach((v) => delete v.merge);
      return;
    }
    let yes = [...new Set([...am.merge.yes, a.id])];
    if (authors.every((id) => yes.includes(id))) {
      items[0].previousText = items[0].text;
      items[0].text = text;
      items[0].sign = [...new Set(authors)];
      items[0].status = "déposé";
      items[1].status = "fusionné";
      items[1].reason = "Texte commun accepté par les auteurs";
      items.forEach((v) => delete v.merge);
      note(s, a, "Fusion acceptée " + primary);
    } else items.forEach((v) => (v.merge.yes = yes));
    return;
  }
  if (type === "offer") {
    let to = s.members[x.to];
    check(
      live &&
        a.role === "Lobby" &&
        to?.present &&
        to.role === "Citoyen" &&
        m?.room === to.room &&
        !s.rooms[to.room].locked,
    );
    check(
      s.offers.filter((o) => o.group === a.group && o.status !== "refusé")
        .length < s.capacity,
      "Réserve épuisée",
    );
    s.offers.push({
      id: randomUUID(),
      group: a.group,
      to: to.id,
      measure: m.id,
      status: "proposé",
    });
    return;
  }
  if (type === "respond") {
    let o = s.offers.find((v) => v.id === x.offer);
    check(
      live &&
        o?.to === a.id &&
        o.status === "proposé" &&
        !s.rooms[a.room].locked,
    );
    if (x.accept)
      check(
        !s.offers.some((v) => v.to === a.id && v.status === "accepté"),
        "Un seul point par citoyen",
      );
    o.status = x.accept ? "accepté" : "refusé";
    return;
  }
  if (type === "open") {
    check(
      r &&
        controls(a, x.room) &&
        !s.polls.some(
          (v) =>
            v.room === x.room && !["annoncé", "invalidé"].includes(v.status),
        ),
    );
    if (x.kind === "plenary") {
      check(
        s.phase === "Plénière" &&
          chair(a) &&
          r.finalists.length === 2 &&
          !r.winner &&
          !s.polls.some(
            (v) =>
              v.kind === "plenary" &&
              !["annoncé", "invalidé"].includes(v.status),
          ),
      );
      start(s, x.room, x.kind, r.finalists, 1);
    } else {
      check(live && !r.finalists.length);
      if (x.kind === "selection") {
        check(
          !hasPendingAmendments(s, x.room),
          "Traitez les amendements en attente",
        );
        r.locked = true;
        start(
          s,
          x.room,
          "selection",
          s.pack.measures.filter((v) => v.room === x.room).map((v) => v.id),
          2,
        );
      } else {
        check(x.kind === "amend" && !r.locked && m?.room === x.room);
        let opts = s.amends
          .filter((v) => v.measure === m.id && v.status === "admissible")
          .map((v) => v.id);
        check(opts.length, "Aucun amendement admissible");
        if (opts.length > 2)
          start(s, x.room, "prelim", opts, 2, { base: m.id, pool: opts });
        else start(s, x.room, "amend", [m.id, ...opts], 1, { base: m.id });
      }
    }
    note(s, a, "Ouverture " + x.room);
    return;
  }
  if (type === "paper") {
    check(
      p &&
        controls(a, p.room) &&
        (p.kind !== "plenary" || chair(a)) &&
        ["incident", "suspendu"].includes(p.status),
    );
    const count = x.count,
      abstain = x.abstain,
      raw = x.raw,
      reason = str(x.reason);
    check(
      x.checked === true &&
        Number.isInteger(count) &&
        count >= 0 &&
        count <= p.eligible.length &&
        Number.isInteger(abstain) &&
        abstain >= 0 &&
        abstain <= count,
      "Vérifiez les totaux et le double comptage",
    );
    const expressed = count - abstain;
    check(
      raw &&
        Object.keys(raw).every((id) => p.options.includes(id)) &&
        p.options.every(
          (id) =>
            Number.isInteger(raw[id]) && raw[id] >= 0 && raw[id] <= expressed,
        ),
      "Décompte invalide",
    );
    const total = Object.values(raw).reduce((a, b) => a + b, 0);
    check(
      total >= expressed && total <= expressed * p.seats,
      "Nombre de choix incohérent",
    );
    check(expressed || p.kind === "amend", "Aucun suffrage exprimé");
    p.status = "invalidé";
    let paper = start(s, p.room, p.kind, p.options, p.seats, {
      round: p.round || 0,
      fixed: p.fixed || [],
      base: p.base || null,
      pool: p.pool || [],
    });
    paper.eligible = p.eligible;
    paper.raw = raw;
    paper.abstain = abstain;
    paper.paper = { count, reason };
    paper.result = tally(paper);
    paper.status = "clos";
    note(s, a, "Nouvelle urne papier à voix égales", reason);
    return;
  }
  if (type === "vote") {
    check(p && p.eligible.includes(a.id));
    if (p.receipts[a.id]) return;
    check(
      p.status === "ouvert" &&
        Array.isArray(x.choices) &&
        x.choices.length <= p.seats &&
        new Set(x.choices).size === x.choices.length &&
        x.choices.every((c) => p.options.includes(c)),
      "Bulletin invalide ou scrutin fermé",
    );
    p.receipts[a.id] = true;
    if (!x.choices.length) p.abstain++;
    for (let id of x.choices) p.raw[id] = (p.raw[id] || 0) + 1;
    if (p.kind === "selection" && !p.round) {
      let o = s.offers.find(
        (v) =>
          v.to === a.id &&
          v.status === "accepté" &&
          x.choices.includes(v.measure),
      );
      if (o) {
        p.active[o.measure] = (p.active[o.measure] || 0) + 1;
        p.byLobby ||= {};
        p.byLobby[o.group] = (p.byLobby[o.group] || 0) + 1;
      }
    }
    return;
  }
  if (
    [
      "close",
      "announce",
      "resume",
      "suspend",
      "restart",
      "tie",
      "draw",
    ].includes(type)
  ) {
    check(p && controls(a, p.room) && (p.kind !== "plenary" || chair(a)));
    const reason = ["restart", "resume", "suspend", "draw"].includes(type)
      ? str(x.reason)
      : "";
    if (type === "suspend") {
      check(p.status === "ouvert");
      p.status = "suspendu";
    }
    if (type === "resume") {
      check(p.status === "suspendu");
      p.status = "ouvert";
    }
    if (type === "restart") {
      check(["incident", "suspendu"].includes(p.status));
      p.status = "invalidé";
      start(s, p.room, p.kind, p.options, p.seats, {
        base: p.base || null,
        pool: p.pool || [],
        round: p.round || 0,
        fixed: p.fixed || [],
      });
    }
    if (type === "close") {
      check(p.status === "ouvert");
      p.closed = now();
      p.result = tally(p);
      if (p.kind === "selection" && !p.round) {
        let raw = tally({ ...p, active: {} });
        p.result.withoutBonus = { top: raw.top, tied: raw.tied };
      }
      p.status = p.result.expressed || p.kind === "amend" ? "clos" : "incident";
    }
    if (type === "announce") {
      check(p.status === "clos");
      let t = p.result;
      p.status = "annoncé";
      if (p.kind === "amend") {
        finish(s, p, [
          t.rows.find((v) => v.raw * 2 > t.expressed)?.id || p.base,
        ]);
      } else if (t.tied.length) p.status = "égalité";
      else finish(s, p, [...(p.fixed || []), ...t.top]);
    }
    if (type === "tie") {
      check(p.status === "égalité" && !p.round);
      p.status = "annoncé";
      let fixed = [...(p.fixed || []), ...p.result.top];
      start(s, p.room, p.kind, p.result.tied, p.seats - p.result.top.length, {
        round: 1,
        fixed,
        base: p.base || null,
        pool: p.pool || [],
      });
    }
    if (type === "draw") {
      check(p.status === "égalité" && p.round);
      let ids = [...p.result.tied],
        w = [...(p.fixed || []), ...p.result.top];
      for (let j = p.result.top.length; j < p.seats; j++)
        w.push(ids.splice(randomInt(ids.length), 1)[0]);
      p.status = "annoncé";
      finish(s, p, w);
    }
    if (["announce", "close", "draw"].includes(type)) {
      const votePage = p.kind === "plenary" ? "duel-" + p.room : "poll-" + p.id;
      const page = type === "close" ? votePage : "result-" + p.id;
      if (p.kind === "plenary") s.plenarySlide = page;
      else showRoomSlide(s.rooms[p.room], page, p.base);
    }
    note(s, a, type + " " + p.id, reason);
    return;
  }
  if (type === "resolveReport") {
    check(full(a) && s.reports.some((v) => v.id === x.id));
    s.reports = s.reports.filter((v) => v.id !== x.id);
    note(s, a, "Signalement classé", str(x.reason));
    return;
  }
  if (type === "message") {
    check(active && a.group);
    s.messages.push({
      id: randomUUID(),
      group: a.group,
      by: a.id,
      time: now(),
      text: str(x.text, 1000),
    });
    return;
  }
  if (type === "report") {
    check(
      a.group && s.messages.some((v) => v.id === x.id && v.group === a.group),
    );
    s.reports.push({ id: x.id, reason: str(x.reason), time: now() });
    return;
  }
  if (type === "moderate") {
    check(full(a) && s.reports.some((v) => v.id === x.id));
    s.messages.find((v) => v.id === x.id).text = "Message retiré par la régie";
    s.reports = s.reports.filter((v) => v.id !== x.id);
    note(s, a, "Modération", str(x.reason));
    return;
  }
  if (type === "survey") {
    check(s.phase === "Débriefing" && a.role === "Citoyen");
    s.survey ||= { receipts: {}, sources: {}, changed: {} };
    if (s.survey.receipts[a.id]) return;
    const valid = [
      "Expert",
      "Presse",
      "Lobby",
      "Autre citoyen",
      "Dossier initial",
      "Autre",
      "Je ne sais pas",
    ];
    check(
      Array.isArray(x.sources) &&
        x.sources.length &&
        new Set(x.sources).size === x.sources.length &&
        x.sources.every((v) => valid.includes(v)) &&
        ["Oui", "Non", "Incertain"].includes(x.changed),
    );
    for (const id of x.sources)
      s.survey.sources[id] = (s.survey.sources[id] || 0) + 1;
    s.survey.changed[x.changed] = (s.survey.changed[x.changed] || 0) + 1;
    s.survey.receipts[a.id] = true;
    return;
  }
  if (type === "wire") {
    check(active && chair(a));
    let d = s.pack.dispatches.find((v) => v.id === x.id);
    check(d && !s.dispatches.includes(d.id));
    s.dispatches.push(d.id);
    note(s, a, "Dépêche " + d.id);
    return;
  }
  if (type === "article") {
    check(active && a.role === "Journaliste");
    let v = x.id
      ? s.articles.find((v) => v.id === x.id && v.group === a.group)
      : null;
    check(!x.id || v);
    if (!v) {
      v = {
        id: randomUUID(),
        group: a.group,
        opens: {},
        front: false,
        history: [],
      };
      s.articles.push(v);
    }
    v.draft = {
      image: x.removeImage ? "" : (x.image ?? v.draft?.image ?? ""),
      title: str(x.title, 140),
      text: str(x.text, 6000),
      sources: String(x.sources || "").slice(0, 500),
      wire: s.dispatches.includes(x.wire) ? x.wire : "",
    };
    v.status = x.publish ? (s.review ? "à relire" : "publié") : "brouillon";
    if (v.status === "publié") publish(v);
    return;
  }
  if (type === "editorial") {
    check(full(a));
    let v = s.articles.find((v) => v.id === x.id);
    check(v);
    if (x.accept) {
      check(v.status === "à relire");
      publish(v);
    } else {
      v.status = "à corriger";
      v.reason = str(x.reason);
      if (x.hide) {
        delete v.public;
        v.front = false;
      }
    }
    return;
  }
  if (type === "front") {
    let v = s.articles.find((v) => v.id === x.id);
    check(
      active && v?.public && v.group === a.group && a.role === "Journaliste",
    );
    if (!v.front) {
      check(
        s.articles
          .filter((t) => t.group === a.group)
          .reduce((n, t) => n + (t.used || 0), 0) < 2,
        "Deux Unes déjà utilisées",
      );
      v.used = (v.used || 0) + 1;
    }
    v.front = !v.front;
    note(s, a, (v.front ? "Une " : "Retrait de Une ") + v.id);
    return;
  }
  if (type === "read") {
    let v = s.articles.find((v) => v.id === x.id);
    check(v?.public);
    if (s.phase !== "Débriefing" && a.role === "Citoyen" && !v.opens[a.id])
      v.opens[a.id] = now();
    return;
  }
  if (type === "projectBalance") {
    check(chair(a) && s.phase === "Débriefing");
    s.showBalance = !!x.show;
    if (x.show) s.plenarySlide = "balance";
    else if (s.plenarySlide?.startsWith("balance")) s.plenarySlide = "opening";
    s.jt = -1;
    return;
  }
  if (type === "jt") {
    check(
      chair(a) &&
        s.phase === "Débriefing" &&
        Number.isInteger(x.slide) &&
        x.slide >= -1 &&
        x.slide < journal(s).length,
    );
    s.jt = x.slide;
    s.showBalance = false;
    if (x.slide >= 0) s.plenarySlide = "journal-" + x.slide;
    else if (s.plenarySlide?.startsWith("journal-")) s.plenarySlide = "balance";
    return;
  }
  throw new Error("Commande inconnue");
}
function publish(v) {
  v.public = { ...v.draft, time: now(), corrected: !!v.history.length };
  v.history.push(v.public);
  v.status = "publié";
}
export function balance(s) {
  const winners = Object.values(s.rooms)
      .filter((r) => r.winner)
      .map((r) => measure(s, r.winner)),
    chosen = winners.map((m) => official(s, m));
  const sum = (vs) =>
    dimensions.map((_, i) => vs.reduce((n, v) => n + v.scores[i] / 2, 0));
  return {
    dimensions,
    initial: sum(winners),
    final: sum(chosen),
    chosen: chosen.map((v) => ({ id: v.id, title: v.title, text: v.text })),
    territories: s.pack.territories.map((t) => ({
      name: t.name,
      goals: (t.goals || []).map((g) => ({
        ...g,
        met: sum(chosen)[g.index] >= g.threshold,
      })),
    })),
  };
}
function journal(s) {
  let b = balance(s),
    clips = s.pack.clips || {},
    result = [];
  const add = (id, fallback) => {
    if (clips[id] || fallback) result.push(clips[id] || fallback);
  };
  add("J2040-INTRO", s.pack.title);
  const reportage = (r) => {
    if (!r?.winner) return;
    const m = measure(s, r.winner),
      v = official(s, m);
    add("M-" + m.id, m.text);
    if (v.id !== m.id) {
      const exact = m.variants.find((t) => t.id === v.id)?.text === v.text;
      result.push((exact && clips["A-" + v.id]) || v.text);
    }
  };
  const synth = (i) => {
    const bounds = s.pack.newsBounds?.[i];
    if (bounds)
      add(
        "B" +
          (i + 1) +
          "-" +
          (b.final[i] <= bounds[0] ? 1 : b.final[i] >= bounds[1] ? 3 : 2),
      );
  };
  if (
    clips["J2040-INTRO"] &&
    ["P", "C", "E", "S"].every((id) => s.rooms[id]?.winner)
  ) {
    reportage(s.rooms.P);
    reportage(s.rooms.C);
    synth(0);
    reportage(s.rooms.E);
    synth(1);
    const chosen = ["P", "C", "E", "S"].map((id) =>
      official(s, measure(s, s.rooms[id].winner)),
    );
    const economy = [...chosen]
      .sort((a, b) => a.scores[2] - b.scores[2])
      .slice(0, 2);
    result.push(
      "Pressions sur les ressources et l’activité : à examiner. " +
        economy.map((m) => m.title).join(" · "),
    );
    synth(2);
    const high = [...chosen].sort((a, b) => b.scores[3] - a.scores[3])[0],
      low = chosen
        .filter((m) => m !== high)
        .sort((a, b) => a.scores[3] - b.scores[3])[0];
    result.push(
      "Enjeux d’accès : " +
        high.title +
        ". Enjeux de répartition : " +
        low.title +
        ".",
    );
    synth(3);
    reportage(s.rooms.S);
    synth(4);
  } else {
    Object.values(s.rooms).forEach(reportage);
    (s.pack.newsBounds || []).forEach((_, i) => synth(i));
  }
  add("J2040-OUTRO", "Fin de la fiction");
  return result;
}
const publicVersion = (v) => ({
  id: v.id,
  title: v.title,
  text: v.text,
  trends: v.trends,
});
export function view(s, a) {
  ensureProjectionScreens(s);
  const desk = full(a),
    projection = a.role === "Projection",
    staff = chair(a),
    reporter = a.role === "Journaliste",
    pack = s.pack;
  let projectionScope;
  if (projection) {
    if (a.room) projectionScope = "commission";
    else if (a.id === plenaryScreenId(s)) projectionScope = "plenary";
    else if (a.id === pressScreenId(s)) projectionScope = "press";
    else projectionScope = "general";
  }
  const generalScreen = projectionScope === "general";
  const rooms = Object.fromEntries(
    Object.entries(s.rooms)
      .filter(([id]) => !projection || !a.room || id === a.room)
      .map(
        ([
          id,
          { focus, finalists, winner, official, locked, displaySlide, until },
        ]) => [
          id,
          { focus, finalists, winner, official, locked, displaySlide, until },
        ],
      ),
  );
  const visiblePolls = s.polls.filter(
    (p) =>
      rooms[p.room] &&
      p.status !== "invalidé" &&
      !(projection && a.room && p.kind === "plenary"),
  );
  const announcedProfiles = projection
    ? new Set(s.amends.filter(publishedAmendment).map((v) => v.profile))
    : null;
  const mediaName = (g) => pack.media[Number(g.slice(1))];
  const polls = visiblePolls.map((p) => {
    const ctrl = p.kind === "plenary" ? staff : controls(a, p.room),
      announced = ["annoncé", "égalité"].includes(p.status);
    return {
      id: p.id,
      kind: p.kind,
      round: p.round,
      room: p.room,
      options: p.options,
      seats: p.seats,
      status: ctrl
        ? p.status
        : p.status === "clos"
          ? "dépouillement"
          : p.status,
      base: p.base,
      paper: !!p.paper,
      ...(ctrl
        ? {
            received: p.paper?.count ?? Object.keys(p.receipts).length,
            expected: p.eligible.length,
          }
        : {}),
      ...(p.eligible.includes(a.id)
        ? { eligible: true, voted: !!p.receipts[a.id] }
        : {}),
      ...(announced || (ctrl && p.result)
        ? { result: p.result, winners: p.winners }
        : {}),
    };
  });
  const result = {
    code: s.code,
    scenario: pack.title,
    version: pack.version,
    status: pack.status,
    context: pack.context,
    phase: s.phase,
    me: { id: a.id, role: a.role, group: a.group, room: a.room },
    ...(projection ? { projectionScope } : {}),
    roomNames: pack.rooms,
    dimensions,
    rooms,
    polls,
    notices: s.notices,
    measures: pack.measures
      .filter((m) => rooms[m.room])
      .map((m) => ({
        ...publicVersion(m),
        room: m.room,
        variants: m.variants
          .filter((v) => !announcedProfiles || announcedProfiles.has(v.id))
          .map(publicVersion),
        official: publicVersion(official(s, m)),
        caution: m.caution,
      })),
    amends: s.amends
      .filter(
        (v) =>
          rooms[v.room] &&
          (controls(a, v.room) ||
            (v.room === a.room && !projection) ||
            publishedAmendment(v)),
      )
      .map(({ sign, merge, ...v }) => {
        if (projection || (!controls(a, v.room) && a.room !== v.room)) {
          const { id, measure, room, text, status, why, source } = v;
          return {
            id,
            measure,
            room,
            text,
            status,
            why,
            source,
            support: sign.length,
          };
        }
        return {
          ...v,
          ...(merge
            ? { mergeText: merge.text, mergeAuthor: sign[0] === a.id }
            : {}),
          support: sign.length,
          signed: sign.includes(a.id),
          author: sign[0] === a.id,
        };
      }),
    news: s.articles
      .filter((v) => v.public)
      .map((v) => ({
        id: v.id,
        media: mediaName(v.group),
        front: v.front,
        ...v.public,
      })),
    slide: s.jt >= 0 && (!projection || generalScreen) ? journal(s)[s.jt] : null,
  };
  const stages = staff
    ? ["", ...Object.keys(rooms)]
    : projectionScope === "plenary"
      ? [""]
      : (projection || a.role === "Modérateur") && a.room
        ? [a.room]
        : [];
  if (stages.length) {
    result.presentations = {};
    for (const scope of stages) {
      const slides = slidesFor(s, scope),
        selected = currentSlide(s, slides, scope);
      const { openKind, ...publicSlide } = selected;
      const stage = {
        current: projection ? publicSlide : selected,
        position: slides.indexOf(selected) + 1,
        total: slides.length,
      };
      if (!projection) {
        stage.route = presentationRoute(s, slides, scope);
        stage.menu = slides.map(
          ({ id, kind, room, title, part, measure, amendment, version, poll, status, ballotKind, seats, round, openKind, journalIndex }) => ({
            id,
            kind,
            room,
            title,
            part,
            ...(measure ? { measure } : {}),
            ...(amendment ? { amendment } : {}),
            ...(version ? { version } : {}),
            ...(poll ? { poll } : {}),
            ...(status ? { status } : {}),
            ...(ballotKind ? { ballotKind, seats, round } : {}),
            ...(openKind ? { openKind } : {}),
            ...(journalIndex != null ? { journalIndex } : {}),
          }),
        );
      }
      result.presentations[scope || "plenary"] = stage;
    }
  }
  if (projection) {
    if (s.showBalance && generalScreen) {
      const { dimensions, initial, final, chosen } = balance(s);
      result.summary = { dimensions, initial, final, chosen };
    }
    return result;
  }
  if (a.present && (staff || a.role === "Modérateur")) {
    const screenAccess = (id) => ({ id, key: token(s, id) });
    if (staff) {
      result.plenaryScreen = screenAccess(plenaryScreenId(s));
      result.pressScreen = screenAccess(pressScreenId(s));
      result.generalScreen = screenAccess(generalScreenId(s));
      result.roomScreens = Object.fromEntries(
        Object.keys(rooms).map((id) => [id, screenAccess("ECR-" + id)]),
      );
    } else result.roomScreen = screenAccess("ECR-" + a.room);
  }
  result.composition = Object.entries(pack.rooms).map(([id, name]) => ({
    name,
    count: Object.values(s.members).filter(
      (m) => m.present && m.role === "Citoyen" && m.room === id,
    ).length,
  }));
  let index = Number(a.group.slice(1));
  result.team =
    a.role === "Citoyen"
      ? pack.territories[index]
      : a.role === "Lobby"
        ? pack.lobbies[index]
        : null;
  if (result.team)
    result.team = { name: result.team.name, mission: result.team.mission };
  if (reporter)
    result.team = {
      name: mediaName(a.group),
      mission: "Enquêtez, identifiez vos sources et choisissez votre angle.",
    };
  if (a.group) result.messages = s.messages.filter((v) => v.group === a.group);
  if (a.role === "Lobby" || a.role === "Citoyen") {
    result.offers = s.offers.filter((o) =>
      a.role === "Lobby" ? o.group === a.group : o.to === a.id,
    );
    result.capacity = s.capacity;
  }
  if (a.role === "Lobby")
    result.targets = Object.values(s.members)
      .filter((v) => v.role === "Citoyen" && v.present)
      .map((v) => ({ id: v.id, room: v.room }));
  if (reporter || staff) {
    result.wires = pack.dispatches
      .filter((d) => staff || s.dispatches.includes(d.id))
      .map(({ id, title, text }) => ({
        id,
        title,
        text,
        sent: s.dispatches.includes(id),
      }));
    result.desk = s.articles
      .filter((v) => staff || v.group === a.group)
      .map(({ opens, history, ...v }) => ({
        ...v,
        media: mediaName(v.group),
        audience: Object.keys(opens).length,
      }));
  }
  if (s.phase === "Débriefing" && a.role === "Citoyen")
    result.surveyDone = !!s.survey?.receipts[a.id];
  if (desk) {
    result.roster = Object.values(s.members).map((v) => ({
      ...v,
      key: token(s, v.id),
    }));
    result.reports = s.reports.map((v) => ({
      ...v,
      text: s.messages.find((m) => m.id === v.id)?.text,
    }));
    result.events = s.events;
    result.template = pack;
  }
  if (staff && s.phase === "Débriefing") {
    result.balance = balance(s);
    result.showBalance = !!s.showBalance;
    result.citizens = Object.values(s.members).filter(
      (m) => m.role === "Citoyen" && m.present,
    ).length;
    result.journal = journal(s);
    result.jt = result.presentations.plenary.current.journalIndex ?? s.jt;
    result.press = pack.media.map((name, i) => {
      let news = s.articles.filter((v) => v.group === "J" + i && v.public);
      return {
        name,
        articles: news.length,
        dispatches: new Set(news.map((v) => v.public.wire).filter(Boolean))
          .size,
        unes: news.reduce((n, v) => n + (v.used || 0), 0),
        corrections: news.reduce((n, v) => n + v.history.length - 1, 0),
        audience: news.reduce((n, v) => n + Object.keys(v.opens).length, 0),
        readers: new Set(news.flatMap((v) => Object.keys(v.opens))).size,
      };
    });
    result.coverage = pack.dispatches.map((d) => {
      let sent =
        s.events.find((e) => e.what === "Dépêche " + d.id)?.time || null;
      let titles = s.articles
        .flatMap((a) =>
          a.history
            .filter((v) => v.wire === d.id)
            .map((v) => ({
              time: v.time,
              title: v.title,
              media: mediaName(a.group),
            })),
        )
        .sort((a, b) => a.time.localeCompare(b.time));
      return {
        id: d.id,
        title: d.title,
        sent,
        titles,
        delay:
          sent && titles.length
            ? Math.round(
                (Date.parse(titles[0].time) - Date.parse(sent)) / 60000,
              )
            : null,
      };
    });
    result.circulation = s.articles
      .filter((a) => a.public)
      .map((a) => ({
        title: a.public.title,
        media: mediaName(a.group),
        total: Object.keys(a.opens).length,
        before: s.polls
          .filter((p) => p.closed && p.status === "annoncé")
          .map((p) => ({
            poll: p.id,
            count: Object.values(a.opens).filter((time) => time <= p.closed)
              .length,
          })),
      }));
    const chosen = result.balance.chosen.map((v) => v.id);
    result.minGroup = s.minGroup || 5;
    let respondents = Object.keys(s.survey?.receipts || {}).length;
    result.survey =
      respondents >= result.minGroup
        ? { respondents, sources: s.survey.sources, changed: s.survey.changed }
        : { respondents: null };
    result.lobby = pack.lobbies.map((l, i) => ({
      name: l.name,
      accepted: s.offers.filter(
        (o) => o.group === "L" + i && o.status === "accepté",
      ).length,
      activated: s.polls
        .filter(
          (p) => p.kind === "selection" && p.status === "annoncé" && !p.round,
        )
        .reduce((n, p) => n + (p.byLobby?.["L" + i] || 0), 0),
      bonus: s.polls
        .filter(
          (p) => p.kind === "selection" && p.status === "annoncé" && !p.round,
        )
        .reduce((n, p) => {
          let k = Object.values(p.active).reduce((a, b) => a + b, 0);
          return (
            n +
            (p.byLobby?.["L" + i] || 0) *
              (k ? Math.min(0.5, p.result.voters / (10 * k)) : 0)
          );
        }, 0),
      capacity: s.capacity,
      offered: s.offers.filter(
        (o) => o.group === "L" + i && o.status !== "refusé",
      ).length,
      objectives: (l.objectives || []).map((ids) =>
        ids.some((id) => chosen.includes(id)),
      ),
      red: chosen.some((id) => l.uncertain?.includes(id))
        ? "À clarifier"
        : chosen.some(
              (id) => l.triggers?.includes(id) && !l.guarantees?.includes(id),
            )
          ? "Franchie"
          : l.triggers
            ? "Respectée pour les clauses validées"
            : "Non paramétrée",
    }));
  }
  return result;
}
