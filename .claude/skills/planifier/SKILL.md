---
name: planifier
description: Transforme un objectif (fonctionnalité, module du bot, écran du dashboard, version, chantier technique) en issues GitHub du dépôt AlexandreSama/phenix, avec étiquettes, jalon (milestone) et dépendances — plan proposé par l'agent chef-de-projet, validé par l'utilisateur, puis créé avec gh. À utiliser avant de démarrer un travail de plus de quelques jours ou qui touche plusieurs paquets.
argument-hint: "<objectif> [jalon ou échéance]"
---

# /planifier

Objectif : $ARGUMENTS

1. **Cadrage** — si l'objectif est flou (périmètre, échéance, priorité), pose les questions avant tout.
2. **Plan** — agent `chef-de-projet` en mode *Proposer* : il lit l'existant (`gh issue list`,
   `gh api repos/AlexandreSama/phenix/milestones`, `gh label list`) et rend le tableau des issues,
   chacune rattachée aux paquets touchés (`bot`, `api`, `web`, `database`…). Pour un objectif
   technique non trivial, fais-le précéder de l'agent `architecte`, et donne son plan au chef de projet.
3. **Validation** — montre le tableau à l'utilisateur, avec les jalons et étiquettes à créer.
   Créer des issues est visible par toute l'équipe : attends un accord explicite, et applique
   ses corrections.
4. **Création** — agent `chef-de-projet` en mode *Appliquer*, avec le plan validé tel quel
   (`gh label create`, `gh api -X POST …/milestones`, `gh issue create`).
5. **Compte rendu** — liens des issues et du jalon ; première issue prête à démarrer, sa branche
   (`feat/<n°>-<sujet>` depuis `main`) et le skill conseillé (`/orchestrer`, `/nouveau-paquet`…).
