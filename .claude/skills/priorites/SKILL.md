---
name: priorites
description: Aide à décider quoi faire — SWOT, tableaux plus / moins et matrice coût / valeur (ou score RICE) par l'agent stratege, sur des fonctionnalités, modules, chantiers ou choix techniques, puis ordre de priorité recommandé. À utiliser pour choisir entre plusieurs options, préparer une réunion de décision ou réordonner le backlog.
argument-hint: "<question ou liste d'options> [swot]"
---

# /priorites

Demande : $ARGUMENTS

1. **Cadrage** — la question à trancher et les options. Pas d'options données → les tirer des
   issues ouvertes et des jalons (agent `chef-de-projet`, lecture seule).
2. **Données** — ce qui existe : métriques métier (agent `observabilite`), thèmes des tickets
   d'assistance éventuels (références seulement), avis des agents spécialistes concernés.
3. **Analyse** — agent `stratege` : SWOT si demandé ou si la question est stratégique, plus /
   moins par option, matrice coût / valeur, recommandation, hypothèses et données à récolter.
4. **Présenter** les tableaux tels quels ; l'équipe décide.
5. **Suite** — décision prise → `/planifier` pour en faire des issues ; décision notée dans
   `docs/decisions/<date>-<sujet>.md` du dépôt concerné si l'utilisateur le souhaite.
