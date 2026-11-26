import { act, create } from "./engine.mjs";
export const rehearsals = [
  [
    "AC20360001",
    "Commissions",
    "Presse, influence, amendements et scrutins en parallèle",
  ],
  ["AC20360002", "Plénière", "Huit finalistes et un premier duel ouvert"],
  ["AC20360003", "Débriefing", "Plan adopté, journal 2040, sondage et exports"],
];
export const influenceTrials = ["AC20360004","AC20360005","AC20360006"];
export function rehearsal(pack, index, rulesVersion = 1) {
  const [code, label] = rehearsals[index],
    s = create(structuredClone(pack), 100, rulesVersion === 1 || index !== 0, {rulesVersion});
  s.code = rulesVersion === 2 ? influenceTrials[index] : code;
  s.googleAdmin = true;
  s.pack.title = "Répétition · " + label + " · " + pack.title;
  const run = (id, type, props = {}) =>
    act(s, s.members[id], { type, ...props });
  const reg = (type, props) => run("REG", type, props);
  reg("phase");
  reg("notice", {
    text: "Session de répétition. Les identités et les bulletins préremplis servent aux essais.",
  });
  for (const id of ["D01", "D02"]) reg("wire", { id });
  run("J1", "article", {
    title: "Qui manque sur la carte ?",
    text: "La rédaction compare les zones documentées et les zones encore peu observées.",
    sources: "Dépêche D01 · exercice de rédaction",
    wire: "D01",
    publish: true,
  });
  const article = s.articles[0].id;
  if (s.review) reg("editorial", { id: article, accept: true });
  run("J1", "front", { id: article });
  run("C5", "read", { id: article });
  run("C9", "read", { id: article });
  run("J2", "article", {
    title: "La parole aux territoires",
    text: "Article d’exercice en attente de relecture.",
    publish: rulesVersion === 1,
    wire: "D02",
  });
  run("J3", "article", {
    title: "Préparer une interview",
    text: "Brouillon de la rédaction. Quelle source interroger ?",
    publish: false,
  });
  for (const id of ["C1", "L1", "J1"])
    run(id, "message", {
      text: "Notre équipe prépare ses questions pour la séance.",
    });
  run("C5", "message", { text: "Message fictif à examiner en modération." });
  run("C5", "report", {
    id: s.messages.at(-1).id,
    reason: "Essai de la file de modération",
  });
  run("L1", "offer", { to: "C1", measure: "P1" });
  run("L2", "offer", { to: "C5", measure: "P2" });
  run("C5", "respond", { offer: s.offers.at(-1).id, accept: true });
  const variant = pack.measures.find((m) => m.id === "P1").variants[0];
  run("C1", "amend", {
    measure: "P1",
    text: variant.text,
    why: "Soumettre cette clause à la commission.",
  });
  let amend = s.amends[0].id;
  run("C5", "sign", { amend });
  function poll(room, kind, measure) {
    reg("open", { room, kind, measure });
    return s.polls.at(-1);
  }
  function finish(p) {
    reg("close", { poll: p.id });
    if (rulesVersion === 2 && p.kind === "plenary" && !p.round) reg("revealOrdinary", {poll:p.id});
    reg("announce", { poll: p.id });
  }
  function selection(room) {
    let p = poll(room, "selection");
    for (let id of p.eligible)
      run(id, "vote", { poll: p.id, choices: [room + "1", room + "2"] });
    finish(p);
  }
  function opinionRoom(room, tied = false) {
    const measures = pack.measures.filter(m => m.room === room);
    measures.forEach((m, i) => {
      const ballot = poll(room, "opinion", m.id);
      ballot.eligible.forEach((id, j) => {
        // Two leading measures. Rotating the voting citizens leaves room in their reserves.
        const count = i === 0 ? 6 : i === 1 || (tied && i === 2) ? 4 : 1;
        const chosen = (j + 3 * i) % ballot.eligible.length < count;
        run(id, "vote", {poll:ballot.id, choices:chosen ? ["pour"] : []});
      });
      finish(ballot);
    });
  }
  if (index === 0 && rulesVersion === 2) {
    const ballot = poll("C","opinion","C1");
    ballot.eligible.slice(2,7).forEach(id => run(id,"vote",{poll:ballot.id,choices:["pour"]}));
    opinionRoom("E", true);
    opinionRoom("S");
    return s;
  }
  if (index === 0) {
    let c = poll("C", "selection");
    for (let id of c.eligible.slice(2, 7))
      run(id, "vote", { poll: c.id, choices: ["C1", "C2"] });
    let e = poll("E", "selection");
    for (let [id, choice] of e.eligible
      .slice(0, 2)
      .map((id, i) => [id, i ? "E2" : "E3"]))
      run(id, "vote", { poll: e.id, choices: ["E1", choice] });
    finish(e);
    selection("S");
    return s;
  }
  reg("review", {
    amend,
    profile: variant.id,
    status: "admissible",
    reason: "Correspondance exacte avec la variante préparée.",
  });
  const ap = poll("P", "amend", "P1");
  for (let id of ap.eligible)
    run(id, "vote", { poll: ap.id, choices: [amend] });
  finish(ap);
  for (let room of Object.keys(s.rooms)) {
    if (rulesVersion === 2) opinionRoom(room);
    else selection(room);
  }
  reg("phase");
  for (let room of Object.keys(s.rooms)) {
    let p = poll(room, "plenary");
    if (index === 1) return s;
    p.eligible.forEach((id, i) =>
      run(id, "vote", {
        poll: p.id,
        choices: i % 9 === 0 ? [] : [room + (i % 3 === 0 ? "2" : "1")],
        ...(rulesVersion === 2 ? {boost: i % 9 === 1 && room === "P"} : {}),
      }),
    );
    finish(p);
  }
  reg("phase");
  return s;
}
