---
name: nouveau-paquet
description: Ajoute un paquet au monorepo pnpm — une app dans `apps/` ou une bibliothèque `@phenix/<nom>` dans `packages/` — sur le modèle des paquets existants (tsconfig, tsdown, vitest, scripts turbo), test d'abord, puis vérifie que lint, typecheck, test et build passent. À utiliser quand l'utilisateur veut créer une nouvelle app ou un nouveau paquet partagé.
argument-hint: '<nom> [app|package] [rôle en une phrase]'
---

# /nouveau-paquet

Demande : $ARGUMENTS

1. **Cadrage** — nom (minuscules, tirets), type (`apps/` = exécutable : bot, API, web… ;
   `packages/` = bibliothèque partagée), rôle en une phrase, environnement (Node seul, ou aussi
   navigateur comme `@phenix/shared`). Vérifie qu'il ne recoupe pas un paquet existant (carte dans
   `CLAUDE.md`) : souvent, un module dans une app existante (`apps/bot/src/modules/<x>`,
   `apps/api/src/modules/<x>`) suffit. Nom à valider avec l'agent `nommage`. Manque d'info → demande.
2. **Modèle** — copie la structure d'un paquet voisin du même type plutôt que d'en inventer une :
   bibliothèque → `packages/shared` ou `packages/storage` (`package.json` privé `"type": "module"`,
   `exports` vers `dist/`, scripts `build` = `tsdown`, `typecheck` = `tsc --noEmit`, `test` =
   `vitest run` ; `tsconfig.json` qui étend `@phenix/config/tsconfig.base.json` ; `tsdown.config.ts`
   avec `tsdownBase` ; `vitest.config.ts` avec `unitConfig`). Versions partagées en `catalog:` ;
   dépendances internes en `workspace:*`.
3. **TDD** — un premier `src/<x>.test.ts` qui décrit le comportement attendu, constaté **rouge**
   (`pnpm --filter @phenix/<nom> test`), puis le code minimal qui le rend vert.
4. **Dépendances** — toute dépendance nouvelle passe par l'agent `aql-ia` (le paquet existe-t-il
   vraiment, est-il maintenu, pas de typosquatting) avant `pnpm add`. Un script d'installation
   (postinstall) demande une décision explicite dans `allowBuilds` de `pnpm-workspace.yaml`.
5. **Vérifier** — à la racine : `pnpm install`, `pnpm lint`, `pnpm format:check`,
   `pnpm turbo typecheck test build --filter @phenix/<nom>...` ; tout est vert, sortie montrée.
   Variables d'environnement nouvelles : validées par zod dans `env.ts` de l'app, ajoutées à
   `.env.example` (sans valeur réelle).
6. **Carte** — ajoute le paquet au tableau « Carte du monorepo » de `CLAUDE.md`.
7. **Rendre compte** — fichiers créés, ce qui reste à définir. Pas de commit sans accord ; ensuite,
   branche `feat/<n° d'issue>-<sujet>` depuis `main` et PR (`gh pr create`).
