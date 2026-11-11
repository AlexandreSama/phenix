---
name: inspection
description: Inspection formelle d'un artefact d'intégrité élevée (authentification OAuth2 Discord et sessions, contrôle d'accès propriétaires / administrateurs / accès délégués, export ou purge de données personnelles, migration Prisma destructive, stockage des transcripts et preuves, workflow CI) par l'agent aql-revues — planification, examen contre les sources et une liste de vérification, reprise, suivi et mesures. Plus rigoureuse qu'une simple revue de diff. À utiliser sur tout changement critique avant sa PR.
argument-hint: "<fichier(s), paquet ou n° de PR à inspecter>"
---

# /inspection

Artefact : $ARGUMENTS

1. **Planifier** — périmètre limité (quelques centaines de lignes au plus ; sinon découper),
   documents sources (issue GitHub, plan, règles du `CLAUDE.md`, politique qualité, schéma
   `packages/database/prisma/schema.prisma` si des données sont touchées), liste de vérification
   applicable (`docs/qualite/listes/`, à créer au premier besoin). Critères d'entrée :
   `pnpm lint`, `pnpm turbo typecheck test` verts sur les paquets touchés (et
   `pnpm test:integration` si la base, Valkey ou le stockage sont touchés) ; sinon on n'inspecte
   pas encore. PR existante : `gh pr view <n°>` et `gh pr diff <n°>`.
2. **Inspecter** — agent `aql-revues` (examen contre les sources) ; en parallèle, selon l'artefact :
   `aql-tests` (les tests suffisent-ils ?), `aql-ia` (si produit par un agent ou si une dépendance
   est ajoutée), `securite` si son domaine est touché (accès, sessions, secrets, données
   personnelles et leur conformité RGPD).
3. **Présenter** les anomalies (majeures d'abord) et le verdict : accepté, accepté avec corrections
   mineures, ou à reprendre puis nouvelle inspection.
4. **Reprise** — corrections par la session principale (ou `devops` pour la CI) en TDD : le test
   qui révèle l'anomalie d'abord, constaté rouge. Puis **suivi** : chaque anomalie close ou justifiée.
5. **Mesures et amélioration** — taille, anomalies par gravité, effort ; liste de vérification mise
   à jour si une anomalie lui avait échappé. Ensuite : PR (`gh pr create`) avec le verdict résumé.
