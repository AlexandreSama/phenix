# ADR-0004 : lever une sanction depuis le site par un appel REST Discord dans l'API

- **Date** : 2026-11-12
- **Statut** : proposé

## Contexte

Un modérateur lève un bannissement, une sourdine ou un avertissement depuis l'onglet Modération. Le
bot détient la connexion Discord et le code des sanctions ; l'API détient déjà le jeton du bot et un
client REST (`DiscordService`). Le modérateur attend une réponse immédiate, une sanction ne doit pas
être marquée levée si Discord refuse, et le bot peut être arrêté. La politique qualité demande un
journal de chaque décision et la sobriété (un seul serveur, petite équipe).

## Décision

L'API lève la sanction par REST Discord **avant** toute écriture en base, puis enregistre la levée en
une transaction (`liftSanction`, idempotente), puis prévient le bot par l'événement pub/sub
`moderation.logged` (`guildId` et `caseId` seulement) pour qu'il publie le log de modération avec ses
embeds existants. La cible vient de la sanction trouvée par (serveur, numéro), jamais du client.
Garde-fous : même permission Discord que la commande du bot (Bannir, ou Exclure temporairement),
`checkTarget` partagé dans `@phenix/shared` (rôle du modérateur, propriétaire), pas de levée d'une
sanction qui vise soi-même, sourdine d'un membre parti refusée (elle reviendrait avec lui).

**Précisions issues de l'inspection (2026-11-12).**

- **Levée par personne, pas par sanction.** Sur Discord, un ban ou une sourdine est unique par
  personne. La base lève donc toutes les sanctions actives de ce type pour la cible (comme `/unban`,
  `/unmute` et la levée automatique) ; seul un avertissement se retire par son numéro. Sans cela, un
  `/ban` qui prolonge pendant la levée laissait la sanction récente « active » alors que le membre était
  débanni, sans aucune trace.
- **Base en panne après Discord** : réponse 503 en français qui dit de réessayer, et log d'erreur avec
  le serveur, le numéro et `discordDone`, sans la cible. Le bot n'est pas prévenu.
- **Permission Discord** : lue dans la liste des serveurs de l'utilisateur, mise en cache 60 s comme
  tout le tableau de bord. **Risque accepté** : une permission retirée reste valable au plus 60 s pour
  lever un ban ou un avertissement (la hiérarchie d'une sourdine est relue en direct).
- **« Déjà levée » avant la permission** : la réponse 200 `alreadyRevoked` est donnée avant le contrôle
  de permission ; c'est une information que la liste donne déjà à quiconque ouvre l'onglet.
- **Raison** : demandée pour un ban ou une sourdine (elle va au journal d'audit Discord et à la sanction
  de fin) ; pas pour un avertissement, qui n'a ni appel Discord ni colonne pour la garder. Elle est
  coupée par caractère et débarrassée des demi-paires isolées (l'en-tête HTTP du journal d'audit lève
  sinon).

- **Limite de débit** : 10 levées par minute et par compte, 30 par minute et par serveur
  (`RateLimitService`, sans nouvelle dépendance), comptées avant toute lecture. Un refus de Discord
  (bot trop bas) ne change rien en base et se rejouerait sans fin ; chaque essai coûte des appels REST
  et les refus comptent contre le jeton du bot.
- **CSRF** : l'authentification est un cookie `SameSite=Lax`, qui ne part pas depuis un autre site mais
  part depuis un sous-domaine voisin, et un formulaire HTML n'a besoin ni de requête préalable ni de
  CORS. Toutes les écritures de l'API (POST, PUT, PATCH, DELETE) vérifient donc `Sec-Fetch-Site`
  (`same-origin` ou `none` seulement) et `Origin` (celui de `PUBLIC_URL` seulement) avant toute route
  (`common/csrf.ts`) ; sans ces en-têtes (curl, tests), elle passe, faute de navigateur à abuser. La
  route de levée n'accepte en plus que du JSON (415). Un refus est journalisé (méthode, chemin masqué,
  en-têtes), car pino-http n'est pas encore branché à ce stade. **Résidu** : un navigateur d'avant 2019
  (qui n'envoie ni `Sec-Fetch-Site` ni `Origin` sur un formulaire) visé depuis un sous-domaine voisin ;
  exiger `application/json` sur toutes les écritures l'éliminerait (sauf l'envoi d'images du forum). `PUBLIC_URL` doit être l'origine du site vue par le
  navigateur (`vite preview`, port 4173, demande de le régler).
- **Commandes du bot alignées sur le site** : `/clearwarn` interdit l'auto-levée ; le routeur du bot
  vérifie lui-même `requiredPermissions` (commandes et autocomplétion), pour toute commande qui propose
  une permission à Discord (le réglage `setDefaultMemberPermissions` n'est qu'une suggestion qu'un
  administrateur peut surcharger) : modération, `/gestionrole` (ManageRoles) et `/giveaway` (ManageGuild),
  avec un test qui parcourt toutes les commandes (seule `/broadcast`, réservée aux propriétaires du bot
  par `ownerIds`, y échappe). `/lock` vérifie en plus « Gérer les salons » dans le salon visé (cette
  permission peut s'accorder salon par salon, et le routeur ne voit que le salon où l'on tape) ;
  `/giveaway créer` vérifie que l'utilisateur peut écrire dans le salon ; `/unban`
  et `/unmute` passent par `liftSanction` (`via: COMMAND`) : plus de doublon du journal face à une levée
  du site. Si rien n'était actif dans les cases (levé ailleurs, ou posé à la main sur Discord), aucune
  sanction de fin n'est créée, le modérateur en est averti et le salon de logs garde une trace.
- **Hiérarchie** : `checkTarget` s'applique à la sourdine (la cible est membre). Pour un ban, la cible
  n'est plus membre et Discord ne contrôle rien non plus ; pour un avertissement, comme `/clearwarn`,
  seule l'auto-levée est interdite.
- **Résidu connu** : si un `/ban` rebannit la cible entre l'appel Discord du site et sa transaction, la
  levée par personne lève aussi la sanction récente alors que le membre est banni. La fenêtre dure un
  aller-retour Discord ; un verrou partagé entre le bot et l'API (verrou Valkey ou verrou consultatif
  PostgreSQL) la fermerait, à envisager. De même, la levée automatique d'un ban temporaire ne relit pas
  la sanction juste avant `bans.remove` : un `/ban` qui prolonge pile à ce moment serait débanni.

## Options écartées

- **File BullMQ consommée par le bot** : un seul acteur Discord en écriture, mais il faut un état « en
  attente », une interrogation côté site, la file se bloque si le bot est arrêté, et des reprises
  automatiques sur une action envers une personne sont moins prévisibles.
- **Pub/sub seul** : messages perdus, aucun accusé de réception.
- **Point d'accès HTTP dans le bot** : un nouveau serveur et une authentification entre services.

## Conséquences

- Réponse immédiate ; un échec Discord laisse la base intacte ; un nouvel essai converge (un ban déjà
  levé répond 10026 et clôt la sanction ; retirer un timeout deux fois est sans effet).
- Deux chemins écrivent sur Discord (discord.js dans le bot, REST dans l'API), réduits par
  `checkTarget` et `liftSanction` partagés. L'API, qui ne faisait qu'inviter, peut désormais débannir.
- Si la base tombe après Discord, la sanction reste active jusqu'au prochain essai.
- Le log de modération est au mieux : il se perd si Valkey coupe (la base est le journal).
- Retour en arrière : retirer la route POST et les deux méthodes d'écriture de `DiscordService`. Aucune
  donnée à migrer.
