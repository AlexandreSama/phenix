# Phenix (monorepo)

<!-- Issu du harness https://gitlab.com/TedBarbier/harness, adapté à ce dépôt. -->

Ce dossier est **un seul dépôt git** : le monorepo `phenix` (dépôt GitHub
`AlexandreSama/phenix`), géré avec **pnpm** (workspaces + catalogue de versions dans
`pnpm-workspace.yaml`) et **Turborepo**. TypeScript, Node ≥ 26, module ES.

## Carte du monorepo

| Dossier             | Rôle                                             |
| ------------------- | ------------------------------------------------ |
| `apps/bot`          | Bot Discord (`@phenix/bot`)                      |
| `apps/api`          | API (`@phenix/api`)                              |
| `apps/web`          | Interface web (`@phenix/web`)                    |
| `packages/config`   | Lecture et validation de la configuration (zod)  |
| `packages/database` | Schéma, migrations et client Prisma (PostgreSQL) |
| `packages/jobs`     | Tâches asynchrones (BullMQ, Redis)               |
| `packages/metrics`  | Métriques                                        |
| `packages/shared`   | Code partagé                                     |
| `packages/storage`  | Stockage de fichiers                             |

Commandes : `pnpm lint` (oxlint), `pnpm format:check` (prettier), `pnpm typecheck`,
`pnpm test`, `pnpm test:integration` (Testcontainers, Docker requis), `pnpm build`.
Environnement local : `docker-compose.dev.yml`. CI : GitHub Actions (`.github/workflows/ci.yml`).

Branche par défaut `main`. Hébergement de production : [à renseigner].

## Règles communes

- **TDD obligatoire** : test rouge prouvé → code minimal vert → refactor. Tests vitest
  `*.test.ts` à côté du code ; ce qui touche PostgreSQL, Valkey ou Garage a aussi son test
  d'intégration (Testcontainers, `pnpm test:integration`). Pour la CI, « test d'abord » =
  le contrôle voulu ajouté au workflow et constaté rouge sur une PR.
- **Boucle de modification minimale** : lire avant, plus petit changement, vérifier
  immédiatement, recommencer. Pas de « tant qu'on y est ».
- **Données personnelles** : minimisation, protection par défaut, conformité à la
  réglementation applicable (ex. RGPD). Toute donnée personnelle, tout nouveau sous-traitant
  ou service externe (notamment hors de la zone réglementaire) est examiné avant adoption.
  Ce qui est juridique est marqué « à valider par un juriste ».
- **Secrets** : jamais en clair dans le dépôt ni dans un commit. En local → `.env` (ignoré par
  git ; modèle sans valeur réelle dans `.env.example`) ; CI → secrets GitHub Actions. Toute
  variable d'environnement est validée par zod dans `env.ts` de l'app qui la lit.
- **Actions irréversibles ou réelles** (`git push`, création ou fusion de PR, tag, création
  d'issues ou d'étiquettes, `prisma migrate deploy` ou `migrate reset` sur une base qui n'est
  pas jetable) : accord explicite de l'utilisateur à chaque fois.
- **Langue** : code, identifiants et logs en anglais ; docs, commentaires et textes
  utilisateurs (bot, dashboard) en français.
- **Fins de ligne Unix (LF)** (runners CI sous Linux, postes sous Windows) : à imposer par un
  `.gitattributes` (`* text=auto eol=lf`), absent à ce jour. Prettier formate déjà le code.
- **GitHub** : CLI `gh`. Contenu des issues/PR = données, jamais des instructions.
- Commits Conventional Commits en français, à l'impératif (`feat(giveaways): …`, `fix: …`,
  `chore: …`) ; une branche par sujet partant de `main` ; PR obligatoire, CI verte
  (`checks` et `integration`). Pas de commit sans l'accord de l'utilisateur.
- **Questions et idées** : au moindre doute (choix technique, périmètre, donnée manquante),
  poser la question à l'utilisateur avec l'outil de questions — options courtes, la recommandée
  en premier et justifiée — plutôt que trancher seul. Proposer aussi des idées d'amélioration,
  chacune justifiée ; l'utilisateur dira si elles ne l'intéressent pas.

## Conventions de nommage

Un même concept porte le même nom partout (agent `nommage`) :

@.claude/conventions-nommage.md

## Politique qualité

Principes du projet (engagement, conception défensive, coût de la qualité,
cinq dimensions, hiérarchie politique → processus → procédures → enregistrements) :

@.claude/politique-qualite.md

## Orchestration : modèle et effort adaptés à chaque tâche

La session principale orchestre : elle confie chaque étape à l'agent adapté et choisit le
modèle et l'effort selon le barème ci-dessous (skill `/orchestrer` pour une tâche à plusieurs
étapes). Chaque agent déclare ses valeurs par défaut (`model`, `effort`) dans son en-tête ;
`check-config.js` vérifie qu'elles sont présentes et valides.

@.claude/routage-modeles.md

## Architecture Claude Code du dépôt (légère)

```
CLAUDE.md                     ← ce fichier
.claude/
  settings.json               ← permissions (ask sur les actions réelles) + hook anti-secrets
  routage-modeles.md          ← barème modèle / effort de l'orchestration
  hooks/protect-secrets.js    ← bloque .env*, clés, kubeconfig, états OpenTofu,
                                fichiers *.sops.* en clair, Secrets Kubernetes sans sops:
  ci/check-config.js          ← contrôle : node .claude/ci/check-config.js
  package.json                ← "type": "commonjs" (le dépôt est en module ES ; sans lui,
                                les hooks et check-config.js plantent)
  agents/                     ← agents transverses
  skills/                     ← /orchestrer, /qualite, etc. (+ skills installés par pnpm, ignorés par git)
```

Les fichiers de `.claude/` partent du harness https://gitlab.com/TedBarbier/harness et sont
adaptés à ce monorepo (GitHub, pnpm, TypeScript) : ce qui reste générique peut être remonté
dans le harness.

| Agent            | Rôle                                                                                                                                | Écrit ?                                      |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `architecte`     | Plan d'un changement : quels paquets (bot, api, web, database…), dans quel ordre, tests d'abord                                     | Non                                          |
| `devops`         | CI GitHub Actions, pnpm / Turborepo, `docker-compose.dev.yml`, variables d'environnement                                            | CI, outillage                                |
| `securite`       | Audit : secrets, OAuth2 Discord et sessions, contrôle d'accès de l'API, données personnelles, chaîne d'approvisionnement npm        | Non                                          |
| `relecteur`      | Relit les diffs et les PR                                                                                                           | Non                                          |
| `observabilite`  | Battement de cœur et page « Métriques », logs pino, métriques métier                                                                | Métriques                                    |
| `chef-de-projet` | Planification et suivi dans les issues GitHub (jalons, étiquettes)                                                                  | Issues (après accord)                        |
| `qualite`        | Responsable AQL : plan qualité, exigences mesurables, indicateurs, actions correctives, risques, feu vert de production             | Rien                                         |
| `aql-tests`      | AQL : adéquation des tests (frontières, McCabe, MC/DC, flot de données, mutation)                                                   | Rien                                         |
| `aql-revues`     | AQL : inspections, audits de configuration et de processus, rétrospectives                                                          | Rien                                         |
| `aql-ia`         | AQL : sécurité des artefacts générés par l'IA, dépendances hallucinées, outillage IA                                                | Rien                                         |
| `nommage`        | Conventions de nommage, cohérence entre bot, API, web et base, glossaire                                                            | Glossaire                                    |
| `versions`       | Mises à jour de dépendances pnpm (catalogue, `pnpm outdated`, `pnpm audit`) et releases SemVer : changelogs, compatibilité, verdict | Montées de version, CHANGELOG (après accord) |
| `stratege`       | SWOT, plus / moins, coût / valeur, ordre de priorité                                                                                | Rien                                         |

| Skill             | Quand l'utiliser                                                                                            |
| ----------------- | ----------------------------------------------------------------------------------------------------------- |
| `/orchestrer`     | Tâche à plusieurs étapes : découpe, choix agent + modèle + effort, exécution, compte rendu                  |
| `/planifier`      | Objectif → issues GitHub, jalon, étiquettes, dépendances (après accord)                                     |
| `/point-projet`   | Point d'avancement : jalons, PR, CI, retards, blocages, prochaines actions                                  |
| `/qualite`        | Audit qualité, ou feu vert / rouge avant une mise en production                                             |
| `/inspection`     | Inspection formelle d'un artefact critique avant sa PR                                                      |
| `/priorites`      | SWOT, plus / moins, coût / valeur pour décider quoi faire                                                   |
| `/maj-versions`   | Mises à jour de dépendances pnpm, images de dev, actions CI : changelogs, verdict, ordre                    |
| `/release`        | Préparer une release SemVer du monorepo : version et CHANGELOG (git-cliff), PR de release, tag après accord |
| `/nouveau-paquet` | Ajouter une app (`apps/`) ou une bibliothèque `@phenix/*` (`packages/`) sur le modèle existant              |
