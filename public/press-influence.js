function identity(person) {
  return [person.gameName, person.id].filter(Boolean).join(" · ");
}
function description(person) {
  return [person.role, person.groupName, person.roomName].filter(Boolean).join(" · ");
}
const normalize = (value) => String(value).normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr");
export function findPressSources(view, query, cited) {
  const words = normalize(query.trim()).split(/\s+/);
  const contacts = new Set(view.pressContacts || []);
  return (view.pressDirectory || []).filter((p) => {
    if (cited.includes(p.id)) return false;
    if (!query.trim()) return contacts.has(p.id);
    const haystack = normalize(identity(p) + " " + description(p));
    return words.every((w) => haystack.includes(w));
  }).sort((a, b) => Number(contacts.has(b.id)) - Number(contacts.has(a.id)) ||
    a.id.localeCompare(b.id, "fr", {numeric:true}));
}

export function pressSelections(form) {
  const list = form.querySelector("[data-press-sources]");
  if (!list) return {};
  const all = (selector) => [...list.querySelectorAll(selector)].map((input) => input.value);
  return { cited: all('input[name="cited"]'), awardTo: all('input[name="awardTo"]:checked') };
}
function selectable(view, item) {
  return view.phase === "Commissions" && !item?.wasPublished && view.pressRemaining > 0;
}
function sourcesList(view, selected, awarded, item, {h}) {
  const directory = new Map(view.pressDirectory.map((p) => [p.id,p]));
  return selected.map((id) => {
    const p = directory.get(id);
    if (!p) return "";
    const checked = awarded.includes(id);
    const checkbox = p.role === "Citoyen" && selectable(view, item)
      ? '<label><input type="checkbox" name="awardTo" value="' + h(id) + '"' +
        (checked ? ' checked' : awarded.length >= view.pressRemaining ? ' disabled' : '') +
        '>Accorder 1 point à ' + h(identity(p)) + '</label>'
      : "";
    return '<div><input type="hidden" name="cited" value="' + h(id) + '"><strong>' +
      h(identity(p)) + '</strong><small> · ' + h(description(p)) + '</small> ' +
      '<button class="secondary" type="button" data-press-remove="' + h(id) + '">Retirer cette source</button>' +
      checkbox + '</div>';
  }).join("") || '<p>Aucune source associée à l’article.</p>';
}
export function pressSearchResults(view, query, cited, {h}) {
  const matches = findPressSources(view, query, cited);
  if (!matches.length)
    return '<p>' + (query.trim() ? "Aucune source trouvée." : "Recherchez une source par nom de jeu, identifiant, groupe ou commission.") + '</p>';
  return '<div class="actions">' + matches.slice(0, 8).map((p) =>
    '<button type="button" class="secondary" data-press-add="' + h(p.id) + '">Citer ' +
    h(identity(p)) + ' · ' + h(description(p)) + '</button>').join("") + '</div>' +
    (matches.length > 8 ? '<p>Affinez la recherche pour afficher les autres sources.</p>' : "");
}
export function pressSourcePanel(view, draft, item, ui) {
  if (!view.pressDirectory) return "";
  const cited = draft.cited || [], awardTo = draft.awardTo || [];
  const guidance = item?.wasPublished ? "Cet article a déjà été publié. Vous pouvez corriger les sources citées." :
    view.phase !== "Commissions" ? "Les points de presse sont attribués pendant les commissions." :
    !view.pressRemaining ? "La rédaction a attribué ses deux points. Vous pouvez continuer à citer des sources." :
    'Votre rédaction dispose de ' + view.pressRemaining + (view.pressRemaining === 1 ? ' point' : ' points') +
      ' sur 2. Cochez les citoyens à créditer lors de la première publication. Chaque citoyen peut recevoir un seul point de presse pendant le jeu et conserver jusqu’à trois points.';
  return '<fieldset data-press-sources><legend>Personnes citées dans l’article</legend><p data-press-guidance>' +
    ui.h(guidance) + '</p><div data-press-preview role="status" aria-live="polite"></div><div data-press-selected>' + sourcesList(view,cited,awardTo,item,ui) + '</div>' +
    '<label>Rechercher une personne<input type="search" data-press-search autocomplete="off" placeholder="Nom de jeu ou identifiant, ex. C1"></label>' +
    '<div data-press-results>' + pressSearchResults(view,"",cited,ui) + '</div>' +
    ui.btn("Scanner une carte pour mes contacts",{ui:"scanPress"},true) + '</fieldset>';
}
export function changeSources(form, view, item, ui, {add,remove}={}) {
  const box = form.querySelector("[data-press-sources]");
  if (!box) return;
  const {cited,awardTo} = pressSelections(form);
  if (add && !cited.includes(add) && view.pressDirectory.some((p) => p.id === add)) cited.push(add);
  const selected = cited.filter((id) => id !== remove);
  const grants = awardTo.filter((id) => selected.includes(id)).slice(0,view.pressRemaining);
  box.querySelector("[data-press-selected]").innerHTML = sourcesList(view,selected,grants,item,ui);
  const input = box.querySelector("[data-press-search]");
  if (add) input.value = "";
  box.querySelector("[data-press-results]").innerHTML = pressSearchResults(view,input.value,selected,ui);
}
const awardReasons = {
  credited: "1 point attribué", available: "1 point attribuable à la publication",
  already: "point de presse déjà reçu dans la partie", full: "réserve du citoyen pleine",
  empty: "crédits de la rédaction épuisés", absent: "citoyen absent",
  closed: "attribution réservée à la phase Commissions", published: "article déjà publié",
};
export function awardPreview(entries, ui) {
  const skipped = entries.filter((entry) => entry.status !== "available");
  return awardReport(entries, ui) + (skipped.length
    ? "<p>Les personnes concernées restent citées. Vous pouvez publier sans leur attribuer de point.</p>"
    : "<p>La disponibilité sera vérifiée à la publication effective.</p>");
}
export function awardReport(entries, {h}) {
  if (!entries?.length) return "";
  return '<p>' + entries.map((e) => h(e.id + " · " + awardReasons[e.status])).join("<br>") + '</p>';
}
export function citedByline(news, {h}) {
  if (!news.cited?.length) return "";
  return "<p><strong>Personnes citées</strong> · " +
    news.cited.map((p) => h(identity(p) + (p.groupName ? " (" + p.groupName + ")" : ""))).join(", ") + "</p>";
}
export function pressAwardNotice(view, {h}) {
  return (view.pressNews || []).map((a) =>
    '<article><h3>Vous avez reçu un point de presse</h3><p>' + h(a.media) +
    ' vous a accordé 1 point à la publication de « ' + h(a.title) + ' ».</p>' +
    (a.visible ? '<a class="desk-link" href="#article=' + h(encodeURIComponent(a.id)) + '">Lire l’article</a>' : "<p>La rédaction a retiré cet article du journal.</p>") + '</article>').join("");
}
