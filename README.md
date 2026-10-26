# Bilan des acquis de la séance 1

Application en français pour un groupe de master ou de dernière année d’école d’ingénieurs, débutant en développement web. Après la première séance, elle permet de repérer les acquis et les notions à revoir avant de poursuivre la création d’une application avec l’IA et Docker.

Le questionnaire s’appuie sur les 37 diapositives de `Seance_1_Diaporama.pptx` et le fil conducteur des réservations de salles. Douze questions de compréhension, sans code à écrire : architecture, HTTP / API, clés étrangères, jointures SQL, validation, algorithmes, créneaux adjacents, Node.js, Docker et volumes, Git / GitHub, consignes et revue de l’IA. Voir [le questionnaire](docs/questionnaire.md).

## Fonctionnalités

- Formulaire en trois étapes : coordonnées, douze questions, vérification avant envoi.
- Seules informations personnelles demandées : nom, prénom et e-mail universitaire, obligatoires. Aucun téléphone, parcours, profil d’outils ou commentaire collecté.
- Une réponse par question, dont « Je ne sais pas ». Diagnostic non noté, sans score individuel ni classement.
- Corrigé expliqué reçu uniquement après la validation et la sauvegarde transactionnelle de toute la soumission.
- Espace enseignant protégé : nombre de réponses, répartition de chaque choix, réponses correctes / incorrectes / inconnues. Actualisation toutes les dix secondes.
- Les noms, prénoms et e-mails des participants se consultent dans un onglet confidentiel, distinct de la vue agrégée à projeter.

## Architecture

Le [diagramme entité-relation de la base](docs/diagramme-bdd.md) décrit les tables, clés et règles de conservation.

```text
Navigateur (React, fichiers préparés par Vite)
                  │ HTTP, même origine
                  ▼
        app : Node.js / Express
                  │ SQL paramétré avec pg
                  ▼
        db : PostgreSQL + volume persistant
```

En production, Express sert à la fois le frontend compilé et l’API. Pas d’ORM : les requêtes sont explicites dans [repository.js](backend/src/repository.js), [session-store.js](backend/src/session-store.js) et [database.js](backend/src/database.js). Le schéma SQL est dans [001_initial.sql](backend/sql/001_initial.sql). Il est initialisé au démarrage, sous verrou transactionnel ; plusieurs instances peuvent démarrer simultanément.

Les bonnes réponses et explications sont exclusivement dans le backend et PostgreSQL. `GET /api/questionnaire` projette uniquement les énoncés et les choix. Aucun fichier backend n’est servi comme contenu statique. Le frontend ne reçoit pas de corrigé à l’ouverture ; `POST /api/submissions` le renvoie après `COMMIT`. Il n’existe pas de route publique de lecture du corrigé. Le formulaire utilise un identifiant de tentative et une session pour autoriser un réessai identique après une coupure réseau, sans dupliquer la réponse ni permettre la lecture du corrigé d’un autre étudiant.

Le passage au bilan est destiné à la version locale encore sans soumissions. Au démarrage, [002_simplified_profile.sql](backend/sql/002_simplified_profile.sql) supprime les anciens champs de profil de la base ; les nouvelles soumissions ne contiennent que les trois champs d’identité et les réponses, avec les métadonnées techniques nécessaires. Ne pas appliquer cette suppression à une ancienne base contenant des profils à conserver sans préparer leur sauvegarde.

## Lancement rapide avec Docker Compose

Prérequis : Node.js 24 et npm pour configurer les secrets, Docker Engine ou Docker Desktop avec Docker Compose v2 pour lancer les services.

```sh
npm ci
npm run configure
docker compose up -d --build
docker compose ps
```

`npm run configure` demande les domaines universitaires autorisés, votre adresse de contact et le mot de passe enseignant (12 caractères minimum, saisie masquée). Il crée `.env` avec un mot de passe PostgreSQL aléatoire, un secret de session aléatoire et un mot de passe enseignant haché avec scrypt. Il refuse d’écraser un `.env` existant. Aucun secret réel n’est versionné.

- Étudiants : `http://localhost:43187`.
- Enseignant : `http://localhost:43187/enseignant`.
- Identifiant par défaut : `enseignant` ; mot de passe choisi pendant la configuration.

La base n’expose aucun port vers l’extérieur. Les données restent dans le volume nommé `postgres_data`. L’application fonctionne avec un utilisateur non privilégié et un système de fichiers en lecture seule.

Pour vérifier l’état ou arrêter :

```sh
docker compose logs app
docker compose logs db
docker compose down
```

`down` conserve le volume. **Ne pas ajouter `-v` pour un simple arrêt : cela supprime les données.** Ne changez pas le mot de passe de PostgreSQL dans `.env` sans aussi le modifier dans une base déjà initialisée.

## Séances en direct et reconnexion des étudiants

Le bilan initial reste disponible sans compte. Le nouveau mode ne modifie ni ses questions ni ses réponses existantes.

1. Connectez-vous à l’espace enseignant, puis ouvrez **Séances en direct**.
2. Créez une séance et communiquez le code de huit caractères au groupe.
3. Les étudiants ouvrent **Séance en direct** dans le menu (`/seance`, ou `/ihme/seance` avec le préfixe), créent leur compte avec prénom, nom, e-mail universitaire et un mot de passe d’au moins dix caractères, puis saisissent le code.
4. Préparez un brouillon avec trois choix, la bonne réponse et une explication. « Je ne sais pas » est ajouté automatiquement. L’éditeur est confidentiel : ne le projetez pas.
5. Cliquez sur **Diffuser**. La question apparaît chez les inscrits à la prochaine actualisation (toutes les dix secondes). Diffuser une nouvelle question clôture automatiquement la précédente ; vous pouvez aussi la clôturer manuellement.
6. Chaque étudiant répond une fois ; son corrigé apparaît seulement après sauvegarde. Les compteurs par choix sont actualisés dans la vue enseignante. Les corrigés enseignant sont masqués par défaut pour la projection.
7. Après déconnexion ou sur un autre appareil, l’étudiant se reconnecte avec son e-mail et son mot de passe : il retrouve ses séances et ses réponses, sans ressaisir son identité.

Les sessions navigateur sont stockées dans PostgreSQL et expirent après huit heures sans activité. Fermer puis rouvrir la page conserve la connexion tant que le cookie et la session sont valides. Ne pas utiliser un navigateur partagé sans se déconnecter. La connexion enseignante et la connexion étudiante utilisent la même session navigateur : tester les deux rôles avec des navigateurs ou profils distincts.

**Sécurité et limites :** connaître l’e-mail seul ne suffit pas pour se reconnecter. Les mots de passe sont hachés avec scrypt. Les domaines configurés sont contrôlés à l’inscription, mais aucun e-mail de vérification n’est envoyé : l’identité reste déclarative. Ne jamais demander le mot de passe universitaire. Il n’existe pas encore de récupération de mot de passe par e-mail. Les anciens bilans sans compte ne sont pas automatiquement revendiqués par une inscription utilisant le même e-mail. Le mode direct est non noté.

La migration additive `003_live_classrooms.sql` s’applique au démarrage, sans supprimer les réponses existantes. Aucune nouvelle variable ni dépendance n’est nécessaire. Après sauvegarde habituelle de la base, mettre à jour l’application avec `docker compose -p ihme up -d --build --no-deps --wait app`. Avec Caddy dans un projet séparé sur le réseau `proxy`, ajouter `-f compose.yaml -f compose.proxy.yaml` comme indiqué dans la section d’installation sous `/ihme`. Ne pas supprimer le volume PostgreSQL. La configuration sous `/ihme` reste valable.

La purge utilise `RETENTION_DAYS` (90 par défaut) : comptes sans connexion/lecture du profil depuis ce délai, séances dépassant ce délai et réponses anciennes. Une séance supprimée entraîne la suppression de ses réponses même si un étudiant s’est reconnecté récemment. Consultez le diagramme pour les cascades exactes.

## Variables de configuration

[.env.example](.env.example) répertorie les variables. Les valeurs exemples ne permettent volontairement pas de démarrer sans configuration des secrets.

| Variable | Usage |
| --- | --- |
| `PUBLIC_ORIGIN` | Origine exacte de la page utilisée par les visiteurs, par exemple `https://diagnostic.example.org`. Aucune barre finale ni chemin. |
| `ADDITIONAL_PUBLIC_ORIGINS` | Autres origines autorisées pour les écritures, séparées par des virgules, sans chemin. Même protocole que `PUBLIC_ORIGIN`. Vide par défaut. |
| `APP_BASE_PATH` | Sous-chemin optionnel, par exemple `/ihme`, sans barre finale. Vide pour servir à la racine. Utilisé à la compilation Vite et par Express : reconstruire l’image après modification. |
| `APP_PORT` | Port exposé par Compose, 43187 par défaut. Adapter aussi `PUBLIC_ORIGIN` si ce port change. |
| `APP_BIND_ADDRESS` | Adresse d’exposition Compose, `127.0.0.1` par défaut pour les tests locaux. Utiliser `0.0.0.0` uniquement pour un accès réseau volontaire. |
| `PORT` | Port d’écoute Express hors Compose. Compose fixe 3000 à l’intérieur du conteneur. |
| `DATABASE_URL` | URL PostgreSQL pour le lancement Node direct ; Compose la construit avec l’hôte interne `db`. |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | Initialisation PostgreSQL dans Compose. Le script génère un mot de passe hexadécimal compatible avec l’URL. |
| `DATABASE_SSL`, `DATABASE_CA_FILE` | TLS vers une base externe ; vérification du certificat activée. Chemin du certificat d’autorité si nécessaire. |
| `TEACHER_USERNAME`, `TEACHER_PASSWORD_HASH` | Identifiant enseignant et hachage scrypt. Garder les guillemets simples du hash dans `.env` pour préserver les caractères `$` avec Compose. |
| `SESSION_SECRET` | Secret aléatoire de signature, au moins 32 caractères. Le changer invalide les sessions. |
| `COOKIE_SECURE` | `false` pour HTTP local, `true` pour HTTPS en ligne. |
| `TRUST_PROXY` | Nombre de reverse proxies de confiance, 0 par défaut. Ne pas activer sans vérifier la topologie et le filtrage des en-têtes. |
| `UNIVERSITY_EMAIL_DOMAINS` | Domaines exacts autorisés, séparés par des virgules. Définir ceux de votre promotion ; les sous-domaines ne sont pas autorisés implicitement. |
| `PRIVACY_CONTACT` | Contact de l’enseignant ou du responsable du recueil, affiché aux étudiants. |
| `RETENTION_DAYS` | Durée avant purge, 90 jours par défaut, de 1 à 365. À adapter à la finalité du module. |

Le contrôle du domaine ne prouve pas que la personne possède l’adresse. Il n’y a pas de vérification par e-mail ni de connexion institutionnelle dans cette première version. Une seule réponse est acceptée par e-mail normalisé et version du questionnaire.

## Développement hors Docker

```sh
npm ci
npm run configure
```

Préparez une base PostgreSQL et ajustez `DATABASE_URL`. Pour utiliser le serveur Vite, définissez `PUBLIC_ORIGIN=http://localhost:5173`, puis lancez deux terminaux :

```sh
npm run dev:api
```

```sh
npm run dev:web
```

Ouvrez `http://localhost:5173`. Vite relaie `/api` vers Express sur le port 3000. PostgreSQL doit être accessible via l’URL configurée. Pour utiliser la base Compose localement, ajoutez un port de base uniquement sur `127.0.0.1` dans un fichier d’override local, ou utilisez votre base de développement habituelle ; ne publiez pas PostgreSQL sur Internet.

Pour servir le build sans Vite, rétablissez `PUBLIC_ORIGIN=http://localhost:3000` :

```sh
npm run build
npm start
```

## Vérifications

```sh
npm test
npm run build
```

Les tests unitaires contrôlent notamment les douze questions, l’absence de corrigés publics, les trois champs d’identité, le refus des anciens champs de profil, les domaines et les mots de passe.

Pour les tests d’intégration, préparez une instance PostgreSQL de test et indiquez sa connexion :

```sh
TEST_DATABASE_URL=postgresql://utilisateur:motdepasse@localhost:5432/diagnostic_test npm run test:integration
```

Ils créent puis suppriment un schéma isolé aléatoire, sans toucher aux autres schémas. Le compte de test doit pouvoir créer un schéma. Tests : CSRF, authentification, confidentialité, soumission complète, rollback, agrégats, réessai après coupure, concurrence, injections SQL, purge et version du questionnaire. Sans `TEST_DATABASE_URL`, le test PostgreSQL est explicitement ignoré.

## Déploiement Docker sur Jelastic / Infomaniak

L’application est livrée comme une image Docker standard et une base PostgreSQL distincte. Le déploiement local est décrit par Compose ; **ne supposez pas que votre environnement Jelastic importe directement ce fichier**. Les noms des écrans et options dépendent de l’offre et de votre environnement.

1. Construisez et publiez l’image sur un registre auquel votre environnement a accès. Adaptez les noms ci-dessous :

   ```sh
   docker buildx build --platform linux/amd64 -t votre-registre/diagnostic:1.0.0 --push .
   ```

   Vérifiez l’architecture du nœud cible, notamment depuis un Mac ARM. Utilisez un registre privé si nécessaire et configurez ses identifiants dans l’hébergement, jamais dans le dépôt.

2. Préparez un service PostgreSQL, un stockage persistant et une stratégie de sauvegarde. Utilisez un compte dédié ; ne rendez pas la base accessible publiquement.
3. Déployez l’image de l’application avec le port interne 3000. Les fichiers React compilés sont déjà inclus.
4. Définissez les variables d’environnement du backend : `DATABASE_URL` vers votre PostgreSQL, `PUBLIC_ORIGIN`, `TEACHER_USERNAME`, `TEACHER_PASSWORD_HASH`, `SESSION_SECRET`, domaines universitaires et notice de confidentialité. Les variables `POSTGRES_*` de Compose ne configurent pas à elles seules une base Jelastic existante.
5. Configurez HTTPS, `COOKIE_SECURE=true` et le nombre exact de proxies de confiance via `TRUST_PROXY`. Pour une base externe exigeant TLS, configurez `DATABASE_SSL=true` et son autorité de certification si nécessaire. Ne désactivez pas la validation du certificat.
6. Vérifiez `/api/health`, le formulaire, une soumission d’essai, les agrégats et la déconnexion enseignant. Vérifiez la persistance après remplacement du conteneur.

L’application doit pouvoir créer ses tables et index au premier démarrage. Le déploiement sur votre compte Infomaniak n’est pas automatisé ici : aucun accès à ce compte n’est nécessaire au fonctionnement local.

## Installation sous `/ihme` sur le serveur existant

L’adresse prévue est `https://csbgestion.jcloud-ver-jpe.ik-server.com/ihme/`. Le préfixe fait partie des routes Express, des liens React et des chemins des fichiers compilés. L’origine publique ne contient pas ce préfixe.

Après publication des changements sur Git et récupération dans `/home/ihme`, modifier uniquement les paramètres correspondants dans le `.env` du serveur, sans régénérer les secrets :

```dotenv
APP_BASE_PATH=/ihme
PUBLIC_ORIGIN=https://csbgestion.jcloud-ver-jpe.ik-server.com
COOKIE_SECURE=true
APP_BIND_ADDRESS=127.0.0.1
APP_PORT=43187
UNIVERSITY_EMAIL_DOMAINS=etu.univ-amu.fr,univ-amu.fr
```

Si Caddy est le proxy de confiance qui contacte directement Express, régler `TRUST_PROXY=1`. Si le trajet diffère, déterminer ce réglage avant l’ouverture publique. Le dernier proxy doit transmettre correctement le protocole HTTPS d’origine ; les cookies sécurisés ne seront pas créés si Express ne reconnaît pas HTTPS. Ne pas ouvrir un accès direct non filtré qui permettrait d’usurper les en-têtes de proxy.

Avec Caddy dans son propre projet sur le réseau Docker existant `proxy`, utiliser le complément [compose.proxy.yaml](compose.proxy.yaml). Il raccorde uniquement l’application à ce réseau, avec l’alias stable `ihme-app`, tout en conservant son accès à la base sur le réseau par défaut. PostgreSQL n’est pas raccordé à `proxy`. Vérifier que le réseau existe avec `docker network inspect proxy` ; ne pas recréer le projet Caddy.

Construire et recréer uniquement l’application, sans arrêter les autres projets ni recréer la base (déjà démarrée) :

```sh
cd /home/ihme
git pull --ff-only origin main
docker compose -p ihme -f compose.yaml -f compose.proxy.yaml config --quiet
docker compose -p ihme -f compose.yaml -f compose.proxy.yaml up -d --build --no-deps --wait app
docker compose -p ihme -f compose.yaml -f compose.proxy.yaml ps
curl --fail http://127.0.0.1:43187/ihme/api/health
```

Conserver les deux options `-f` pour les prochains déploiements : une recréation avec le seul fichier principal retire le raccordement au réseau partagé. Le lancement local habituel reste inchangé et ne nécessite pas le réseau `proxy`.

L’enseignant gère la configuration de Caddy séparément. Sa cible interne doit être `ihme-app:3000`, pas `127.0.0.1:43187`. Le contrat attendu est de transmettre `/ihme/…` à l’application **sans supprimer le préfixe** (`handle`, pas `handle_path`). Un routage qui retire `/ihme` serait incompatible. `/ihme` redirige vers `/ihme/` ; l’espace enseignant est sous `/ihme/enseignant`. Si nécessaire, le proxy peut effectuer lui-même la redirection de l’adresse sans barre finale.

Pour rétablir temporairement le raccordement d’un conteneur existant sans le recréer, exécuter sur le serveur `docker network connect --alias ihme-app proxy ihme-app-1`, uniquement s’il n’est pas déjà raccordé. Cette modification manuelle ne remplace pas le complément Compose pour les recréations futures. Si l’image Caddy contient `wget`, vérifier depuis son conteneur :

```sh
docker exec caddy-csb wget -qO- http://ihme-app:3000/ihme/api/health
```

Le résultat attendu est `{"status":"ok"}`. Si le contrôle local et ce contrôle réussissent mais que l’adresse publique renvoie encore une erreur 502, vérifier la cible et les journaux dans le projet Caddy séparé.

Le port publié sur `127.0.0.1` est accessible depuis l’hôte Docker. Depuis un conteneur Caddy, `127.0.0.1` désigne ce conteneur, pas l’hôte : utiliser un raccordement réseau adapté, par exemple un réseau Docker partagé avec l’application, mais pas avec la base. Ne pas modifier l’adresse d’écoute à `0.0.0.0` sans avoir prévu le filtrage et la confiance des proxies.

Contrôles après raccordement : charger le formulaire et ses fichiers CSS / JavaScript, ouvrir `/ihme/enseignant`, se connecter, soumettre une réponse de test et vérifier le tableau de bord. Le contrôle de santé HTTP local valide le serveur et la base, pas la création des cookies HTTPS. Changer `APP_BASE_PATH` impose toujours une nouvelle compilation ; un simple redémarrage ne suffit pas.

### Accès simultané sur les deux domaines

La même application et la même base peuvent servir ces deux adresses :

- `https://csbgestion.jcloud-ver-jpe.ik-server.com/ihme/`
- `https://gestion.tenshodojo.fr/ihme/`

Dans le `.env` du serveur, conserver les secrets et définir :

```dotenv
APP_BASE_PATH=/ihme
PUBLIC_ORIGIN=https://csbgestion.jcloud-ver-jpe.ik-server.com
ADDITIONAL_PUBLIC_ORIGINS=https://gestion.tenshodojo.fr
COOKIE_SECURE=true
```

Reconstruire l’application avec la commande Compose ci-dessus. La liste autorise les écritures depuis les deux origines avec la protection CSRF habituelle.

Dans le Caddyfile existant, ajouter ces règles **dans chacun des deux blocs de domaine**, avant le routage de l’autre application. Conserver les autres routes :

```caddyfile
redir /ihme /ihme/ 308
handle /ihme/* {
    reverse_proxy ihme-app:3000
}
```

Le DNS de chaque domaine doit pointer vers l’entrée qui dessert Caddy et HTTPS doit fonctionner pour chacun. Valider le Caddyfile avant de recharger Caddy. Ne pas remplacer les blocs existants : d’autres applications peuvent utiliser ces domaines.

Les données et les comptes sont communs. Les cookies restent propres à chaque domaine : il faut se connecter séparément sur chaque adresse. Les liens et appels API utilisent le préfixe `/ihme` sur le domaine ouvert.

## Données personnelles et exploitation

La notice affiche la finalité, le contact et la durée de conservation avant l’envoi. Seuls le nom, le prénom et l’e-mail universitaire sont collectés avec les réponses. Ces informations personnelles ne figurent pas dans les agrégats. Le navigateur ne garde pas de copie en stockage local ; une alerte prévient d’une fermeture avec un formulaire en cours. Le corrigé reste dans la mémoire de la page après soumission : recharger cette page ne le restaure pas.

Les soumissions expirées sont supprimées au démarrage et chaque heure, avec leurs réponses liées. Les sessions expirées sont également purgées. La limite de conservation peut donc être dépassée d’une heure lorsque l’application fonctionne en continu. Pour lancer une purge manuelle :

```sh
docker compose exec app node backend/scripts/purge.mjs
```

Pour répondre à une demande de suppression individuelle, utilisez un accès administrateur à PostgreSQL et une requête paramétrée sur `submissions` avec `version` et l’e-mail normalisé. La suppression cascade vers `answers`. Il n’y a pas de bouton de suppression dans cette première version.

Adaptez la notice aux règles de votre établissement, notamment pour le suivi pédagogique, la diffusion en classe et les sauvegardes. Les sauvegardes doivent suivre une politique de conservation distincte et être purgées selon cette politique.

### Sauvegarder et restaurer

```sh
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > sauvegarde.sql
```

Le fichier contient des données personnelles et des sessions : stockez-le dans un emplacement protégé et chiffré, hors du dépôt. La restauration doit être testée dans un environnement séparé avant toute opération sur la base de la séance.

### Sécurité et limites

- Sessions PostgreSQL persistantes, cookie `HttpOnly` / `SameSite=Strict` et `Secure` en HTTPS ; session renouvelée à la connexion enseignant.
- Protection CSRF par jeton de session et vérification de l’origine des écritures ; aucun CORS permissif.
- Requêtes SQL paramétrées, validation serveur, contraintes et transaction pour les douze réponses.
- Limitation des tentatives de connexion par IP et des soumissions par session étudiant, pour ne pas bloquer une classe partageant une adresse IP ; garde-fou global de 1200 requêtes par IP sur 15 minutes. En-têtes Helmet, aucune journalisation du contenu des formulaires.
- Les limites de fréquence sont en mémoire par instance. Un déploiement multi-instance à grande échelle nécessite un limiteur partagé ou une protection au niveau de l’entrée réseau.
- Les identités sont déclaratives : pour un diagnostic de classe, pas pour un examen ou une authentification institutionnelle.

## Faire évoluer le questionnaire

Les questions et les corrigés sont définis dans [questionnaire.js](backend/src/questionnaire.js). Si les énoncés, choix ou corrigés changent après une collecte, augmentez `VERSION` : les anciennes réponses restent associées à leurs anciennes questions. Le serveur refuse une modification silencieuse de la même version. Le tableau de bord affiche la version active, sans mélanger les promotions ou campagnes.
