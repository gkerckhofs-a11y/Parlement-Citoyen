const signed = (n) => n > 0 ? "+" + n : String(n);

export function walletLabel(wallet) {
  return wallet.points + " / " + wallet.cap + " points d’influence";
}

export function measureBallot(v, p, { h, form }) {
  const wallet = v.wallet;
  const option = (value, text, detail, disabled = false) =>
    '<label class="opinion-choice"><input type="radio" required name="choices" value="' + value + '"' +
    (disabled ? " disabled" : "") + '><span><strong>' + h(text) + '</strong> <small>' + h(detail) + '</small></span></label>';
  const body = '<p class="vote-wallet">' + h(walletLabel(wallet)) + '</p>' +
    '<fieldset class="ballot-options"><legend>Votre position sur ce texte</legend>' +
    option("pour", "Pour", "−1 point", wallet.points === 0) +
    option("contre", "Contre", "−1 point", wallet.points === 0) +
    option("", "Je m’abstiens", wallet.points === wallet.cap ? "Réserve pleine" : "+1 point") +
    '</fieldset>' + (wallet.points === 0 ? '<p>Votre réserve est vide. Une abstention vous rend un point.</p>' : '');
  return form({type:"vote",poll:p.id}, body, "Enregistrer mon bulletin");
}

export function duelBallot(v, p, { h, form, name }) {
  const choices = p.options.map(id => '<label><input type="radio" required name="choices" value="' + h(id) +
    '"><span>' + h(name(id)) + '</span></label>').join("");
  return form({type:"vote",poll:p.id},
    '<fieldset class="ballot-options"><legend>Quel texte souhaitez-vous adopter ?</legend>' + choices +
    '<label><input type="radio" required name="choices" value=""><span>Je m’abstiens</span></label></fieldset>' +
    '<p class="vote-wallet">' + h(walletLabel(v.wallet)) + '</p>' +
    '<label class="ballot-boost"><input type="checkbox" name="boost" disabled><span>Renforcer mon vote · 1 point</span></label>' +
    '<p>' + (v.wallet.points ? 'Choisissez un texte pour pouvoir lui donner une deuxième voix.' :
      'Votre bulletin reste gratuit, même avec une réserve vide.') + '</p>', "Enregistrer mon bulletin");
}

export function currentResult(v, p, { table, name }) {
  const result = p.result;
  if (p.kind === "ranking" && !p.round) {
    const rows = v.rooms[p.room].ranking || [];
    return table(["Mesure","Pour","Contre","Abst.","Score"], rows.map(row =>
      [name(row.id),row.for,row.against,row.abstain,signed(row.score)]));
  }
  if (p.kind === "opinion") {
    const count = id => result.rows.find(row => row.id === id)?.raw ?? 0;
    return table(["Pour","Contre","Abstentions","Score"], [[count("pour"),count("contre"),result.abstain,signed(result.score)]]);
  }
  if (p.kind === "plenary" && !p.round) {
    return table(["Texte","Voix","Renforts","Total"], result.rows.map(row =>
      [name(row.id),row.raw,row.bonus,row.weight]));
  }
  return table(["Option","Voix"], result.rows.map(row => [name(row.id),row.raw]));
}
