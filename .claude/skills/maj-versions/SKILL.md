---
name: maj-versions
description: Traite les mises à jour de dépendances du monorepo pnpm — `pnpm outdated -r`, `pnpm audit`, catalogue de `pnpm-workspace.yaml`, images de `docker-compose.dev.yml`, actions GitHub de la CI, et PR de Dependabot / Renovate si l'un est activé — lit les changelogs, vérifie compatibilité et sécurité, et dit quoi monter, quoi reporter, par l'agent versions. À utiliser en début de semaine, quand `pnpm audit` signale une faille, ou avant une release.
argument-hint: '[paquet @phenix/… | dépendance | vide = tout le monorepo]'
---

# /maj-versions

Périmètre : $ARGUMENTS (vide = tout le monorepo)

Appuie le principe « petits pas » et « signaler, ne jamais taire » de la politique qualité.
**Début** : un inventaire des versions en retard ou vulnérables. **Fin** : chaque mise à jour a un
verdict écrit et les actions à faire sont listées.

1. **Inventaire** (lecture seule) :
   - `pnpm outdated -r` (toutes les apps et paquets) et `pnpm audit --audit-level high` (même seuil
     que la CI) ;
   - catalogue `catalog:` de `pnpm-workspace.yaml` : une montée s'y fait **une seule fois** pour
     tout le monorepo ; respecter les épinglages commentés (ex. Prisma tenu en `^7` tant que
     « latest » pointe une RC de Prisma 8) ;
   - images de `docker-compose.dev.yml` (`postgres`, `valkey`, `garage`) et actions de
     `.github/workflows/ci.yml` ; `packageManager` du `package.json` racine et `engines.node` ;
   - si Dependabot ou Renovate est activé : `gh pr list --label dependencies`.
     Note ce qui est majeur, ce qui corrige une faille, ce qui casse la CI.
2. **Analyse** — agent `versions` (`sonnet`, `medium`) pour chaque mise à jour : changelog,
   ruptures, avis de sécurité, compatibilité entre paquets (ex. NestJS et ses modules,
   discord.js et `discord-api-types`, Prisma client / adapter / CLI au même niveau, React et
   `@types/react`). Failles, Prisma, PostgreSQL, Valkey, Garage, authentification : revue par
   `securite` ou `relecteur` en `opus` (plancher du barème). Toute **nouvelle** dépendance :
   `aql-ia` (existence, mainteneur, typosquatting) ; un script d'installation nouveau demande une
   décision dans `allowBuilds`.
3. **Ordre** — regroupe ce qui doit monter ensemble (une PR par groupe cohérent), majeures seules.
   Une montée de PostgreSQL / Valkey / Garage peut toucher les données locales : le dire.
4. **Rapport** — tableau `dépendance | paquets | avant → après | verdict | action`, plus les 3
   prochaines actions. **Rien n'est monté, fusionné ni commenté sans l'accord de l'utilisateur.**
5. **Appliquer** (après accord) — branche `chore/maj-<sujet>` depuis `main`, `pnpm up` ciblé (ou
   édition du catalogue), `pnpm install`, puis `pnpm lint`, `pnpm format:check`,
   `pnpm turbo typecheck test build` et `pnpm test:integration` verts ; PR via `gh pr create`.
6. **Idée** — aucun outil automatique n'est en place : Dependabot (natif GitHub,
   `.github/dependabot.yml` avec écosystèmes `npm`, `github-actions`, `docker`) ou Renovate
   (gère le catalogue pnpm) ; à proposer à l'utilisateur, ne pas l'activer sans accord.
