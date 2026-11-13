# ADR-0008 : conservation et purge des sanctions

- **Date** : 2026-11-13
- **Statut** : proposé

## Contexte

Les sanctions (`Case`) rattachent une personne (identifiant Discord) à un motif et sont conservées sans
limite. La politique qualité et `CLAUDE.md` demandent la minimisation et des rétentions bornées. Ce qui
est juridique est à valider par un juriste.

## Décision

`GuildConfig.caseRetentionMonths` : 12 par défaut ; 6, 12, 24 ou `null` (jamais). Réglé dans l'onglet
Général, réservé aux administrateurs (un délégué qui renvoie la valeur inchangée n'est pas refusé).

Purge quotidienne à 3 h 30 (Europe/Paris) : tâche BullMQ `purge` de la file `moderation`
(`packages/jobs/src/moderation.ts`), traitée par le bot (`apps/bot/src/modules/moderation/purge.ts`),
qui appelle `purgeCases` (`packages/database/src/case-retention.ts`).

**Purgées après N mois** (frontière stricte) : sanctions levées (`revokedAt`), sourdines terminées
(`expiresAt`), sanctions ponctuelles KICK, UNBAN et UNMUTE (`createdAt`).

**Jamais purgées** : les sanctions actives, soit un avertissement actif (jamais d'échéance ; à valider
par un juriste), un ban définitif, un ban temporaire échu non levé (le membre est encore banni), une
sourdine en cours.

**Numérotation sûre** : le numéro vient de `Guild.caseCounter`, pas de `max(number)` ; purger les plus
récentes ne réutilise aucun numéro. **Journal** : `{ cases, guilds, skipped }`, des comptes seulement, aucun
identifiant. Migration par ajout (`ALTER TABLE … ADD COLUMN`).

**Cas d'erreur.** Une durée invalide en base (entier < 1, NaN) n'arrête PLUS la purge : `purgeCases`
saute ce serveur sans rien y supprimer et le compte dans `skipped` (résultat `{ guilds, cases,
skipped }`) ; le bot journalise alors un `warn`. Une date de référence invalide lève. Une erreur de
base remonte et arrête la purge du jour : les serveurs déjà traités le restent (pas de transaction
globale, ordre non fixé).

**Garde-fous du bot** (`createModerationProcessor`). `scheduledAt` est borné à « maintenant + 1
minute » : une tâche injectée avec une date future ne purge pas tout. Seule la tâche nommée `purge`
purge ; toute autre est ignorée avec un `warn`.

**Pas de contrainte CHECK en base** : choix assumé (une nouvelle durée n'exige pas de migration), au
prix d'une protection par le code seulement.

## Options écartées

- **Énumération `CaseRetention`** : une migration à chaque nouvelle durée.
- **Constante globale** : non réglable par serveur.
- **Anonymisation au lieu de suppression** : colonnes à rendre nullables, migration.
- **Réglage dans l'onglet Modération** : ouvert aux délégués.

## Conséquences

- Au premier passage, l'historique de plus de 12 mois disparaît sur les serveurs existants. Aucune
  production n'est en place et aucune sauvegarde de production n'existe à ce jour.
- Le premier passage supprime d'office l'historique clos de plus de 12 mois des serveurs existants
  (`DEFAULT 12`).
- Aucun mode observation ne précède la première purge, alors que la politique qualité en demande un
  pour les automatismes qui agissent sur des personnes. **À décider avec l'utilisateur** : un drapeau
  d'activation, ou un premier passage qui ne fait que compter.
- La purge ne supprime pas les messages déjà publiés dans le salon de logs Discord (droit à
  l'effacement : **à valider par un juriste**).
- La purge est irréversible. Retour en arrière : migration destructive (accord requis) ; les données
  purgées sont perdues.
- **À valider par un juriste** : les durées proposées, « jamais » face à la limitation de conservation,
  la conservation illimitée des avertissements actifs, l'information des membres.
