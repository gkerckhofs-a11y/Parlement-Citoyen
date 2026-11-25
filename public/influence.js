export function influenceMeasures(view, citizenId) {
  const target = view.targets.find((t) => t.id === citizenId);
  if (!target || view.rooms[target.room]?.locked) return [];
  return view.measures.filter((m) => m.room === target.room).map((m) => [m.id, m.title]);
}

export function influencePanel(view, { section, para, opts, btn, form }) {
  if (!view.offers || view.phase === "Préparation") return "";
  const lobby = view.me.role === "Lobby";
  const live = view.phase === "Commissions";
  const present = view.me.present !== false;
  const accepted = view.offers.some((o) => o.status === "accepté");
  const remaining = view.capacity - view.offers.filter((o) => o.status !== "refusé").length;
  let body = lobby
    ? para("Points disponibles dans la réserve de votre association : " + remaining + " sur " + view.capacity + ".")
    : para("Vous pouvez accepter un seul point. Au premier vote de sélection des finalistes, il compte si vous choisissez la mesure soutenue. Votre bulletin reste secret.");

  if (lobby && live && present && remaining > 0 && view.targets.length) {
    body += form(
      { type: "offer" },
      opts("Citoyen", "to", view.targets.map((t) => [
        t.id, [t.id, t.territory, view.roomNames[t.room]].filter(Boolean).join(" · "),
      ])) +
        opts("Mesure de sa commission", "measure", influenceMeasures(view, view.targets[0].id)),
      "Proposer un point",
    );
  } else if (lobby && live && present && remaining > 0) {
    body += para("Aucun citoyen présent dans une commission encore en négociation.");
  }
  if (!view.offers.length && !lobby) body += para("Vous n’avez reçu aucune proposition.");
  for (const o of [...view.offers].reverse()) {
    const measure = view.measures.find((m) => m.id === o.measure);
    const open = live && measure && !view.rooms[measure.room]?.locked;
    const pending = o.status === "proposé";
    const status = pending ? (open ? "En attente de réponse" : "Sans réponse à la clôture")
      : o.status === "accepté" ? "Point accepté" : "Point refusé";
    body += para([lobby ? "Citoyen " + o.to : o.association || o.group, measure?.title || o.measure, status].join(" · "));
    if (!lobby && present && open && pending) {
      if (!accepted) body += btn("Accepter le point", { type: "respond", offer: o.id, accept: true });
      body += btn("Refuser le point", { type: "respond", offer: o.id, accept: false }, true);
    }
  }
  return section("Points d’influence", body);
}
