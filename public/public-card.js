import { visitBadge } from "./participant-cards.js?v=identite1";
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) =>
  ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[char]);
const main = document.querySelector("#card");
function element(tag, text) {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
}
async function load() {
  const match = /^\/carte\/([A-F0-9]{10})\/([a-zA-Z0-9_-]{24})\/?$/.exec(
    location.pathname,
  );
  if (!match) throw Error("Cette carte de visite est introuvable.");
  const [, code, card] = match;
  const response = await fetch("/api/card", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, card }),
  });
  if (!response.ok) throw Error("Cette carte de visite est introuvable.");
  const info = await response.json();
  const section = element("section", "");
  section.className = "badge-view";
  section.append(element("h1","Carte de visite"));
  section.insertAdjacentHTML("beforeend", visitBadge(info, escapeHtml));
  main.replaceChildren(section);
  const stored = JSON.parse(sessionStorage.getItem("pc.auth") || "null");
  if (
    stored?.code === code &&
    /^L[0-9]+$/.test(stored.id) &&
    info.role === "Citoyen"
  ) {
    const link = element("a", "Préparer une offre pour " + info.id);
    link.className = "desk-link";
    link.href = "/#carte=" + card;
    section.append(element("p", ""), link);
  } else if (stored?.code === code && /^J[0-9]+$/.test(stored.id) && sessionStorage.getItem("pc.press." + code + "." + stored.id) === "2") {
    const link = element("a", "Enregistrer cette source dans mes contacts");
    link.className = "desk-link";
    link.href = "/#carte=" + card;
    section.append(element("p", ""), link);
  }
}
load().catch((e) =>
  main.replaceChildren(
    element("h1", "Carte de visite"),
    element("p", e.message),
  ),
);
