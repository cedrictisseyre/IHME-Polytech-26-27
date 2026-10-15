export const VERSION = 'seance-1-bilan-v2';
export const UNKNOWN = 'D';

export const questions = [
  {
    id: 1, domain: 'Architecture web',
    title: 'Dans notre application de réservation, quelle répartition des rôles correspond au cours ?',
    choices: ['PostgreSQL affiche les boutons, React conserve les réservations et Node.js ouvre le navigateur.', 'React affiche l’interface, Node.js / Express traite les demandes et PostgreSQL conserve les données.', 'React assure seul l’interface, les règles et la conservation des données.'],
    correct: 'B', explanation: 'Les trois couches ont des responsabilités distinctes : présentation avec React, traitements métier avec Node.js / Express et données avec PostgreSQL.'
  },
  {
    id: 2, domain: 'HTTP et API',
    title: 'L’interface veut obtenir la liste des salles auprès de l’API. Quelle requête correspond à cette intention ?',
    choices: ['GET /api/salles', 'POST /api/reservations', 'Une commande qui efface les salles avant de les afficher.'],
    correct: 'A', explanation: 'GET /api/salles demande la lecture des salles. Le serveur peut répondre avec le statut 200 et une liste JSON. POST /api/reservations sert à créer une réservation.'
  },
  {
    id: 3, domain: 'Données relationnelles',
    title: 'Une réservation contient un salle_id qui fait référence à la table des salles. Que garantit une clé étrangère ?',
    choices: ['Que deux salles ne peuvent jamais avoir le même nom.', 'Que toutes les salles ont la même capacité.', 'Que la salle référencée par la réservation existe.'],
    correct: 'C', explanation: 'Une clé étrangère relie des tables et protège leur cohérence : salle_id doit correspondre à une salle existante. La clé primaire identifie, elle, chaque ligne de façon unique.'
  },
  {
    id: 4, domain: 'SQL',
    title: 'On veut afficher chaque réservation avec le nom de sa salle, stocké dans une autre table. À quoi sert une jointure SQL ?',
    choices: ['À associer les lignes des deux tables grâce à leur lien.', 'À changer la couleur des boutons de l’interface.', 'À remplacer toutes les réservations par une seule ligne.'],
    correct: 'A', explanation: 'Une jointure associe les réservations aux salles, par exemple avec s.id = r.salle_id. On peut ainsi lire le nom de la salle sans le recopier dans chaque réservation.'
  },
  {
    id: 5, domain: 'Validation',
    title: 'React vérifie déjà les champs du formulaire. Le serveur doit-il aussi vérifier les données reçues ?',
    choices: ['Non, le navigateur garantit toujours des données valides.', 'Oui, car les contrôles du navigateur peuvent être contournés.', 'Non, il suffit d’afficher un message de confirmation.'],
    correct: 'B', explanation: 'L’interface aide à saisir, mais le serveur doit vérifier les types et les règles métier. PostgreSQL ajoute ses propres contraintes, comme une fin strictement après le début.'
  },
  {
    id: 6, domain: 'Algorithmique',
    title: 'Quelle différence entre un algorithme et un programme a été présentée pendant la séance ?',
    choices: ['Un algorithme est un logiciel installé ; un programme est une adresse web.', 'Il faut choisir un langage avant de pouvoir réfléchir à une méthode.', 'Un algorithme décrit une méthode précise ; un programme l’exprime dans un langage exécutable.'],
    correct: 'C', explanation: 'On peut d’abord exprimer une méthode de résolution et ses règles sans écrire de code. Le programme en est la traduction dans un langage exécutable.'
  },
  {
    id: 7, domain: 'Règle métier et tests',
    title: 'Une salle est réservée de 10 h à 11 h. Selon la convention du cours, peut-on réserver cette même salle de 11 h à 12 h ?',
    choices: ['Oui : les créneaux se touchent sans se chevaucher.', 'Non : partager l’heure de 11 h crée toujours un conflit.', 'Oui, mais uniquement si les deux réservations ont le même identifiant.'],
    correct: 'A', explanation: 'Le moment de fin est exclu : les créneaux adjacents sont autorisés. Ce cas de contact est un test utile ; utiliser <= au lieu de < dans la règle présentée le refuserait à tort.'
  },
  {
    id: 8, domain: 'JavaScript et outils',
    title: 'Que permet Node.js dans l’architecture étudiée ?',
    choices: ['De remplacer PostgreSQL pour conserver automatiquement toutes les données.', 'De transformer GitHub en navigateur web.', 'D’exécuter JavaScript côté serveur, notamment pour faire fonctionner Express.'],
    correct: 'C', explanation: 'JavaScript s’exécute dans le navigateur pour l’interface, et dans Node.js côté serveur. Les environnements proposent des API différentes. Express organise les routes et traitements du serveur.'
  },
  {
    id: 9, domain: 'Docker',
    title: 'Quelle différence entre une image Docker et un conteneur ?',
    choices: ['Une image contient uniquement des photos ; un conteneur contient le code.', 'L’image est un modèle construit ; le conteneur est une instance en cours d’exécution.', 'Un conteneur est l’historique Git de l’image.'],
    correct: 'B', explanation: 'Le Dockerfile est la recette, l’image est le modèle construit avec les dépendances et le conteneur en exécute une instance isolée. Compose décrit les services, leur configuration et les volumes.'
  },
  {
    id: 10, domain: 'Persistance',
    title: 'On recrée le conteneur PostgreSQL. Que faut-il avoir prévu pour retrouver les réservations ?',
    choices: ['Laisser un onglet du navigateur ouvert.', 'Copier les réservations dans le nom de l’image Docker.', 'Un volume de données persistant conservé lors de la recréation.'],
    correct: 'C', explanation: 'Le volume a un cycle de vie distinct de celui du conteneur. Les données PostgreSQL doivent y être stockées et le volume réutilisé, sans le supprimer lors du remplacement du conteneur.'
  },
  {
    id: 11, domain: 'Git et GitHub',
    title: 'Vous avez créé un commit avec Git sur votre ordinateur. Quelle action envoie ce commit vers le dépôt distant sur GitHub ?',
    choices: ['git push', 'git add', 'Fermer puis rouvrir VS Code.'],
    correct: 'A', explanation: 'git add prépare les changements dans l’index, git commit les enregistre dans le dépôt local et git push les envoie vers le dépôt distant. Git et GitHub ne sont pas la même chose.'
  },
  {
    id: 12, domain: 'Développer avec l’IA',
    title: 'Quelle démarche correspond au travail avec Copilot présenté pendant la séance ?',
    choices: ['Demander « fais une application » puis accepter les fichiers sans les lire.', 'Préciser le contexte, les règles, les entrées et le résultat attendu, puis relire et tester la proposition.', 'Vérifier seulement que la page s’ouvre, sans tester les réservations.'],
    correct: 'B', explanation: 'Une consigne vérifiable précise le besoin et les cas attendus. Il faut ensuite comprendre et relire les changements, puis tester les règles, notamment les contacts et chevauchements : une application qui démarre n’est pas forcément correcte.'
  }
].map(question => ({ ...question, choices: [...question.choices, 'Je ne sais pas.'].map((label, index) => ({ key: String.fromCharCode(65 + index), label })) }));

export function publicQuestionnaire() {
  return { version: VERSION, questions: questions.map(({ id, domain, title, choices }) => ({ id, domain, title, choices })) };
}
