import { qrSvg, startCardCamera, readCardImage } from "./qr-code.js";

export function cardUrl(person, origin = location.origin) {
  return origin + "/carte/" + person.code + "/" + person.card;
}

export function parseCard(value, origin = location.origin) {
  let url;
  try {
    url = new URL(value, origin);
  } catch {
    return null;
  }
  if (url.origin !== origin || url.search || url.hash) return null;
  const match = /^\/carte\/([A-F0-9]{10})\/([a-zA-Z0-9_-]{24})\/?$/.exec(
    url.pathname,
  );
  return match && { code: match[1], card: match[2] };
}

function identity(person, h) {
  return (
    "<h2>" +
    h(person.id) +
    " · " +
    h(person.role) +
    "</h2><p>" +
    h(
      [person.groupName, person.roomName && "Commission " + person.roomName]
        .filter(Boolean)
        .join(" · "),
    ) +
    "</p>"
  );
}

export function showPersonalCard(person, privateLink, privateMode, ui) {
  const { h, btn } = ui;
  const publicUrl = cardUrl(person);
  const value = privateMode ? privateLink : publicUrl;
  return (
    '<section class="personal-card"><h1>' +
    (privateMode ? "Mon accès privé" : "Ma carte de visite") +
    "</h1>" +
    identity(person, h) +
    '<div class="card-qr">' +
    qrSvg(value) +
    "</div>" +
    (privateMode
      ? "<p>Ce code ouvre votre interface et permet d’agir en votre nom. Gardez-le pour vous.</p>"
      : "<p>Montrez ce code pour partager votre identité de jeu.</p>") +
    '<div class="actions">' +
    (privateMode
      ? ""
      : '<a href="' +
        h(publicUrl) +
        '" rel="noopener" target="_blank">Voir ma fiche publique</a>') +
    (privateMode
      ? ""
      : btn("Scanner une carte de visite", { ui: "scanCard" }, true)) +
    btn(
      privateMode ? "Masquer mon accès privé" : "Afficher mon QR d’accès privé",
      { ui: "cardPrivacy", private: !privateMode },
      true,
    ) +
    "</div></section>"
  );
}

export function showPublicCard(person, lobby, ui) {
  const { h, btn } = ui;
  let action = "";
  if (lobby && person.code === lobby.code && person.role === "Citoyen")
    action = btn("Préparer une offre pour " + person.id, {
      ui: "useRecipient",
      id: person.id,
    });
  return (
    '<section class="personal-card"><h1>Carte de visite</h1>' +
    identity(person, h) +
    "<p>Parlement citoyen · Séance " +
    h(person.code) +
    "</p>" +
    action +
    "</section>"
  );
}

// This dialog lives outside the auto-refreshed game view. Closing it releases the camera.
export function scanCard({ session, lookup, onCard }) {
  const dialog = document.createElement("dialog");
  dialog.className = "scan-card";
  dialog.innerHTML =
    "<h2>Scanner une carte de visite</h2><p>Cadrez le QR de la carte de visite du participant.</p>" +
    '<video autoplay muted playsinline></video><p role="status" data-scan-status></p>' +
    '<button type="button" data-camera>Utiliser la caméra</button>' +
    '<label>Lire un QR depuis une image<input type="file" accept="image/*"></label>' +
    '<form><label>Lien de la carte de visite<input name="link" type="url" required></label><button>Lire la carte</button></form>' +
    '<button type="button" class="secondary" data-dismiss>Fermer</button>';
  document.body.append(dialog);
  const notice = dialog.querySelector("[data-scan-status]");
  let stop,
    processing = false,
    closed = false;
  const endCamera = () => {
    stop?.();
    stop = null;
  };
  const cleanup = () => {
    closed = true;
    endCamera();
    dialog.remove();
    window.removeEventListener("pagehide", dismiss);
  };
  const dismiss = () => {
    if (dialog.open) dialog.close();
  };
  const error = (e) => {
    if (!closed)
      notice.textContent =
        e?.message || "Lecture impossible. Essayez une image ou le lien.";
  };
  const use = async (text) => {
    if (closed || processing) return;
    endCamera();
    const target = parseCard(text);
    if (!target)
      return error(
        new Error("Utilisez le QR « Carte de visite » de Parlement citoyen."),
      );
    if (target.code !== session)
      return error(new Error("Cette carte appartient à une autre séance."));
    processing = true;
    try {
      const card = await lookup(target);
      if (closed) return;
      dismiss();
      onCard(card);
    } catch (e) {
      error(e);
    } finally {
      processing = false;
    }
  };
  const start = () => {
    endCamera();
    notice.textContent = "Ouverture de la caméra…";
    try {
      stop = startCardCamera(dialog.querySelector("video"), use, error);
    } catch (e) {
      error(e);
    }
  };
  dialog.querySelector("[data-camera]").onclick = start;
  dialog.querySelector("[data-dismiss]").onclick = dismiss;
  dialog.addEventListener("close", cleanup, { once: true });
  window.addEventListener("pagehide", dismiss, { once: true });
  dialog.querySelector("video").onplaying = () => {
    notice.textContent = "Présentez la carte devant la caméra.";
  };
  dialog.querySelector("form").onsubmit = (e) => {
    e.preventDefault();
    use(e.target.elements.link.value.trim());
  };
  dialog.querySelector('input[type="file"]').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    endCamera();
    try {
      await use(await readCardImage(file));
    } catch (err) {
      error(err);
    }
    e.target.value = "";
  };
  dialog.showModal();
  start();
}

export function printParticipantCards(view, privateMode, { h, link }) {
  const sheet = document.createElement("div");
  sheet.className = "participant-print";
  const sheets = [];
  const people = view.roster.filter((p) => p.card);
  for (let i = 0; i < people.length; i += 9) {
    const page = people
      .slice(i, i + 9)
      .map(
        (p) =>
          "<article><strong>" +
          (privateMode
            ? "Accès privé · à conserver"
            : "Carte de visite · à partager") +
          "</strong>" +
          identity(p.card, h) +
          '<div class="card-qr">' +
          qrSvg(privateMode ? link(p) : cardUrl(p.card)) +
          "</div></article>",
      )
      .join("");
    sheets.push("<section>" + page + "</section>");
  }
  sheet.innerHTML = sheets.join("");
  document.body.append(sheet);
  document.body.classList.add("printing-participants");
  const clear = () => {
    sheet.remove();
    document.body.classList.remove("printing-participants");
  };
  window.addEventListener("afterprint", clear, { once: true });
  try {
    window.print();
  } catch (e) {
    clear();
    throw e;
  }
}
