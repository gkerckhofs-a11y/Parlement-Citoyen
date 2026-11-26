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
  section.className = "personal-card";
  section.append(
    element("h1", "Carte de visite"),
    element("h2", [info.gameName, info.id, info.role].filter(Boolean).join(" · ")),
    element(
      "p",
      [info.groupName, info.roomName && "Commission " + info.roomName]
        .filter(Boolean)
        .join(" · "),
    ),
    element("small", "Parlement citoyen · Séance " + code),
  );
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
  } else if (info.role === "Citoyen")
    section.append(
      element(
        "p",
        "Pour proposer un point, un lobby peut scanner cette carte depuis son interface.",
      ),
    );
}
load().catch((e) =>
  main.replaceChildren(
    element("h1", "Carte de visite"),
    element("p", e.message),
  ),
);
