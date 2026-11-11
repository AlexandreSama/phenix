---
name: priorites
description: Aide à décider quoi faire — SWOT, tableaux plus / moins et matrice coût / valeur (ou score RICE) par l'agent stratege, sur des fonctionnalités du bot ou du dashboard, des modules, des chantiers ou des choix techniques, puis ordre de priorité recommandé. À utiliser pour choisir entre plusieurs options, préparer une réunion de décision ou réordonner le backlog.
argument-hint: "<question ou liste d'options> [swot]"
---

# /priorites

Demande : $ARGUMENTS

1. **Cadrage** — la question à trancher et les options. Pas d'options données → les tirer des
   issues ouvertes et des jalons GitHub (agent `chef-de-projet`, lecture seule).
2. **Données** — ce qui existe : la page « Métriques » du dashboard et les données de
   `packages/metrics` (agent `observabilite`, chiffres agrégés seulement, aucun identifiant
   Discord), usage des modules du bot, avis des agents spécialistes concernés.
3. **Analyse** — agent `stratege` : SWOT si demandé ou si la question est stratégique, plus /
   moins par option, matrice coût / valeur, recommandation, hypothèses et données à récolter.
4. **Présenter** les tableaux tels quels ; l'équipe décide.
5. **Suite** — décision prise → `/planifier` pour en faire des issues ; décision notée dans
   `docs/decisions/<AAAA-MM-JJ>-<sujet>.md` si l'utilisateur le souhaite.
