---
name: qualite
description: Audit d'assurance qualité logicielle d'un ou plusieurs dépôts, ou feu vert / rouge avant une mise en production — l'agent qualite pilote, avec aql-tests (adéquation des tests, mutation), aql-revues (audits de configuration et de processus) et aql-ia (sécurité des artefacts générés par l'IA, dépendances hallucinées). À utiliser périodiquement, avant une version, ou après un bug revenu ou un incident.
argument-hint: "[audit <dépôt|tout> | prod <version ou branche>]"
---

# /qualite

Demande : $ARGUMENTS (vide = audit de tous les dépôts)

1. **En parallèle** (étapes indépendantes) :
   - agent `aql-tests` — adéquation des tests sur les zones d'intégrité élevée et le code récent
     (complexité, MC/DC, frontières, mutation) ;
   - agent `aql-revues` — audit de processus sur un échantillon de MR ; avant une mise en
     production, audits de configuration fonctionnel et physique de la version ;
   - agent `aql-ia` — constats sur les quatre surfaces, dépendances ajoutées, outillage IA.
2. **Synthèse** — agent `qualite` : il reçoit les trois rapports, calcule les indicateurs
   (DRE par phase, densité, défauts revenus, origine des défauts), met à jour les risques et rend
   le verdict. Avant une mise en production (`prod …`), ajouter l'avis de `securite` et la vérification de conformité des données personnelles
   sur ce qui change ; **un seul point bloquant = FEU ROUGE**, rien n'est déployé.
3. **Présenter** le verdict, les indicateurs et les problèmes tels quels.
4. **Suites, avec accord** — issues pour les actions retenues (`/planifier`) ; rapport conservé
   dans `docs/qualite/audits/<date>.md` du dépôt (agent `documentaliste`) pour suivre la tendance.
