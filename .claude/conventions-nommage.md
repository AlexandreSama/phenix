# Conventions de nommage du projet

Fichier **identique** dans `.claude/` de l'espace de travail et de chaque dépôt (importé par
`CLAUDE.md`). Un même concept porte **le même nom partout** : code, base, métriques, manifests,
infra, issues, docs et interface. En cas de doute ou de nom nouveau qui sort de ces règles :
agent `nommage`, et question à l'utilisateur.

## Règles générales

- **Identifiants techniques en anglais**, textes affichés aux personnes en **français**.
- Un nom dit ce que c'est, sans abréviation obscure ; pas de synonymes pour la même chose
  (ex. toujours `guild` dans le code, jamais `server` ici et `guild` là ; « serveur » côté interface).
- Le singulier pour un élément, le pluriel pour une collection.

## Par domaine

| Domaine | Règle | Exemple |
|---|---|---|
| Paquets / crates | `<projet>-<rôle>` ; modules : `<projet>-mod-<id>` | `app-core`, `app-mod-welcome` |
| Identifiant de module (`id`) | anglais, `snake_case`, court, stable, **jamais réutilisé** | `welcome`, `auto_moderation` |
| Code | conventions du langage (ex. Rust : `snake_case` fonctions et variables, `UpperCamelCase` types, `SCREAMING_SNAKE_CASE` constantes) | `fn purge_tenant_data`, `struct TenantSettings` |
| Tables et colonnes SQL | `snake_case` ; tables d'un module préfixées `<id>_` ; tables au pluriel ; clés étrangères `<table_au_singulier>_id` | `welcome_messages`, `guild_id` |
| Migrations | `<horodatage>_<id du module ou core>_<action>` | `20261106120000_welcome_create_messages` |
| Commandes slash | **nom de base en anglais**, minuscules, tirets si besoin ; **traduction française** obligatoire (`name_localizations` / `description_localizations` pour `fr`) | `/welcome` → `/bienvenue` |
| Variables d'environnement | préfixe **`APP_`**, `SCREAMING_SNAKE_CASE` ; exception possible : `DATABASE_URL` pour les seuls outils qui l'imposent (développement et CI) | `APP_API_TOKEN`, `APP_DATABASE_URL` |
| Métriques Prometheus | `app_<composant>_<grandeur>_<unité de base>`, compteurs en `_total`, ratios en `_ratio` ; labels en `snake_case`, à valeurs bornées | `app_api_request_duration_seconds` |
| Ressources Kubernetes | minuscules et tirets ; labels `app.kubernetes.io/{name,component,part-of,instance}`, `part-of: app` ; namespaces `app`, `app-staging` | `deployment-web.yaml` → `name: web` |
| Fichiers de manifests | `<kind>-<nom>.yaml` en minuscules ; secrets `<nom>.sops.yaml` | `networkpolicy-default-deny.yaml` |
| Secrets Kubernetes | `<application>-<usage>` | `app-api`, `app-database` |
| Rôles et variables Ansible | rôles en `snake_case` ; variables préfixées par le rôle | `k3s_version`, `wireguard_peers` |
| OpenTofu | ressources et variables en `snake_case`, nom = rôle de l'objet | `proxmox_virtual_environment_vm.k3s` |
| Branches Git | `feat/<n°>-<sujet>`, `fix/<n°>-<sujet>`, `chore/<sujet>` (n° de l'issue GitLab) | `feat/42-welcome-module` |
| Commits | Conventional Commits en français : `type(portée): résumé à l'impératif` | `feat(welcome): ajouter le message de bienvenue` |
| Étiquettes GitLab | `type/…`, `priorite/…`, `etat/…`, `donnees-personnelles` | `type/bug` |
| Agents et skills Claude | minuscules et tirets, en français ; `name:` = nom du fichier | `chef-de-projet`, `/point-projet` |
| Documents | minuscules et tirets ; dates `AAAA-MM-JJ` en tête des fichiers datés | `docs/qualite/audits/2026-11-06.md` |

## Vocabulaire de l'interface (français)

Le **glossaire** `docs/glossaire.md` fixe le mot unique affiché pour chaque concept
(ex. *serveur* pour guild, *module*, *réglage*, *salon*, *rôle*, *membre*). Le bot, le dashboard et
la doc l'utilisent à l'identique ; un nouveau mot y entre avant d'apparaître dans l'interface.
