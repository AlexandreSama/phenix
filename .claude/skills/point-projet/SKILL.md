---
name: point-projet
description: Fait le point d'avancement du projet à partir des issues, jalons et MR GitLab du groupe `mon-groupe` — par jalon, ce qui est fait, en cours, en retard, bloqué ou sans responsable, et les éventuels tickets d'assistance en attente — sans rien modifier. À utiliser en début de semaine, avant une réunion, ou pour savoir quoi faire ensuite.
argument-hint: "[jalon | dépôt | vide = tout le groupe]"
---

# /point-projet

Périmètre : $ARGUMENTS (vide = tout le groupe `mon-groupe`)

1. Agent `chef-de-projet` en mode *Proposer* (lecture seule) : point d'avancement par jalon.
2. Si le projet a un canal d'assistance, ajoute le nombre de tickets non pris en charge ou en attente
   (références seulement).
3. Présente : avancement par jalon (fait / total), retards, blocages, issues sans responsable ou
   sans activité, MR ouvertes en attente de revue, et **les 3 prochaines actions conseillées**.
4. Si des corrections de planning s'imposent (jalon à décaler, issue à découper), propose-les ;
   ne les applique qu'avec accord, via `/planifier`.
