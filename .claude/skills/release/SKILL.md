---
name: release
description: Prépare une release SemVer d'un dépôt — calcule la version suivante et le CHANGELOG à partir des Conventional Commits avec git-cliff, vérifie que la CI est verte et que les MR liées sont fusionnées, prépare la MR de release et le tag (jamais créé sans accord). À utiliser quand un lot de changements est prêt à être livré.
argument-hint: "<dépôt> [major|minor|patch | vide = version calculée]"
---

# /release

Dépôt et niveau : $ARGUMENTS

Appuie le principe « un défaut doit être trouvé par un pair ou un outil » : la version et le
CHANGELOG viennent d'un outil existant, pas d'un calcul à la main. **Début** : des changements
fusionnés sur `Prod` depuis le dernier tag. **Fin** : une MR de release relue ; le tag n'est
posé qu'après son accord.

1. **État** — dépôt propre, sur `Prod` à jour ; dernier tag (`git describe --tags --abbrev=0`) ;
   pipeline de `Prod` vert (`glab ci status`). Rouge → `/pipeline`, on ne publie pas.
2. **Version et CHANGELOG** — git-cliff, lancé en conteneur (rien à installer sur le poste), image
   **épinglée** (jamais `latest` ; la version exacte est choisie et vérifiée sur Docker Hub à la
   première mise en place, annotée `# renovate:` pour être suivie). Sous Git Bash, désactiver la
   réécriture des chemins et donner le chemin Windows :
   `MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd -W):/app" -w /app orhunp/git-cliff:<version> --bumped-version`
   (PowerShell : `-v "${PWD}:/app"`), puis la même commande avec `--bump -o CHANGELOG.md`.
   Les options sont à confirmer dans la documentation de la version épinglée. La configuration `cliff.toml` du dépôt traduit les types
   Conventional Commits en rubriques (`feat` → mineure, `fix` → correctif, `!` ou
   `BREAKING CHANGE` → majeure). Pas de `cliff.toml` encore : agent `versions` le propose d'abord
   (TDD : un petit historique de test dont on attend la version et le CHANGELOG, constaté rouge).
3. **Contrôle** — relis le CHANGELOG : un changement visible par les personnes (commande,
   réglage, texte) est écrit en français clair ; une majeure ou un changement qui touche
   les données personnelles, un secret ou la production passe par `securite`
   (`opus`) et une vérification de conformité des données personnelles. Compare à la version demandée en argument : écart → question à l'utilisateur.
4. **Cohérence entre dépôts** — une release de `app` (dépôt d'exemple) qui ajoute une variable
   `APP_*` ou un secret exige la MR `gitops` correspondante, **avant** que Flux ne
   tire la nouvelle image : indique l'ordre.
5. **MR de release** — branche `chore/release-<version>` depuis `Prod` : `CHANGELOG.md` et, pour
   un projet Rust (`app`) **dès que le workspace Cargo existe**, sa version ; une MR (skill `/mr`).
   Commit `chore(release): publier <version>`.
6. **Tag** — après fusion et **accord explicite** : `git tag -a v<version>` puis `git push` du
   tag. **Vérifie avant** ce que ce tag déclenche réellement : si la CI de `app`
   ne construit ni ne pousse d'image ou si `gitops` n'a pas encore d'overlay ; tant que ces
   deux maillons n'existent pas, le tag ne livre rien — dis-le à l'utilisateur au lieu de
   présenter la release comme livrée. Une fois en place : la CI construit et pousse l'image
   taguée (SemVer immuable), Flux la déploie via l'overlay. Compte rendu : version, CHANGELOG,
   ordre des MR, ce qui reste.

Retour arrière : une release ne se réécrit pas ; une version défectueuse se corrige par une
version de correctif.
