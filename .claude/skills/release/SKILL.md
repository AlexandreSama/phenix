---
name: release
description: Prépare une release SemVer du monorepo — calcule la version suivante et le CHANGELOG à partir des Conventional Commits avec git-cliff, vérifie que la CI GitHub Actions est verte sur main et que les PR liées sont fusionnées, prépare la PR de release et le tag (jamais créé sans accord). À utiliser quand un lot de changements est prêt à être livré.
argument-hint: "[major|minor|patch | vide = version calculée]"
---

# /release

Niveau : $ARGUMENTS

Appuie le principe « un défaut doit être trouvé par un pair ou un outil » : la version et le
CHANGELOG viennent d'un outil existant, pas d'un calcul à la main. **Début** : des changements
fusionnés sur `main` depuis le dernier tag. **Fin** : une PR de release relue ; le tag n'est
posé qu'après son accord.

Une seule version pour tout le monorepo (bot, API et web livrés ensemble), tag `v<version>`,
`CHANGELOG.md` à la racine. Les `package.json` des paquets restent privés en `0.0.0`.

1. **État** — dépôt propre, sur `main` à jour ; dernier tag (`git describe --tags --abbrev=0` ;
   aucun tag encore → première release, proposer `0.1.0`) ; CI de `main` verte
   (`gh run list --branch main --limit 1`). Rouge → diagnostiquer (`gh run view --log-failed`),
   on ne publie pas.
2. **Version et CHANGELOG** — git-cliff, lancé en conteneur (rien à installer sur le poste), image
   **épinglée** (jamais `latest` ; la version exacte est choisie et vérifiée sur Docker Hub à la
   première mise en place). Sous Git Bash, désactiver la réécriture des chemins et donner le
   chemin Windows :
   `MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd -W):/app" -w /app orhunp/git-cliff:<version> --bumped-version`
   (PowerShell : `-v "${PWD}:/app"`), puis la même commande avec `--bump -o CHANGELOG.md`.
   Les options sont à confirmer dans la documentation de la version épinglée. La configuration
   `cliff.toml` traduit les types Conventional Commits en rubriques (`feat` → mineure, `fix` →
   correctif, `!` ou `BREAKING CHANGE` → majeure). Pas de `cliff.toml` encore : l'agent `versions`
   le propose d'abord (TDD : un petit historique de test dont on attend la version et le
   CHANGELOG, constaté rouge). L'historique actuel contient des commits hors convention
   (« Phase 10 : … », fusions de PR) : décider avec l'utilisateur comment les traiter (filtre
   dans `cliff.toml` ou point de départ au premier tag).
3. **Contrôle** — relis le CHANGELOG : un changement visible par les personnes (commande du bot,
   écran du dashboard, réglage, texte) est écrit en français clair ; une majeure ou un changement
   qui touche les données personnelles, un secret, l'authentification ou une migration Prisma
   destructive passe par `securite` (`opus`). Compare à la version demandée en argument : écart →
   question à l'utilisateur.
4. **Cohérence** — une release qui ajoute une variable d'environnement exige sa validation zod
   dans `env.ts` et sa ligne dans `.env.example` ; une migration Prisma exige son déploiement
   (`prisma migrate deploy`) **avant** le démarrage des nouvelles versions : indique l'ordre.
5. **PR de release** — branche `chore/release-<version>` depuis `main` : `CHANGELOG.md` (et
   `cliff.toml` à la première fois). Commit `chore(release): publier <version>`, PR via
   `gh pr create`.
6. **Tag** — après fusion et **accord explicite** : `git tag -a v<version> -m "v<version>"` puis
   `git push origin v<version>`. **Dis-le avant** : aujourd'hui la CI ne construit aucune image et
   aucun déploiement n'est en place, donc le tag marque une version mais ne livre rien. Ne
   présente pas la release comme déployée. Compte rendu : version, CHANGELOG, ordre de mise en
   service (migrations, variables), ce qui reste.

Retour arrière : une release ne se réécrit pas ; une version défectueuse se corrige par une
version de correctif.
