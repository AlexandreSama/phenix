---
name: inspection
description: Inspection formelle d'un artefact d'intégrité élevée (contrôle d'accès, export / purge de données personnelles, migration destructive, politique de sécurité, rôle réseau ou SSH, plan qualité) par l'agent aql-revues — planification, examen contre les sources et une liste de vérification, reprise, suivi et mesures. Plus rigoureuse qu'une simple revue de diff. À utiliser sur tout changement critique avant sa MR.
argument-hint: "<fichier(s) ou MR à inspecter>"
---

# /inspection

Artefact : $ARGUMENTS

1. **Planifier** — périmètre limité (quelques centaines de lignes au plus ; sinon découper),
   documents sources (exigences, plan, règles du `CLAUDE.md`, politiques), liste de vérification
   applicable (`docs/qualite/listes/`), critères d'entrée : tests verts et lint propre, sinon on
   n'inspecte pas encore.
2. **Inspecter** — agent `aql-revues` (examen contre les sources) ; en parallèle, selon l'artefact :
   `aql-tests` (les tests suffisent-ils ?), `aql-ia` (si produit par un agent ou si une dépendance
   est ajoutée), `securite` si son domaine est touché (et une revue de conformité des données personnelles le cas échéant).
3. **Présenter** les anomalies (majeures d'abord) et le verdict : accepté, accepté avec corrections
   mineures, ou à reprendre puis nouvelle inspection.
4. **Reprise** — corrections par `developpeur` / `devops` en TDD (test qui révèle l'anomalie d'abord),
   puis **suivi** : chaque anomalie close ou justifiée.
5. **Mesures et amélioration** — taille, anomalies par gravité, effort ; liste de vérification mise
   à jour si une anomalie lui avait échappé. Propose `/mr`.
