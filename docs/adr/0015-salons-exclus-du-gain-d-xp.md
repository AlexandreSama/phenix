# ADR-0015 : salons exclus du gain d'XP, stockés dans GuildConfig

- **Date** : 2026-11-16
- **Statut** : proposé

## Contexte

Un serveur veut que certains salons ne rapportent pas d'XP : salons de commandes de bots, de spam,
d'annonces, ou vocaux (l'XP vocal est prévu ensuite). Aujourd'hui chaque message d'un membre rapporte de
l'XP, quel que soit le salon. Il faut un réglage par serveur, modifiable depuis l'onglet « Niveaux », qui
reste lisible par le bot sans appel supplémentaire à chaque message.

## Décision

Un champ `GuildConfig.xpExcludedChannelIds` (liste de snowflakes, 50 au plus, sans doublon) porte les
exclusions. Il accepte des **salons textes, des salons vocaux, des forums et salons média, et des
catégories**. Le bot le lit avec le reste
de la configuration de la guilde, déjà mise en cache (`guild-config-cache`).

- Un **fil de discussion hérite** de son salon parent, et de la catégorie de celui-ci : exclure un salon ou
  sa catégorie exclut ses fils. Les **posts d'un forum ou d'un salon média sont des fils** dont le parent est
  le forum : exclure le forum exclut les messages de tous ses posts, sans règle de plus côté bot.
- L'exclusion est testée **avant le délai en mémoire** (`xpCooldownSec`) : un message dans un salon exclu ne
  consomme pas le délai, et un message posté juste après dans un autre salon rapporte de l'XP.
- À l'écriture, l'API vérifie que chaque identifiant **ajouté** est un salon texte ou annonces, un salon
  vocal ou de scène, un forum ou un salon média, ou une catégorie du serveur (sinon 400 « Salon inconnu sur ce serveur »). Un identifiant
  déjà enregistré mais devenu inconnu (salon supprimé) peut rester dans la liste et ne bloque pas
  l'enregistrement.
- L'API des salons vocaux, `GET /api/guilds/:guildId/voice-channels`, est **introduite dans cette PR**
  (elle était prévue avec l'XP vocal) pour pouvoir exclure un salon vocal. Elle renvoie les salons vocaux et
  de scène sous la même forme que `GET /api/guilds/:guildId/channels` (`id`, `name`, `parentName`) ; elle est
  ouverte à tout accès au serveur, comme les routes sœurs.
- De même, `GET /api/guilds/:guildId/forum-channels` renvoie les forums et les salons média, sous la même
  forme. Ils ne sont **pas** ajoutés à la liste `channels` : celle-ci sert à choisir où poster (annonces,
  bienvenue…), et un forum n'y est pas valide.
- Les listes texte, vocal, forum et catégories sont des filtres d'une **même lecture** de la liste des salons
  de Discord, mise en cache une minute par serveur (une seule requête à froid au lieu de quatre).

## Options étudiées

- **A. Liste dans `GuildConfig` (retenue).** Plus : aucun accès de plus, la liste voyage avec la config déjà
  en cache ; migration d'une colonne. Moins : pas de contrainte relationnelle sur les identifiants.
- **B. Table dédiée (une ligne par salon exclu).** Plus : relationnel, une ligne par salon. Moins : une table
  et une jointure pour une simple liste de 50 éléments au plus.
- **C. Multiplicateur d'XP à 0 % par salon.** Plus : un seul concept. Moins : incohérent avec le plancher des
  bonus (un multiplicateur ne descend pas à zéro) et interface moins claire qu'une liste de salons exclus.

## Conséquences

- Plus : l'exclusion ne coûte rien par message (recherche dans un ensemble en mémoire).
- Plus : les salons vocaux sont déjà exclusables ; l'XP vocal n'aura qu'à réutiliser la liste.
- Moins : l'identifiant d'un salon supprimé reste en base sans effet jusqu'à ce que l'administrateur le
  retire de la liste.
- Moins : la limite de 50 entrées est arbitraire ; une catégorie en couvre beaucoup d'un coup.
- Retour en arrière : vider la liste (`xpExcludedChannelIds = []`) rétablit le gain d'XP partout ; la
  colonne peut rester.

## Confirmation

`xp-rules.test.ts` et `message-xp.test.ts` dans `apps/bot/src/modules/leveling`, `leveling.test.ts` côté
`@phenix/shared`, `guild-config.int.test.ts` côté `@phenix/database`, et les tests d'API de `app.test.ts`
(blocs « réglages XP », « salons vocaux », « salons forum et média » et « liste brute des salons »).
