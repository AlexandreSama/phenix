# ADR-0013 : fermeture automatique par balayage BullMQ

- **Date** : 2026-11-13
- **Statut** : proposé

## Contexte

Chaque type de ticket peut avoir son propre délai d'inactivité. Fermer un ticket agit sur des personnes
(le salon est supprimé, le transcript archivé) : la politique de conception défensive de
`.claude/politique-qualite.md` s'applique. Il faut plusieurs signaux plutôt qu'un seul, des seuils
documentés, un journal de chaque décision, une annulation possible et une désactivation facile. La
sobriété compte aussi : un seul serveur auto-hébergé, donc pas de mesure qui coûte un appel Discord ou une
écriture Valkey par message. Le bot tourne en une seule instance.

## Décision

Une tâche BullMQ `inactivity` (file `tickets`) est planifiée toutes les 5 minutes et traitée par le bot,
un ticket à la fois, avec une erreur isolée par ticket.

**Mesure de l'activité**

- L'activité est un message de membre dans le salon du ticket, pièces jointes seules comprises. Elle est
  notée par `touchTicketActivity`, au plus une écriture par salon et par minute (erreur maximale d'environ
  60 s).
- Ne comptent pas : les messages de bots et les messages système (donc pas le rappel du bot), les fils de
  discussion du salon, les boutons (prise en charge comprise), les réactions et les modifications.

**Second signal**

La fermeture est précédée d'un second signal tiré de Discord : le dernier message de membre est relu
avant le transcript. Il couvre les écritures perdues et le bot éteint.

**Seuils** (D = délai du type)

- Rappel à D/2 d'inactivité. Jamais de fermeture sans rappel préalable, même après une panne.
- Fermeture à D **et** au moins D/2 après le rappel.
- Fermeture conditionnelle sur `lastActivityAt` (atomique : un message arrivé entre-temps l'annule).
- Délais proposés : 12 h, 24 h, 48 h, 72 h, 7 j. Désactivée par défaut (`null`), désactivable type par
  type.
- Au plus 10 fermetures par passage.

**Sélection des tickets à traiter**

- La base ne renvoie que les tickets **dus** (requête SQL paramétrée, gabarit balisé) : au moins D/2
  d'inactivité, ou rappel posté depuis au moins D/2 et D d'inactivité. Les serveurs que le bot a quittés
  et les types sans délai n'y figurent jamais.
- Plafonds : 25 tickets par serveur et 200 au total par passage, pour qu'un serveur ne monopolise pas
  le balayage (un gros serveur ou un serveur où le bot a perdu ses droits ne bloque pas les autres).
- Recul après échec : un ticket dont le traitement échoue (erreur Discord, Garage injoignable) est
  marqué (`inactivityFailedAt`) et n'est retenté qu'au bout d'une heure.
- Les règles « dû » existent à deux endroits : cette requête et la fonction pure `inactivityDecision`,
  qui reste le juge final. Un changement de règle doit toucher les deux ; les deux sont testées aux
  frontières.

**Cas particuliers**

- Garage injoignable : le ticket reste ouvert.
- Salon introuvable (code 10003) : fermeture `CHANNEL_DELETED` sans transcript.
- Transcript tronqué à 5000 messages : pas de fermeture automatique.
- Changer le délai d'un type remet à zéro les rappels déjà posés.
- Aucune demande de note de satisfaction après une fermeture automatique (contact non sollicité, voir
  ADR-0012).
- Fermeture automatique : `closedById` et `closedByName` nuls, `closedVia = INACTIVITY`.

**Journal**

Un log de nombres par passage, et un log par décision `{ ticketId, decision, inactivityHours }`. Aucun
identifiant de membre ni pseudo.

## Options écartées

- **A. Balayage périodique (retenue).** Plus : une écriture par minute et par salon actif au plus, une
  seule tâche, BullMQ donne l'exécution unique. Moins : jusqu'à 5 minutes d'écart.
- **B. Une tâche différée par ticket, replanifiée à chaque message.** Plus : précision à la seconde.
  Moins : une écriture Valkey par message.
- **C. Lecture de `lastMessageId` sur Discord.** Plus : pas d'écriture. Moins : les messages du bot
  faussent la mesure, et un appel d'API par ticket et par passage.
- **D. `setInterval` comme `startBanExpiry`.** Plus : simple. Moins : pas d'exécution unique entre
  instances, et BullMQ est demandé pour les tâches asynchrones.

## Conséquences

- Plus : fermeture défendable (deux signaux, rappel obligatoire, journal), coût borné.
- Moins : jusqu'à 5 minutes d'écart sur l'heure de fermeture ; une écriture par minute dans un salon actif.
- Retour en arrière : supprimer le planificateur, puis les colonnes (migration destructive, accord requis).

## Limites connues et risques résiduels

1. **Pas de mode observation ni d'interrupteur global.** La politique qualité demande un mode observation
   avant le mode action. Proposition : une variable d'environnement validée dans `env.ts`,
   `TICKET_INACTIVITY_MODE=off|observe|act`. Non faite dans cette PR.
2. **Pas de réouverture** : le transcript reste, le membre ouvre un nouveau ticket.
3. **Une écriture d'activité par minute pour tout salon actif du bot**, pas seulement les tickets. Elle est
   peu coûteuse grâce à l'index unique ; un filtrage par cache de tickets ouverts reste possible plus tard.
4. **Les fils de discussion ne comptent pas** : un échange qui se poursuit dans un fil n'évite pas la
   fermeture.
5. **Arrêt du conteneur pendant un passage** : un ticket peut rester fermé en base sans salon supprimé.
6. **Aucune durée de conservation des transcripts** (à valider par un juriste, voir ADR-0011).

## À valider par un juriste

- Information des membres que leurs messages sont archivés à la fermeture, y compris automatique, et que le
  salon est ensuite supprimé.
- Durée de conservation des transcripts.

## Confirmation

`inactivity.test.ts`, `activity.test.ts`, tests d'intégration de la base et de la file, relecture, et
`aql-tests`.
