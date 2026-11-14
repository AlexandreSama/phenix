# ADR-0014 : panneau de tickets à bouton unique

- **Date** : 2026-11-14
- **Statut** : proposé

## Contexte

Le panneau « Ouvrir un ticket » portait un bouton par type (1 à 5 types), puis un menu déroulant
(6 à 25). Avec plusieurs types, le message se remplit de boutons ; le membre doit aussi savoir lequel
choisir avant de comprendre ce qui lui sera demandé. Discord impose deux limites : un formulaire est figé une
fois affiché (ses champs ne dépendent pas d'un choix fait dedans), et son envoi ne peut pas être
suivi d'un autre formulaire.

## Décision

Le panneau n'a plus qu'**un seul bouton**, `ticket:open`, au texte réglé sur le site. Le clic répond par un
message visible du seul membre, avec le menu « Type de ticket » (`ticketTypeChoice`). Le choix d'un type
ouvre le formulaire de ses questions (réponse directe à l'interaction du menu), ou le salon s'il n'a pas de
question. Un serveur qui n'a qu'un type saute le menu.

Le menu `ticket:choose` et son handler sont ceux qui existaient déjà. Les anciens boutons
`ticket:open:<id>` et l'ancien menu du panneau continuent de fonctionner : les panneaux déjà postés
marchent jusqu'à leur prochaine publication, déclenchée par un enregistrement sur le site. Aucune migration.

## Options étudiées

- **A. Message visible du seul membre, puis formulaire (retenue).** Plus : le formulaire des questions s'ouvre au
  bon moment, un clic de plus seulement. Moins : le choix du type est un menu dans un message, pas un
  formulaire.
- **B. Formulaire de choix, puis bouton « Continuer », puis formulaire de questions.** Plus : le choix est
  dans un formulaire. Moins : un clic de plus et deux formulaires qui se suivent.
- **C. Un seul formulaire, type et questions réunis.** Plus : le plus court. Moins : les questions ne
  dépendent plus du type, ce qui retire son sens au réglage par type.
- **D. Garder un bouton par type.** Plus : aucun changement. Moins : le message se remplit avec le
  nombre de types.

## Conséquences

- Plus : un panneau propre quel que soit le nombre de types ; le code de l'ancien menu est réutilisé.
- Plus : une fois le ticket ouvert (ou refusé), le résultat remplace le menu (`deferUpdate`, puis
  `editReply` sans composants), qui ne reste pas dans le salon du panneau. Le message public du panneau
  n'est jamais modifié : seul un message éphémère est remplacé.
- Moins : tant que le membre n'a pas envoyé le formulaire, le menu reste affiché ; s'il ferme le
  formulaire puis reprend la même option, Discord peut ne pas renvoyer d'interaction, et il doit
  recliquer sur le bouton du panneau (non vérifié en conditions réelles).
- Neutre : le test « déjà un ticket ouvert » se fait après le choix du type, puisqu'il dépend de la
  catégorie du type.
- Retour en arrière : rétablir un bouton par type dans `ticketPanelMessage` ; les anciens boutons
  fonctionnent encore.

## Confirmation

`messages.test.ts`, `open.test.ts` et `publish.test.ts` dans `apps/bot/src/modules/tickets`, et
`ticket-panel-preview.test.tsx` côté web.
