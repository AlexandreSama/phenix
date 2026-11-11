# Routage des modèles et de l'effort (orchestration)

Fichier **identique** dans `.claude/` de l'espace de travail et de chaque dépôt (importé par
`CLAUDE.md`). Le modifier dans l'espace de travail puis le recopier dans chaque dépôt.

La session principale est l'**orchestrateur** : elle découpe le travail, confie chaque étape à
l'agent adapté et **choisit le modèle et l'effort** de chaque appel selon ce barème. Ce fichier
l'autorise explicitement à passer les paramètres `model` et `effort` à l'outil Agent ; sans
raison de s'en écarter, elle laisse les valeurs par défaut de l'agent (son en-tête).

## Modèles (novembre 2026, prix par million de jetons entrée / sortie)

| Modèle   | Pour quoi                                                      | Prix          |
|----------|----------------------------------------------------------------|---------------|
| `haiku`  | lecture, recherche, tri, tâches mécaniques — le plus rapide    | dès 0,10 / 0,50 $ |
| `sonnet` | implémentation et tests selon un plan clair — meilleur rapport vitesse/qualité | 2 / 10 $ |
| `opus`   | plan, revue, sécurité, RGPD, infra de production — défaut des tâches délicates | 4 / 20 $ |
| `fable`  | raisonnement le plus exigeant, problèmes longs non résolus par `opus` | 10 / 50 $ |

Effort : `low` < `medium` < `high` (tous les modèles) < `xhigh` < `max` (`opus` et `fable` seulement).

## Valeurs par défaut des agents

| Agent             | Modèle   | Effort   | Pourquoi                                         |
|-------------------|----------|----------|--------------------------------------------------|
| `architecte`      | `opus`   | `high`   | un mauvais plan coûte plus cher que le plan      |
| `developpeur`     | `sonnet` | `high`   | code minimal guidé par des tests déjà écrits     |
| `testeur`         | `sonnet` | `medium` | tests à partir d'un plan qui les liste           |
| `base-de-donnees` | `sonnet` | `high`   | schéma et migrations : précision requise         |
| `devops`          | `sonnet` | `high`   | manifests, rôles, CI suivant des règles écrites  |
| `observabilite`   | `sonnet` | `medium` | métriques, règles d'alerte, tableaux de bord     |
| `documentaliste`  | `sonnet` | `low`    | rédaction à partir du diff                       |
| `chef-de-projet`  | `sonnet` | `medium` | découpage en issues, suivi d'avancement          |
| `relecteur`       | `opus`   | `medium` | trouver les vrais bugs sans faux positifs        |
| `securite`        | `opus`   | `high`   | une faille manquée coûte cher                    |
| `qualite`         | `opus`   | `medium` | pilotage AQL, indicateurs, feu vert de production |
| `aql-tests`       | `sonnet` | `high`   | analyse méthodique de l'adéquation des tests     |
| `aql-revues`      | `opus`   | `medium` | inspections et audits : jugement contre les sources |
| `aql-ia`          | `opus`   | `medium` | sécurité des artefacts générés par l'IA          |
| `nommage`         | `sonnet` | `medium` | application de règles écrites, recherche de cohérence |
| `versions`        | `sonnet` | `medium` | lecture de changelogs, verdict sur les MR de dépendances, préparation de release (plancher `opus` si sécurité / production) |
| `stratege`        | `opus`   | `medium` | SWOT, coût / valeur : jugement et hypothèses     |

## Barème par type de tâche (surcharge à l'appel)

| Tâche                                                              | Modèle   | Effort   |
|--------------------------------------------------------------------|----------|----------|
| Explorer, chercher, lister, résumer des logs (agent `Explore` ou autre) | `haiku`  | `low`    |
| Mécanique : renommage, ligne de CHANGELOG, reformatage, copie de fichiers | `haiku`  | `medium` |
| Documentation                                                      | `sonnet` | `low`    |
| Planification en issues, point d'avancement (`/planifier`, `/point-projet`) | `sonnet` | `medium` |
| Diagnostic de pipeline CI (`/pipeline`)                            | `sonnet` | `medium` |
| Tests (phase rouge) et code minimal (phase verte) selon un plan validé | `sonnet` | `medium`/`high` |
| Manifests, rôles Ansible, OpenTofu sans impact production          | `sonnet` | `high`   |
| Plan d'une fonctionnalité, d'un module, d'un composant             | `opus`   | `high`   |
| Revue de diff (gros diff ou zone sensible : `high`)                | `opus`   | `medium` |
| Sécurité, secrets, RGPD, données personnelles                      | `opus`   | `high`   |
| Audit qualité (`/qualite`) ; feu vert de mise en production : effort `high` | `opus` | `medium` |
| Inspection formelle d'un artefact critique (`/inspection`)          | `opus`   | `high`   |
| SWOT, plus / moins, coût / valeur (`/priorites`) | `opus` | `medium` |
| Changement touchant la production réelle (réseau, stockage, accès, migration destructive, plan de `tofu apply` / playbook) | `opus` | `high` |
| Incident de production (`/incident`)                               | `opus`   | `high`   |
| Décision d'architecture transverse et difficile à défaire, ou problème toujours non résolu après `opus` `xhigh` | `fable` | `high` |

## Règles

1. **Plancher** : jamais en dessous de `opus` pour la sécurité, les secrets, les données personnelles, la
   production réelle et les migrations destructives, même si la tâche paraît petite.
2. **Escalade** : un échec réel (test rouge inexpliqué après correction, verdict bloquant
   répété du relecteur, sortie incohérente) → d'abord l'effort d'un cran, puis le modèle
   (`haiku` → `sonnet` → `opus` → `fable`). Au plus **deux escalades** sans en parler à
   l'utilisateur ; au-delà, s'arrêter et lui exposer le blocage.
3. **`fable` est toujours annoncé** à l'utilisateur avant l'appel, avec la raison (coût ×2,5
   par rapport à `opus`).
4. **Désescalade** : une grosse tâche se découpe ; les sous-tâches simples (lecture, inventaire,
   mécanique) partent vers `haiku`, même au milieu d'un travail délicat.
5. **Pas d'agent pour une tâche triviale** : une lecture de fichier ou une petite modification
   se fait directement, sans sous-agent.
6. **Traçabilité** : le plan d'orchestration annonce, pour chaque étape, l'agent, le modèle et
   l'effort choisis ; le compte rendu final signale toute escalade et sa raison.
7. **Session principale = orchestrateur, par défaut** : le hook `SessionStart`
   (`.claude/hooks/orchestrateur.js`) lui donne ce rôle à chaque démarrage, reprise et
   compaction, et `.claude/settings.json` la fait tourner sur `sonnet`, effort `high` : deux fois
   moins cher qu'`opus` sur toute la durée de la session, les tâches délicates partant de toute
   façon vers des agents `opus` (règle 1). Session d'architecture ou d'incident : `/model opus`. Changer
   pour une session : `/model`, `/effort`. Changer pour soi seul dans un dossier :
   `.claude/settings.local.json` (non commité), par exemple `{"model": "fable", "effortLevel": "high"}`.
