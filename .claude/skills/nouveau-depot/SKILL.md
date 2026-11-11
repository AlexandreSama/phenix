---
name: nouveau-depot
description: Crée un nouveau dépôt GitLab privé dans le groupe `mon-groupe` avec glab, le clone dans l'espace de travail, puis y installe l'architecture Claude Code (skill bootstrap-architecture) adaptée à son domaine. À utiliser quand l'utilisateur veut ajouter un dépôt au projet.
argument-hint: "<nom-du-depot> [rôle en une phrase]"
---

# /nouveau-depot

Demande : $ARGUMENTS

1. **Cadrage** — nom (minuscules, tirets), rôle en une phrase, domaine (code, gitops, infra,
   docs…). Vérifie qu'il ne recoupe pas un dépôt existant (carte dans `CLAUDE.md`, règle de
   frontière *crée le cluster* / *tourne dans le cluster*). Manque d'info → demande.
2. **Existence** — `glab repo view mon-groupe/<nom>` et présence du dossier `<nom>/` ici.
   S'il existe déjà : ne rien créer, passer à l'étape 5 si l'architecture manque.
3. **🔒 Accord** — montre la commande exacte et attends l'accord explicite de l'utilisateur :
   `glab repo create mon-groupe/<nom> --private --description "<rôle>"`.
   Puis exécute-la.
4. **Clone** — depuis ce dossier : `git clone git@gitlab.com:mon-groupe/<nom>.git`.
   Branches : aligner sur les autres dépôts (ex. `Prod` par défaut, plus `Preprod`, `Develop`)
   seulement si l'utilisateur le confirme.
5. **Architecture** — travaille dans `<nom>/` (chemins absolus) et applique le skill
   `bootstrap-architecture` en prenant ce dossier comme racine du projet. Adapte-le au domaine :
   agents et skills prévus par le plan du projet s'il en existe un, inspirés de
   `app/.claude/` (dépôt d'exemple : même style, TDD, boucle minimale, protection des données).
6. **Vérifier** — `node <nom>/.claude/ci/check-config.js <nom>` finit par
   « Architecture Claude Code valide » ; `glab ci lint` sur son `.gitlab-ci.yml`.
7. **Carte** — ajoute le dépôt au tableau « Carte des dépôts » de `CLAUDE.md` (ici).
8. **Rendre compte** — fichiers créés, ce qui reste `_à définir_`, variables CI à créer
   (`ANTHROPIC_API_KEY`, `GITLAB_ACCESS_TOKEN` — selon le plan GitLab : jeton personnel d'un compte bot).
   Pas de commit ni de push sans accord ; ensuite, branche + MR via `/mr` dans ce dépôt.
