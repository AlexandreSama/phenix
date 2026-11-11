---
name: qualite
description: Audit d'assurance qualité logicielle du monorepo (ou d'un paquet), ou feu vert / rouge avant une mise en production — l'agent qualite pilote, avec aql-tests (adéquation des tests vitest, couverture, mutation), aql-revues (audits de configuration et de processus sur les PR) et aql-ia (sécurité des artefacts générés par l'IA, dépendances hallucinées). À utiliser périodiquement, avant une version, ou après un bug revenu ou un incident.
argument-hint: "[audit <paquet|tout> | prod <version ou branche>]"
---

# /qualite

Demande : $ARGUMENTS (vide = audit de tout le monorepo)

1. **En parallèle** (étapes indépendantes) :
   - agent `aql-tests` — adéquation des tests sur les zones d'intégrité élevée (authentification et
     contrôle d'accès de `apps/api`, accès délégués, modération, purge et export de données,
     migrations Prisma, `packages/storage`) et le code récent : complexité, MC/DC, frontières,
     couverture (`vitest run --coverage`), mutation (Stryker : proposé, pas encore en place) ;
   - agent `aql-revues` — audit de processus sur un échantillon de PR (`gh pr list --state merged`) ;
     avant une mise en production, audits de configuration fonctionnel et physique de la version ;
   - agent `aql-ia` — constats sur les quatre surfaces, dépendances ajoutées (`pnpm-lock.yaml`,
     `allowBuilds`), outillage IA (`.claude/`, skills installés par pnpm).
2. **Synthèse** — agent `qualite` : il reçoit les trois rapports, calcule les indicateurs
   (DRE par phase, densité, défauts revenus, origine des défauts), met à jour les risques et rend
   le verdict. Avant une mise en production (`prod …`), ajouter l'avis de `securite` (avec la
   conformité RGPD des données personnelles) sur ce qui change, et l'état de la CI
   (`gh run list --branch main`) ; **un seul point bloquant = FEU ROUGE**, rien n'est déployé.
3. **Présenter** le verdict, les indicateurs et les problèmes tels quels.
4. **Suites, avec accord** — issues pour les actions retenues (`/planifier`) ; rapport conservé
   dans `docs/qualite/audits/<AAAA-MM-JJ>.md` pour suivre la tendance.
