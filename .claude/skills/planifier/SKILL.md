---
name: planifier
description: Transforme un objectif (fonctionnalité, module, version, chantier d'infra) en issues GitLab dans les bons dépôts, avec étiquettes, jalon de groupe et dépendances — plan proposé par l'agent chef-de-projet, validé par l'utilisateur, puis créé. À utiliser avant de démarrer un travail de plus de quelques jours ou qui touche plusieurs dépôts.
argument-hint: "<objectif> [jalon ou échéance]"
---

# /planifier

Objectif : $ARGUMENTS

1. **Cadrage** — si l'objectif est flou (périmètre, échéance, priorité), pose les questions avant tout.
2. **Plan** — agent `chef-de-projet` en mode *Proposer* : il lit l'existant (issues, jalons,
   étiquettes) et rend le tableau des issues. Pour un objectif technique non trivial, fais-le
   précéder de l'agent `architecte` du dépôt concerné, et donne son plan au chef de projet.
3. **Validation** — montre le tableau à l'utilisateur, avec les jalons et étiquettes à créer.
   Créer des issues est visible par toute l'équipe : attends un accord explicite, et applique
   ses corrections.
4. **Création** — agent `chef-de-projet` en mode *Appliquer*, avec le plan validé tel quel.
5. **Compte rendu** — liens des issues et du jalon ; première issue prête à démarrer et skill
   conseillé (`/feature`, `/module`, `/nouvelle-app`, `/provisionner`…).
