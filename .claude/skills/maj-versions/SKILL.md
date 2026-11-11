---
name: maj-versions
description: Traite les mises à jour de dépendances proposées par Renovate (MR et tableau de bord) — lit les changelogs, vérifie compatibilité et sécurité entre dépôts, et dit quoi fusionner, quoi approuver, quoi reporter, par l'agent versions. À utiliser en début de semaine, quand Renovate ouvre une MR de dépendance, ou avant une release.
argument-hint: "[dépôt | MR | composant | vide = tous les dépôts]"
---

# /maj-versions

Périmètre : $ARGUMENTS (vide = tous les dépôts du projet, ex. `app`, `gitops`, `infra`)

Appuie le principe « petits pas » et « signaler, ne jamais taire » de la politique qualité.
**Début** : le tableau de bord Renovate ou une MR `type/dependances` existe. **Fin** : chaque
mise à jour a un verdict écrit et les actions à faire sont listées.

1. **Inventaire** — `glab mr list -R mon-groupe/<dépôt> --label type/dependances` et l'issue
   « Tableau de bord des dépendances (Renovate) » de chaque dépôt (lecture seule). Note ce qui
   attend une approbation (majeures, k3s) et ce qui est bloqué par la CI.
2. **Analyse** — agent `versions` (`sonnet`, `medium`) pour chaque mise à jour non automatique :
   changelog, compatibilité, avis de sécurité. Mises à jour de sécurité, k3s, cert-manager,
   base de données, stockage : revue par `securite` ou `relecteur` en `opus` (plancher du barème).
3. **Ordre** — si une montée dans un dépôt impose une MR dans un autre, annonce l'ordre de fusion.
4. **Rapport** — tableau `composant | dépôt | avant → après | verdict | action`, plus les 3
   prochaines actions. **Rien n'est fusionné, approuvé ni commenté sans l'accord de l'utilisateur.**
5. Une version épinglée sans annotation `# renovate:` ou une règle Renovate à changer : modifie
   `renovate.json` (copie commune de l'espace de travail), valide-le (`npx --yes --package renovate@44.177.0 -- renovate-config-validator --strict renovate.json`,
   version alignée sur l'image `renovate/renovate` de la CI),
   recopie-le dans chaque dépôt, une MR par dépôt.
