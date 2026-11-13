# ADR-0012 : note de satisfaction sur le ticket

- **Date** : 2026-11-13
- **Statut** : proposé

## Contexte

Chaque ticket reçoit au plus une note, une seule réponse de son auteur. Les messages privés (MP) sont
parfois fermés, donc la demande peut échouer sans recours. On veut des moyennes par type de ticket et
par membre de l'équipe qui a pris le ticket en charge. La note touche deux personnes : l'auteur, qui
note, et le membre noté, dont la prise en charge est évaluée.

## Décision

Ajouter à `Ticket` les colonnes `rating` (contrainte `CHECK` de 1 à 5 en SQL) et `ratedAt`, ainsi que
`claimedById`, `claimedByName` et `claimedAt` pour la prise en charge.

- **Prise en charge** : définitive, réservée à l'équipe du type, jamais à l'auteur du ticket, et atomique
  (`updateMany` conditionnel).
- **Note** : écrite par un `updateMany` conditionnel (`ownerId`, ticket `CLOSED`, `rating` nul, fenêtre de
  7 jours). Elle est demandée par MP, avec 5 boutons, après toute fermeture sauf si le salon est supprimé.
- **Anti-manipulation** : pas de MP de notation quand l'auteur ferme lui-même le ticket moins de 10
  minutes après la prise en charge.
- **Libellé du MP fidèle** : la note n'est **pas anonyme**, elle est **pseudonymisée** (stockée avec
  l'auteur et le membre noté). Le MP ne promet aucun anonymat.
- **MP refusé** (code 50007) : seulement journalisé, sans identifiant.
- **Restitution** : moyennes uniquement, jamais la note d'un ticket.
  - Seuil de **5 notes** : en dessous, la moyenne est masquée (`maskRatingStats`).
  - Le **nombre de notes n'est jamais affiché**. La moyenne est arrondie à 0,1.
  - `maskRatingStats` sépare le type brut (`RawTicketStats`, jamais envoyé au site) du type public
    (`TicketStats`, sans `count` ni `claimedById`). La sortie est triée par nom.
  - Le site affiche la mention « indicatif : ne pas fonder de décision ».
  - Les tickets non pris en charge sont exclus de la moyenne par membre. Tout l'historique est pris en
    compte.
- **Accès** (validé par l'utilisateur après revue de sécurité) :
  - `GET …/tickets/stats` (moyenne par type) : avec l'onglet TICKETS.
  - `GET …/tickets/stats/members` (moyenne par membre) : réservé aux administrateurs du serveur. Écart
    assumé avec « mêmes droits que le panneau », validé par l'utilisateur.

Écart assumé : copie du pseudo (`claimedByName`), alors que l'ADR-0005 l'avait écartée pour `Case`.
C'est cohérent avec `ownerName` et `closedByName`, déjà présents sur `Ticket`, et validé par
l'utilisateur.

## Options écartées

- **A. Colonnes sur `Ticket` (retenue).** Plus : pas de jointure, une seule réponse garantie par la
  condition de l'`updateMany`. Moins : la note est liée au ticket, donc à l'auteur.
- **B. Table `TicketRating` à part.** Plus : plus facile à anonymiser ou à purger. Moins : une table et
  une jointure de plus.
- **C. Note anonyme, agrégée seulement.** Plus : moins de données conservées. Moins : plus de garantie
  « une réponse par ticket ».
- **D. Table d'agrégats sans lien auteur-note.** Examinée et écartée pour le moment : coût élevé (refaire
  le lot B). À reconsidérer avec le juriste.

## Conséquences

- Plus : moyennes par type et par membre, une réponse par ticket garantie en base.
- Moins : la note est rattachée à l'auteur et au membre noté (pseudonymisation, pas anonymat).
- Retour en arrière : supprimer les colonnes (migration destructive, accord requis) ; les notes sont
  perdues.

## Risques résiduels

1. **Attaque par différence** pour de petits nombres de notes : la liste des tickets donne une borne du
   nombre de notes, et un arrondi à 0,1 ne suffit pas à masquer une seule nouvelle note. Pistes :
   arrondi plus grossier, seuil plus haut, statistiques par lot avec délai.
2. Un type traité par **une seule personne** rend sa moyenne par type nominative pour un délégué de
   l'onglet Tickets.
3. Les **administrateurs voient des moyennes nominatives** par membre.
4. Un membre peut **fausser une note lentement** (ticket ouvert, fermé après 10 minutes).
5. **Aucune durée de conservation** de `rating`, `ratedAt`, `claimedById`, `claimedByName`. À traiter
   **avant la mise en production** (purge ou remise à null, comme l'ADR-0008 pour les sanctions). À
   proposer en issue étiquetée `donnees-personnelles`, à créer après accord de l'utilisateur.

## À valider par un juriste

- Base légale (intérêt légitime ? droit du travail si l'équipe est salariée).
- Responsable de traitement : éditeur du bot ou administrateurs du serveur.
- Information du membre noté et de l'auteur (art. 13/14 du RGPD).
- Politique de confidentialité : inexistante à ce jour.
- Droits d'accès, d'effacement et d'opposition.
- Durée de conservation (art. 5.1.e) : aucune aujourd'hui.
- Seuil de 5 notes.

## Confirmation

`tickets.int.test.ts` (concurrence), `rating.test.ts`, `claim.test.ts` et le test de l'API
(`apps/api/src/app.test.ts` : aucune note individuelle exposée).
