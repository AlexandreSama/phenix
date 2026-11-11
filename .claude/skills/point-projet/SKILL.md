---
name: point-projet
description: Fait le point d'avancement du projet à partir des issues, jalons (milestones), PR et exécutions de CI du dépôt GitHub AlexandreSama/phenix — par jalon, ce qui est fait, en cours, en retard, bloqué ou sans responsable — sans rien modifier. À utiliser en début de semaine, avant une réunion, ou pour savoir quoi faire ensuite.
argument-hint: '[jalon | paquet | vide = tout le dépôt]'
---

# /point-projet

Périmètre : $ARGUMENTS (vide = tout le dépôt)

1. Agent `chef-de-projet` en mode _Proposer_ (lecture seule) : point d'avancement par jalon, à
   partir de `gh api repos/AlexandreSama/phenix/milestones`, `gh issue list --state all`,
   `gh pr list` et `gh run list --branch main`. Le dépôt n'a pas encore de jalons ni
   d'étiquettes : le dire, et faire le point sur les issues et PR ouvertes.
2. Présente : avancement par jalon (fait / total), retards, blocages, issues sans responsable ou
   sans activité, PR ouvertes en attente de revue ou à CI rouge, état de la CI sur `main`, et
   **les 3 prochaines actions conseillées**.
3. Si des corrections de planning s'imposent (jalon à décaler, issue à découper), propose-les ;
   ne les applique qu'avec accord, via `/planifier`.
