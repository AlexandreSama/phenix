# ADR-0005 : pseudos et avatars résolus à la demande, en cache Valkey

- **Date** : 2026-11-12
- **Statut** : accepté

## Contexte

`Case` ne stocke que des identifiants Discord. Le site doit afficher des pseudos et des avatars.
Discord limite le débit (`@discordjs/rest` met tous les `/users/:id` dans une seule file, traitée l'un
après l'autre). Minimisation des données personnelles : pas de copie durable du pseudo. Un membre
banni n'est plus membre du serveur.

## Décision

L'API résout les identifiants de la page affichée par `GET /users/{id}` (profil global), sans doublon.
Cache `discord:users:<id>` dans Valkey : profil 300 s, échec 60 s (nom et hash d'avatar seulement).
Budget par page : un seul accès Valkey groupé (MGET), 10 profils absents du cache au plus, 4 à la fois,
échéance de 2 s, un seul appel en vol par identifiant. Au-delà, ou si Discord ou Valkey ne répondent
pas, l'identifiant s'affiche et le rafraîchissement suivant complète. Une fiche de membre sans aucune
sanction n'appelle pas Discord. Un statut 401, 403 ou 429 de Discord est journalisé (le statut seul,
sans identifiant).

## Options écartées

- Colonne de pseudo sur `Case` : copie de donnée personnelle qui vieillit, migration, anciennes
  sanctions sans pseudo.
- Membre du serveur (`GET member`) : échoue pour un banni ou un membre parti.
- Identifiant brut seulement : inutilisable pour une équipe de modération.

## Conséquences

- Premier chargement parfois partiel ; pas de surnom propre au serveur.
- Retour en arrière : supprimer le résolveur.
