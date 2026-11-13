# ADR-0007 : verrou de modération partagé dans Valkey et relecture avant la levée automatique

- **Date** : 2026-11-13
- **Statut** : proposé

## Contexte

L'ADR-0004 laisse un résidu : le bot (`/ban`, `/unban`…), la levée automatique des bans temporaires et
l'API (levée depuis le site) écrivent sur la même cible sans se coordonner. Un `/ban` qui prolonge
pendant une levée du site laissait la sanction récente levée alors que le membre était banni ; la
levée automatique ne relisait pas la sanction avant `bans.remove`. Les trois acteurs partagent déjà
Valkey. Une interaction Discord doit être acquittée en 3 s.

## Décision

Un verrou Valkey par (serveur, cible), dans `@phenix/jobs` (`packages/jobs/src/lock.ts`, interface
structurelle `LockStore`) : `SET NX PX` de 30 s, jeton propriétaire, libération par script Lua
compare-and-delete. Clé `moderation:lock:<guildId>:<targetId>`.

**Attente bornée.** La prise du verrou dure au plus `max(waitMs, timeoutMs)` au TOTAL, appel en cours
compris : chaque `SET` reçoit `min(timeoutMs, budget restant)`, et les essais s'arrêtent à `waitMs`
(`LockBusyError`). Valeurs du bot (`apps/bot/src/index.ts`) : `waitMs` 1000, `timeoutMs` 1000,
`retryMs` 100, TTL 30 s ; le bot répond donc à Discord en 1 s au plus avant `deferReply` (budget de 3 s).
Valeurs de l'API (`apps/api/src/core/lock.service.ts`) : `waitMs` 2000, `timeoutMs` 1000, `retryMs`
100, TTL 30 s.

Utilisé par `/ban`, `/mute`, `/unban` et `/unmute` (bot, pris avant `deferReply`), la levée automatique
(bot, `liftExpiredBans`) et la levée du site (API, `ModerationService.revoke` via `underLock`, après
la limite de débit par compte, la permission et la limite du serveur, voir ADR-0004), y compris
d'un AVERTISSEMENT. « WARN et KICK ne sont pas verrouillés » ne vaut que pour les commandes du bot.

**Relecture sous le verrou.** Levée automatique : `findActiveCases` puis fonction pure `isBanStillDue` ;
aucun appel Discord si le ban n'est plus actif. Levée du site : sanction déjà levée → `alreadyRevoked`,
sans appel Discord.

**Verrou pris.** Site : 409 (`MODERATION_BUSY_MESSAGE`). Bot : message éphémère. Levée automatique : le
ban est repris au passage suivant.

**Durcissements issus de l'inspection** (`packages/jobs/src/lock.ts`, `apps/bot/.../ban-expiry.ts`).

- Quand une prise est abandonnée (délai dépassé, erreur), le `SET` a pu partir quand même : une
  libération de fond avec le jeton tenté évite un verrou orphelin de 30 s.
- Un `onReleaseError` qui lève ne masque ni le résultat ni l'erreur de `fn`.
- Les messages d'erreur du verrou (`LockBusyError`, `LockUnavailableError`, `LockNotOwnedError`) ne
  portent aucun identifiant ; la clé reste en propriété `.key`.
- Une ligne de ban invalide (cible qui n'est pas un snowflake, `moderationLockKey` lève) ne bloque
  plus la levée automatique des autres : ce ban est écarté avec un `warn` sans la cible.

**Valkey indisponible** (choix de l'utilisateur). L'API et la levée automatique refusent (503 côté site ;
rien n'est levé côté bot). Les commandes du bot passent, avec un `warn` sans la cible. Justification :
sans Valkey, le site (sessions) et la levée automatique sont déjà arrêtés ; un ban qui dure une minute
de plus est le sens sûr ; `/ban` reste utilisable pendant un raid. **Risque accepté** : la fenêtre de
course reste ouverte pendant la panne.

## Options écartées

- **Verrou consultatif PostgreSQL** : garde une connexion ou une transaction ouverte pendant les appels
  Discord.
- **Nouveau paquet `@phenix/locks`** : disproportionné pour un fichier d'environ 180 lignes (`lock.ts`, commentaires compris).
- **`@phenix/shared`** : importé par le web, et sans Testcontainers.
- **Redlock** : conçu pour plusieurs nœuds Valkey, inutile avec un seul.

## Conséquences

- La course bot / site / levée automatique est fermée tant que Valkey répond.
- **Risque** : le TTL de 30 s peut être dépassé par les reprises de `@discordjs/rest` (15 s par requête,
  jusqu'à 3 reprises, attente de limite de débit non bornée). Cela vaut pour le bot ET pour l'API (client
  REST par défaut, `new REST({ version: '10' })` dans `DiscordService`). La protection tombe alors en
  silence ; seule une libération « sans propriétaire » est journalisée. Borner `rest: { timeout, retries }`
  dans les deux clients est une amélioration à décider (hors de la PR qui introduit le verrou).
- La limite de débit du serveur pour la levée du site est désormais comptée APRÈS le contrôle de
  permission (ADR-0004).
- Tant que Valkey est en panne, la fenêtre de course reste ouverte pour les commandes du bot (risque
  accepté ci-dessus).
- Un ban échu dont la sanction n'est plus active n'est plus levé automatiquement (changement voulu).
- Retour en arrière : retirer les appels `withLock`. Aucune donnée à migrer.
