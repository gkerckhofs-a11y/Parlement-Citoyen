export function influenceMeasures(view, citizenId) {
  const target = view.targets.find((t) => t.id === citizenId);
  if (!target || view.rooms[target.room]?.locked) return [];
  const outstanding = new Set((view.offers || [])
    .filter((offer) => offer.to === citizenId && offer.status !== "refusé")
    .map((offer) => offer.measure));
  return view.measures.filter((m) => m.room === target.room && !outstanding.has(m.id))
    .map((m) => [m.id, m.title]);
}

function negotiationOpen(view, room) {
  return view.phase === "Commissions" && Boolean(view.rooms[room]) && !view.rooms[room].locked;
}

function measureLabel(view, id) {
  const measure = view.measures.find((m) => m.id === id);
  return measure ? measure.id + " · " + measure.title : id || "Soutien à votre participation";
}

function plural(n, one, many) {
  return n + " " + (n > 1 ? many : one);
}

export function citizenInfluenceCounts(view) {
  if (view.me.role !== "Citoyen") return { accepted: 0, pending: 0 };
  const offers = view.offers || [];
  const canRespond = view.me.present !== false && negotiationOpen(view, view.me.room);
  return {
    accepted: offers.filter((offer) => offer.status === "accepté").length,
    pending: canRespond ? offers.filter((offer) => offer.status === "proposé").length : 0,
  };
}

export function citizenInfluencePanel(view, { h, btn }, { compact = false } = {}) {
  if (view.me.role !== "Citoyen") return "";
  const offers = [...(view.offers || [])].reverse();
  const open = negotiationOpen(view, view.me.room);
  const present = view.me.present !== false;
  const accepted = offers.find((offer) => offer.status === "accepté");
  const pending = offers.filter((offer) => offer.status === "proposé");
  const counts = citizenInfluenceCounts(view);
  const reference = (offer) =>
    (offer.association || offer.group) + " · " + measureLabel(view, offer.measure);
  let message;
  const wallet = view.wallet;
  const full = wallet && wallet.points >= wallet.cap;
  if (wallet && view.phase === "Plénière") {
    message = "Votre vote est gratuit. Vous pouvez dépenser un point par duel pour donner une deuxième voix à votre choix.";
  } else if (wallet && open && full && counts.pending && !accepted) {
    message = "Réserve pleine. Votre offre reste disponible jusqu’à la fin des votes sur les mesures de votre commission.";
  } else if (wallet && view.phase === "Commissions" && !open) {
    message = "Votre commission a terminé ses votes sur les mesures. Vous gardez vos points pour la plénière.";
  } else if (wallet && open && offers.length && !counts.pending && !accepted) {
    message = "Vous pourrez encore accepter une offre avant la fin des votes sur les mesures.";
  } else if (view.phase === "Préparation") {
    message = "Les associations pourront vous proposer un point pour une mesure de votre commission.";
  } else if (open && !present) {
    message = "Votre présence est marquée « absente ». Une réponse est possible une fois votre présence rétablie.";
  } else if (!open && view.phase === "Commissions") {
    message = "L’ouverture du scrutin de sélection a clos les réponses pour votre commission.";
  } else if (view.phase === "Plénière") {
    message = "En plénière, chaque citoyen vote à voix égale.";
  } else if (view.phase === "Débriefing") {
    message = "Vous pouvez relire les offres reçues et vos réponses.";
  } else if (accepted && counts.pending) {
    message = "Vous avez déjà accepté un point. Vous pouvez encore refuser les autres offres.";
  } else if (accepted) {
    message = "Vous êtes libre de soutenir une autre mesure ou de vous abstenir.";
  } else if (counts.pending) {
    message = "Vous pouvez accepter un seul point parmi les offres reçues.";
  } else if (offers.length) {
    message = "Vous pourrez répondre à une nouvelle offre tant que la sélection des finalistes n’a pas commencé.";
  } else {
    message = "Vous n’avez reçu aucune offre de la part d’une association.";
  }

  const balance = wallet ? '<span><strong>' + wallet.points + ' / ' + wallet.cap +
    '</strong> points en réserve</span>' : "";
  const summary = '<div class="citizen-influence-counts">' + balance + '<span><strong>' + counts.accepted +
    '</strong> ' + (counts.accepted > 1 ? 'points acceptés' : 'point accepté') + '</span><span><strong>' +
    counts.pending + '</strong> ' + (counts.pending > 1 ? 'offres à traiter' : 'offre à traiter') + '</span></div>';
  const acceptedNote = accepted
    ? '<p class="influence-accepted"><strong>Point accepté de ' + h(accepted.association || accepted.group) +
      '</strong><br>' + h(measureLabel(view, accepted.measure)) + '</p>' : "";
  const heading = '<h2>Mes points d’influence</h2>';
  if (compact) {
    const first = counts.pending && pending.length ? pending[0] : null;
    return '<section class="citizen-influence influence-compact">' + heading + summary +
      (first ? '<p><strong>' + (counts.pending > 1 ? 'Dernière offre' : 'Offre reçue') +
        '</strong> · ' + h(reference(first)) + '</p>' : acceptedNote) +
      '<p>' + h(message) + '</p><button type="button" data-tab="Influence">' +
      (counts.pending ? 'Examiner ' + (counts.pending > 1 ? 'mes offres' : 'mon offre') : 'Voir mes points') +
      '</button></section>';
  }

  const offerLine = (offer, status, actions = "") =>
    '<li><div class="influence-offer-title"><strong>' + h(offer.association || offer.group) +
    '</strong><span>' + h(status) + '</span></div><p>' +
    h(measureLabel(view, offer.measure)) + '</p>' + (actions ? '<div class="actions">' + actions + '</div>' : "") + '</li>';

  const awaiting = open ? pending : [];
  const pendingList = awaiting.map((offer) => {
    let actions = "";
    if (present) {
      if (!accepted && !full) actions += btn("Accepter le point", { type: "respond", offer: offer.id, accept: true });
      actions += btn("Refuser le point", { type: "respond", offer: offer.id, accept: false }, true);
    }
    return offerLine(offer, "1 point proposé", actions);
  }).join("");
  const previous = offers.filter((offer) =>
    offer.status !== "proposé" || !open);
  const history = previous.map((offer) => offerLine(offer,
    offer.status === "accepté" ? "Vous avez accepté" : offer.status === "refusé" ? "Vous avez refusé" : "Sans réponse à la clôture"
  )).join("");
  const rule = wallet ? '<details class="influence-rules"><summary>Comment utiliser mes points</summary>' +
    '<p>Vous commencez avec 2 points et pouvez en garder 3. Sur chaque mesure, voter pour ou contre coûte 1 point. Une abstention enregistrée vous rend 1 point si votre réserve le permet. Amendements et départages sont gratuits.</p>' +
    '<p>Vous pouvez recevoir 1 point d’un lobby et 1 point de presse sur la partie. À la publication de votre témoignage, la rédaction peut vous attribuer ce point si votre réserve a une place.</p>' +
    '<p>Vous conservez vos points en plénière. Un point renforce votre choix dans un duel. Votre bulletin reste secret.</p></details>' : '<details class="influence-rules"><summary>Comment le point intervient dans le vote</summary>' +
    '<p>Vous pouvez accepter un point pour une seule mesure. Vous gardez le choix de votre bulletin.</p>' +
    '<p>Au premier vote de sélection des finalistes, si vous soutenez cette mesure, le point ajoute un bonus à son total. Le bonus vaut au maximum une demi-voix. Votre bulletin reste secret.</p>' +
    '<p>Les votes sur les amendements, les départages, les votes de secours sur papier et la plénière se déroulent à voix égales.</p></details>';
  return '<section class="citizen-influence">' + heading + summary + '<p>' + h(message) + '</p>' +
    acceptedNote +
    (pendingList ? '<h3>Offres reçues</h3><ul class="influence-offers">' + pendingList + '</ul>' : '') +
    (history ? '<details class="influence-history"><summary>Historique · ' +
      plural(previous.length, 'offre', 'offres') + '</summary><ul class="influence-offers">' +
      history + '</ul></details>' : '') + rule + '</section>';
}

export function influencePanel(view, { section, para, opts, btn, form }, { recipient = "" } = {}) {
  if (view.me.role !== "Lobby" || !view.offers) return "";
  const taken = view.offers.filter((o) => ["proposé","accepté"].includes(o.status)).length;
  const remaining = Math.max(0, view.capacity - taken);
  const targets = view.targets || [];
  const eligible = targets.filter((target) => influenceMeasures(view, target.id).length);
  const chosen = eligible.find((target) => target.id === recipient);
  let body = para("Réserve de votre association · " +
    plural(remaining, "point disponible", "points disponibles") + " sur " + view.capacity + ".") +
    btn("Scanner une carte de visite", { ui: "scanCard" }, true);
  if (view.rulesVersion === 2)
    body += para("Présentez la mesure que vous défendez. Si le citoyen accepte, le point rejoint sa réserve et il reste libre de son vote.");
  let reason = "";
  if (view.phase === "Préparation") reason = "Les offres ouvriront pendant les commissions.";
  else if (view.phase !== "Commissions") reason = "La période d’attribution des points est terminée.";
  else if (view.me.present === false) reason = "Votre présence est marquée « absente ».";
  else if (view.capacity === 0) reason = "Votre association ne dispose d’aucun point dans cette session.";
  else if (remaining === 0) reason = "Tous les points de la réserve sont déjà proposés ou acceptés.";
  else if (recipient && !chosen) {
    if (targets.some((target) => target.id === recipient)) {
      reason = "Votre association a déjà proposé toutes les mesures disponibles à " + recipient + ".";
    } else {
      reason = recipient + " ne peut pas recevoir d’offre actuellement. Le destinataire doit être un citoyen présent dans une commission où la négociation est encore ouverte.";
    }
  } else if (!eligible.length) {
    reason = targets.length ? "Votre association a déjà proposé toutes les mesures disponibles."
      : "Aucun citoyen présent dans une commission encore en négociation.";
  }
  if (reason) body += para((recipient ? "Carte de " + recipient + " · " : "") + reason);
  else if (chosen) body += para("Carte reconnue · " +
    [chosen.id, chosen.territory, view.roomNames[chosen.room]].filter(Boolean).join(" · ") +
    ". Choisissez la mesure puis confirmez l’offre.");
  if (view.phase === "Commissions" && view.me.present !== false && remaining > 0 && eligible.length) {
    const missing = recipient && !chosen;
    const ordered = chosen ? [chosen, ...eligible.filter((target) => target.id !== chosen.id)] : eligible;
    const choices = ordered.map((target) => [
      target.id, [target.id, target.territory, view.roomNames[target.room]].filter(Boolean).join(" · "),
    ]);
    if (missing) choices.unshift(["", "Choisir un autre citoyen"]);
    const measures = missing ? [] : influenceMeasures(view, ordered[0].id);
    // Both controls must have a deliberate selection before an offer can leave this form.
    body += form(
      { type: "offer" },
      opts("Citoyen", "to", choices).replace("<select ", "<select required ") +
        opts("Mesure de sa commission", "measure", measures).replace("<select ", "<select required "),
      "Proposer un point",
    );
  }
  for (const o of [...view.offers].reverse()) {
    const measure = view.measures.find((m) => m.id === o.measure);
    const open = measure && negotiationOpen(view, measure.room);
    const status = o.status === "proposé" ? (open ? "En attente de réponse" : "Sans réponse à la clôture")
      : o.status === "accepté" ? "Point accepté" : o.status === "expiré" ? "Offre expirée" : "Point refusé";
    body += para(["Citoyen " + o.to, measure?.title || o.measure, status].join(" · "));
  }
  return section("Points d’influence", body);
}
