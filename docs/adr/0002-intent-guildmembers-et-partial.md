# ADR-0002 : intent `GuildMembers` et partial `GuildMember`

- **Date** : 2026-11-12
- **Statut** : accepté

## Contexte

Sans l'intent privilégié « Server Members », Discord n'envoie aucun événement d'arrivée, de départ
ou de mise à jour de membre. Sans `Partials.GuildMember`, discord.js ignore le départ d'un membre
absent du cache (arrivé avant le dernier redémarrage). Charger tous les membres au démarrage coûte
de la mémoire et des appels REST, contre le principe de sobriété.

## Décision

Activer `GatewayIntentBits.GuildMembers` et `Partials.GuildMember`, sans charger les membres au
démarrage. L'intent est à activer dans le portail développeur Discord ; au-delà de 100 serveurs,
Discord demande une vérification.

Si l'intent n'est pas activé, la connexion est fermée avec le code 4014 : le bot journalise une
erreur `fatal` explicite (`createShardDisconnectHandler`) mais le processus reste en vie, sans
connexion. Choix de l'utilisateur : ne pas arrêter le processus, pour éviter une boucle de
redémarrage sous un superviseur.

## Conséquences

- Le code tolère les membres partiels (`member.user` pour le pseudo et l'avatar au départ).
- Le rôle d'arrivée n'est donné qu'au passage `pending` vrai → faux d'un membre non partiel.
  Limite connue : un membre arrivé pendant sa vérification, puis présent lors d'un redémarrage du
  bot, ne reçoit pas le rôle (protection par défaut).
- Les événements de tous les membres de tous les serveurs sont traités même module désactivé :
  sortie immédiate, rien n'est stocké. **À valider par un juriste** : base légale et information
  des membres sur la publication du pseudo et de l'avatar dans le salon.
- Retour en arrière : retirer l'intent et le partial ; le module devient inerte.
