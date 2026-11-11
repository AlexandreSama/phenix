---
name: orchestrer
description: Orchestre une tâche de bout en bout — la découpe en étapes, choisit pour chacune l'agent, le modèle et le niveau d'effort selon .claude/routage-modeles.md, montre le plan, l'exécute avec escalade si besoin et rend compte. À utiliser pour toute tâche qui demande plusieurs agents ou dont la difficulté varie d'une étape à l'autre.
argument-hint: "<la tâche>"
---

# /orchestrer

Tâche : $ARGUMENTS

Barème : `.claude/routage-modeles.md` (importé par `CLAUDE.md`). Tu es l'orchestrateur : tu
délègues, tu ne fais toi-même que les petites tâches directes.

1. **Comprendre** — lis `CLAUDE.md` du dépôt concerné (ou de l'espace de travail si la tâche est
   transverse). Ambiguïté qui change le plan → pose la question avant tout.
2. **Choisir le workflow** — si un skill couvre la tâche (`/feature`, `/bug`, `/module`,
   `/nouvelle-app`, `/provisionner`, `/incident`…), suis-le : `/orchestrer` ne fait qu'y
   ajouter le choix du modèle et de l'effort à chaque étape.
3. **Découper** en étapes courtes (TDD : validations et tests d'abord). Pour chaque étape :
   agent, modèle, effort, raison si tu t'écartes de la valeur par défaut de l'agent.
4. **Montrer le plan** à l'utilisateur sous forme de tableau :
   `# | étape | agent | modèle | effort | pourquoi`. Si `fable` apparaît, dis-le et pourquoi.
   Attends son accord quand le plan touche la production, des secrets, des données
   personnelles ou plus de 2 dépôts ; sinon, enchaîne.
5. **Exécuter** — appelle chaque agent avec `model` et `effort` selon le plan. Étapes
   indépendantes → en parallèle ; étapes dépendantes → dans l'ordre. Lis le résultat de chaque
   étape avant la suivante. Applique les règles d'escalade du barème (au plus deux sans
   en parler, `fable` toujours annoncé).
6. **Vérifier** — tests, validations et relecture lancés réellement, sortie montrée.
7. **Compte rendu** — ce qui a été fait, par quel agent et quel modèle et effort, escalades et
   leur raison, ce qui reste. Pas de commit ni de push sans accord (`/mr`).
