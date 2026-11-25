# Parlement citoyen

Application francophone de séance pour Le Ludificateur. Le serveur attribue les rôles, instruit les commandes et construit une vue distincte pour chaque participant et écran. Une session conserve la version du scénario chargée à sa création.

## Essayer sur un ordinateur

Avec Node.js 22, lancer `npm start` puis ouvrir http://localhost:8080. La clé de création est disponible dans `.runtime/organisateur`. Le serveur local écoute sur la boucle locale et enregistre les parties dans `.runtime/`. Il fonctionne sans compte Firebase.

1. Choisir **Organiser une session → Préparer une journée**, saisir la clé et l’effectif. Sans fichier JSON, le scénario de répétition s’ouvre. Pour le pilote, importer le fichier privé Urgence Citoyenne fourni à la régie.
2. En régie, déplier **Accès et présences**. Distribuer chaque accès individuellement. Le CSV contient aussi les accès adultes. Utiliser **Ouvrir cet accès** pour essayer plusieurs rôles dans des onglets séparés.
3. En préparation, vérifier les affectations. **Ouvrir le Parlement** débloque la négociation. Dans **Régie → Régies des commissions**, choisir la salle à piloter. Chaque animateur dispose aussi d’un accès personnel qui ouvre directement le pupitre de sa salle. **Ouvrir l’écran de projection** lance le lecteur dans un autre onglet. Déplacer cet onglet sur le projecteur. Chaque page tient dans la fenêtre. Le bouton **Plein écran** permet aussi de masquer les barres du navigateur.
4. Dans **Conduire la séance**, la prochaine action est indiquée par son nom. Débattre sur la proposition déjà à l’écran. Si un amendement est admis, le présenter, puis ouvrir son vote. Les élèves habilités choisissent sur leur appareil et enregistrent leur bulletin. **Clore le vote** arrête les réponses. **Annoncer et projeter le résultat** révèle la décision à la salle. Après les propositions et les amendements, ouvrir le vote qui désigne les deux finalistes. Les commandes manuelles et le minuteur restent accessibles dans **Choisir un texte ou un vote**.
5. Une fois les deux finalistes de chaque salle annoncés, choisir **Piloter la plénière** en régie générale, ou utiliser l’accès personnel de la présidence. Présenter chaque finaliste et sa clause adoptée, le cas échéant. Comparer les deux textes, ouvrir le vote de tous les citoyens présents, le clore puis en annoncer le résultat. Le texte retenu reste à l’écran jusqu’au prochain geste de la présidence. Après les duels, ouvrir le débriefing pour projeter le plan adopté, les indicateurs et le journal du futur.

### Vote, influence et cartes des joueurs

Chaque citoyen a un onglet **Vote** pour son bulletin ou l’état du scrutin et un onglet **Influence** pour ses offres. Un lobby peut ouvrir **Mon groupe → Scanner une carte de visite**, lire la carte d’un citoyen, puis choisir la mesure et confirmer l’offre. Le citoyen peut accepter ou refuser dans son interface.

Chaque joueur retrouve ses deux QR dans **Ma carte**. La carte de visite partage l’identité de jeu. Le bouton **Afficher mon QR d’accès privé** révèle le code personnel qui permet de reprendre ce rôle. Dans **Accès et présences**, la régie imprime séparément les cartes de visite à montrer et les accès privés à remettre aux joueurs.


## Scénarios

Le scénario public de répétition porte sur l’école. Les données internes d’Urgence citoyenne sont distribuées séparément. Ne pas placer le fichier pilote, les accès ou une sauvegarde dans Git ou dans le dossier Hosting. Seule la régie peut télécharger et éditer la copie intégrale. Une nouvelle session adopte la version importée. Les points des profils utilisent des entiers doublés. Les tendances qualitatives sont saisies séparément.

## Vérification

- `npm test` exécute les essais du moteur avec Node.js 22 ou supérieur.
- Pour la persistance, installer les dépendances avec `npm ci --prefix functions` puis exécuter `firebase emulators:exec --project demo-parlement --only firestore "npm test"`. Le test Firestore est ignoré lorsque l’émulateur est absent.
- Les essais vérifient les affectations, les rôles, la majorité stricte, les refus et plafonds d’influence, le départage, le vote papier, la presse et un parcours jusqu’au plan national. Le test d’intégration envoie les actions de 150 élèves dans quatre salles, avec un renvoi de bulletin et des ouvertures concurrentes d’article.

## Firebase

La configuration cible Hosting, Cloud Functions v2 et Cloud Firestore. Le point d’entrée HTTPS utilise le SDK Admin. Les règles interdisent l’accès Firestore direct depuis les appareils. Le profil de scénario est conservé séparément de l’état mutable. Les mutations concurrentes sont regroupées dans des transactions. Une commande rejetée conserve son propre périmètre d’annulation. Les émargements ne contiennent aucun choix individuel.

Pour la publication finale, utiliser un projet Firebase dédié, sa base Firestore et le secret **PARLEMENT_ADMIN_KEY** pour la création de sessions. La fonction est configurée dans **europe-west1**. Le dépôt ne contient aucun identifiant de projet réel et aucun workflow de déploiement automatique.

## Reprise

Le rafraîchissement après une coupure restitue la confirmation de participation. Un bulletin renvoyé est idempotent. Les incidents peuvent conduire à suspendre, reprendre ou invalider une urne. Le secours papier exige une nouvelle urne commune à voix égales, deux adultes pour compter et un motif consigné.

Avec un compte technique habilité, `node functions/backup.mjs save PROJET SESSION private/session.json` sauvegarde une session Firestore. La commande `restore` utilise le même format et exige que la session soit absente du projet de destination. La sauvegarde inclut les données privées et les informations nécessaires à la récupération des accès.

## Périmètre de recette

L’essai sur émulateur ne mesure pas le réseau de l’établissement. Prévoir la lecture depuis le dernier rang, la distribution et récupération des accès, les arbitrages pour petits effectifs et la relecture pédagogique en salle. Les médias audiovisuels du pilote ne sont pas inclus. Le texte du journal constitue le support disponible pour la répétition.
