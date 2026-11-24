export const dimensions = [
  "Santé",
  "Environnement",
  "Économie",
  "Justice sociale",
  "Confiance démocratique",
];
export const demo = {
  title: "Assemblée de répétition",
  version: "Essai 1",
  status: "essai",
  context:
    "Séance fictive de prise en main. Choisissez les équipements de votre école.",
  rooms: {
    P: "Vie scolaire",
    C: "Espaces communs",
    E: "Environnement",
    S: "Mobilité",
  },
  territories: Array.from({ length: 7 }, (_, i) => ({
    name: "Territoire " + (i + 1),
    mission: "Défendez les besoins de votre territoire.",
  })),
  lobbies: Array.from({ length: 8 }, (_, i) => ({
    name: "Association " + (i + 1),
    mission: "Présentez un argument aux citoyens.",
  })),
  media: ["Journal du campus", "La Tribune", "Le Dossier", "À chaud"],
  agency: "Agence du campus",
  dispatches: [
    {
      id: "D01",
      title: "Consultation",
      text: "Les délégués souhaitent entendre des avis de toutes les classes.",
    },
  ],
  measures: Object.entries({
    P: [
      "Bibliothèque",
      "Tutorat",
      "Ateliers",
      "Club de lecture",
      "Salle calme",
    ],
    C: ["Préau", "Gradins", "Scène", "Tables", "Bancs"],
    E: ["Potager", "Haies", "Mare", "Compost", "Verger"],
    S: ["Garage vélo", "Navette", "Piétonnier", "Covoiturage", "Signalétique"],
  }).flatMap(([room, names]) =>
    names.map((title, i) => ({
      id: room + (i + 1),
      room,
      title,
      text: "Créer un projet « " + title + " » à l’école.",
      scores: [0, 0, -2, 2, 0],
      trends: ["—", "—", "↓", "↑", "—"],
      variants: [
        {
          id: room + (i + 1) + "-A",
          title: "Consultation",
          text: "Associer les délégués de classe à la conception.",
          scores: [0, 0, -2, 2, 2],
          trends: ["—", "—", "↓", "↑", "↑"],
        },
      ],
    })),
  ),
};
export function check(ok, msg = "Action indisponible") {
  if (!ok) throw new Error(msg);
}
export function validate(p) {
  check(
    p &&
      ["essai", "pilote", "autorisé"].includes(p.status) &&
      p.title &&
      p.version,
    "Version de scénario invalide",
  );
  const rooms = Object.keys(p.rooms);
  check(
    rooms.length && rooms.every((k) => /^[A-Z][A-Z0-9]{0,7}$/.test(k)),
    "Codes de commission invalides",
  );
  for (const list of [p.territories, p.lobbies, p.media])
    check(Array.isArray(list) && list.length, "Groupes manquants");
  const ids = new Set();
  for (const m of p.measures) {
    check(
      rooms.includes(m.room) && Array.isArray(m.variants),
      "Commission ou variantes invalides",
    );
    for (const v of [m, ...m.variants]) {
      check(
        /^[A-Z][A-Za-z0-9-]{0,30}$/.test(v.id) &&
          !ids.has(v.id) &&
          v.title &&
          v.text,
        "Identifiant ou texte invalide",
      );
      ids.add(v.id);
      check(
        v.scores?.length === 5 &&
          v.scores.every((n) => Number.isInteger(n) && Math.abs(n) <= 4) &&
          v.trends?.length === 5,
        "Profil incomplet",
      );
    }
  }
  check(
    rooms.every((k) => p.measures.filter((m) => m.room === k).length >= 2),
    "Deux mesures au moins par commission",
  );
  return p;
}
