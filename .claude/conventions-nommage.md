# Conventions de nommage du projet

Importé par `CLAUDE.md`. Un même concept porte **le même nom partout** : code, base, clés Valkey,
API, dashboard, commandes du bot, issues et docs. Ces règles décrivent l'usage **déjà en place**
dans le monorepo ; en cas de doute ou de nom nouveau qui en sort : agent `nommage`, et question à
l'utilisateur.

## Règles générales

- **Identifiants techniques en anglais**, textes affichés aux personnes en **français**.
- Un nom dit ce que c'est, sans abréviation obscure ; pas de synonymes pour la même chose
  (ex. toujours `guild` dans le code, jamais `server` ici et `guild` là ; « serveur » côté interface).
- Le singulier pour un élément, le pluriel pour une collection.

## Par domaine

| Domaine | Règle | Exemple |
|---|---|---|
| Paquets pnpm | `@phenix/<rôle>`, minuscules ; apps dans `apps/`, bibliothèques dans `packages/` | `@phenix/bot`, `@phenix/storage` |
| Modules métier | même nom de dossier dans le bot, l'API et le web ; anglais, minuscules, tirets si besoin | `apps/bot/src/modules/giveaways`, `apps/api/src/modules/role-panels` |
| Fichiers TypeScript | `kebab-case.ts` ; test à côté : `<fichier>.test.ts` ; composants React en `kebab-case.tsx` | `process-meter.ts`, `process-meter.test.ts` |
| Code TypeScript | `camelCase` fonctions et variables, `PascalCase` types, classes, composants et classes NestJS (`…Module`, `…Controller`, `…Service`, `…Guard`), `SCREAMING_SNAKE_CASE` constantes globales | `startLiveHeartbeat`, `LiveHeartbeatOptions` |
| Schémas zod | `<concept>Schema`, type inféré `<Concept>` ; partagés entre API et web dans `@phenix/shared` | `giveawaySchema` |
| Modèles Prisma | `PascalCase` au singulier ; champs en `camelCase` ; préfixe de domaine pour un module isolé ; identifiants Discord en `String` (snowflake) | `Giveaway`, `GiveawayEntry`, `Td2Profile`, `guildId` |
| Énumérations Prisma | type en `PascalCase`, valeurs en `SCREAMING_SNAKE_CASE` | `UserRole.MODERATOR` |
| Migrations Prisma | générées par `prisma migrate dev --name <nom>` : `<horodatage>_<nom en snake_case>`, le nom dit ce qui change | `20261109101611_giveaways` |
| Commandes slash | minuscules, sans espace ; nom court, français ou anglais déjà établi (`ban`, `case`), **options et descriptions en français** | `/ban membre durée` |
| Clés Valkey | `<domaine>:<sous-domaine>:<nom>`, minuscules, séparateur `:` ; files BullMQ nommées pareil | `metrics:live:api` |
| Routes de l'API | préfixe `/api`, minuscules, tirets, ressources au pluriel, imbriquées sous la guilde ; espace propriétaires sous `admin/` | `/api/guilds/:guildId/role-panels/:panelId`, `admin/metrics` |
| Variables d'environnement | `SCREAMING_SNAKE_CASE`, sans préfixe global, préfixées par le service externe quand il y en a un ; validées par zod dans `env.ts` ; listées dans `.env.example` | `DISCORD_CLIENT_ID`, `TRN_API_KEY`, `GARAGE_ADMIN_TOKEN` |
| Buckets et objets S3 (Garage) | un bucket par usage, minuscules, tirets ; clé d'objet `<guildId>/<id>.<extension>` | `42/7.html` (transcript du ticket 7 de la guilde 42) |
| Branches Git | `feat/<n°>-<sujet>`, `fix/<n°>-<sujet>`, `chore/<sujet>` (n° de l'issue GitHub) | `feat/42-giveaway-rerolls` |
| Commits | Conventional Commits en français : `type(portée): résumé à l'impératif`, portée = module ou paquet. L'historique antérieur (« Phase N : … ») n'est pas réécrit | `feat(giveaways): ajouter le tirage de remplacement` |
| Étiquettes GitHub | `type/…`, `priorite/…`, `etat/…`, `donnees-personnelles`, `paquet/<nom>` (à créer) | `type/bug`, `paquet/api` |
| Agents et skills Claude | minuscules et tirets, en français ; `name:` = nom du fichier | `chef-de-projet`, `/point-projet` |
| Documents | minuscules et tirets ; dates `AAAA-MM-JJ` en tête des fichiers datés | `docs/qualite/audits/2026-11-11.md` |

## Vocabulaire de l'interface (français)

Le **glossaire** `docs/glossaire.md` (à créer par l'agent `nommage`) fixe le mot unique affiché pour
chaque concept (ex. *serveur* pour guild, *membre*, *salon*, *rôle*, *ticket*, *sanction*,
*accès délégué*). Le bot, le dashboard et la doc l'utilisent à l'identique ; un nouveau mot y entre
avant d'apparaître dans l'interface.
