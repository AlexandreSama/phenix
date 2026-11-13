# ADR-0010 : types de ticket en tables dédiées

- **Date** : 2026-11-13
- **Statut** : proposé

## Contexte

L'équipe et la catégorie des tickets sont uniques par serveur (`GuildConfig.ticketCategoryId`,
`ticketStaffRoleIds`) et il n'y a qu'un `TicketPanel` par serveur. Il faut des réglages par type
(support, recrutement…), une migration rétrocompatible, et suivre le motif déjà en place pour les
ensembles de boutons (`RolePanel` / `RolePanelOption`).

## Décision

Créer `TicketType` et `TicketTypeQuestion` (énumération `TicketTypeQuestionStyle`) et y déplacer la
catégorie et les rôles d'équipe. Un rattrapage SQL idempotent (migration `ticket_types_backfill`) crée un
type par défaut pour chaque serveur configuré, rattache les tickets existants (`Ticket.typeId`) et remet
le panel « en attente » pour republication.

Les colonnes `GuildConfig.ticketCategoryId` et `ticketStaffRoleIds` sont gardées mais ne sont plus lues :
leur suppression sera une migration destructive (accord requis).

Un seul ticket reste ouvert à la fois par membre et par serveur. 25 types au plus ; le panneau est en
boutons (1 à 5 types) ou en menu (6 à 25).

## Options écartées

- **A. Tables dédiées (retenue).** Plus : typage, contraintes et clés étrangères ; même motif que
  `RolePanel`. Moins : deux tables de plus.
- **B. Questions en `Json` sur le type.** Plus : moins de tables. Moins : aucun typage ni contrainte,
  rupture avec le motif existant.
- **C. Types en `Json` dans `GuildConfig`.** Plus : aucune table. Moins : pas de clé étrangère depuis
  `Ticket`, donc pas de moyenne par type plus tard.
- **D. Un `TicketPanel` par type.** Plus : réutilise la table existante. Moins : un message par type alors
  qu'un seul est voulu.

## Conséquences

- Plus : des réglages par type (catégorie, équipe, questions).
- Moins : deux tables de plus et des colonnes mortes dans `GuildConfig` jusqu'à leur suppression.
- Neutre : chaque panel est republié une fois au démarrage.
- Retour en arrière : supprimer les tables et `Ticket.typeId` (migration destructive, accord requis) ;
  les types créés sont perdus.

## Confirmation

`ticket-types-backfill.int.test.ts` (rattrapage idempotent), `tickets.int.test.ts` et
`apps/api/src/app.test.ts`.
