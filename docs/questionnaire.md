# Bilan des acquis après la séance 1

Public : étudiants de master ou de dernière année d’école d’ingénieurs, débutants en développement web. Objectif : évaluer ce qui a été retenu de la séance 1 et repérer les notions à reprendre, sans note ni classement.

Source pédagogique : `Seance_1_Diaporama.pptx`, 37 diapositives, fourni par l’enseignant. Les questions suivent le fil conducteur des réservations de salles ; elles ne nécessitent pas d’écrire du code. Aucune question ne suppose qu’un déploiement en production a déjà été réalisé.

## Formulaire simplifié

Trois étapes : coordonnées, questions, vérification avant envoi. Seuls le nom, le prénom et l’e-mail universitaire sont demandés. Suppression du téléphone, du parcours, des attentes, des projets et de l’autoévaluation des outils.

## Les douze questions

Une seule réponse parmi A, B, C et D ; D signifie toujours « Je ne sais pas ». Durée indicative : huit minutes, sans aide extérieure. Les choix et corrigés complets sont définis dans [questionnaire.js](../backend/src/questionnaire.js). Le navigateur ne reçoit les bonnes réponses et explications qu’après la sauvegarde de la soumission.

| Nº | Question | Diapositives de référence |
| --- | --- | --- |
| 1 | Dans notre application de réservation, quelle répartition des rôles correspond au cours ? | 7, 11 |
| 2 | L’interface veut obtenir la liste des salles auprès de l’API. Quelle requête correspond à cette intention ? | 8–10 |
| 3 | Une réservation contient un salle_id qui fait référence à la table des salles. Que garantit une clé étrangère ? | 13–15 |
| 4 | On veut afficher chaque réservation avec le nom de sa salle, stocké dans une autre table. À quoi sert une jointure SQL ? | 16 |
| 5 | React vérifie déjà les champs du formulaire. Le serveur doit-il aussi vérifier les données reçues ? | 17 |
| 6 | Quelle différence entre un algorithme et un programme a été présentée pendant la séance ? | 19 |
| 7 | Une salle est réservée de 10 h à 11 h. Selon la convention du cours, peut-on réserver cette même salle de 11 h à 12 h ? | 20–21, 36 |
| 8 | Que permet Node.js dans l’architecture étudiée ? | 23–24 |
| 9 | Quelle différence entre une image Docker et un conteneur ? | 27–29 |
| 10 | On recrée le conteneur PostgreSQL. Que faut-il avoir prévu pour retrouver les réservations ? | 12, 28–29 |
| 11 | Vous avez créé un commit avec Git sur votre ordinateur. Quelle action envoie ce commit vers le dépôt distant sur GitHub ? | 31–32 |
| 12 | Quelle démarche correspond au travail avec Copilot présenté pendant la séance ? | 34–36 |

## Restitution

Après sauvegarde complète, l’étudiant voit son choix, la réponse attendue et une explication pour chaque question, sans score individuel. L’enseignant voit les effectifs et pourcentages agrégés, en distinguant erreurs et incertitudes, avec une actualisation toutes les dix secondes. Les noms, prénoms et e-mails restent dans un onglet confidentiel.

La version du bilan est `seance-1-bilan-v2`. Les anciens champs de profil sont supprimés du schéma par [002_simplified_profile.sql](../backend/sql/002_simplified_profile.sql) au démarrage. Ce changement est destiné à l’application locale encore sans soumissions, pas à une migration de données de production.
