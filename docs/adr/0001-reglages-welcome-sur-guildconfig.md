# ADR-0001 : réglages du module Bienvenue sur `GuildConfig`

- **Date** : 2026-11-12
- **Statut** : accepté

## Contexte

Les réglages des modules existants (niveaux, tickets, TD2) sont des colonnes de `GuildConfig`.
Le cache du bot (`createGuildConfigCache`), son invalidation par l'événement `config.updated` et
`newGuildConfig` reposent tous sur cette table, qui compte déjà une vingtaine de colonnes.

## Décision

Ajouter 7 colonnes préfixées `welcome` et `goodbye` à `GuildConfig`, et `WELCOME` à l'énumération
`DashboardModule`. Tout est désactivé ou `null` par défaut : une guilde existante ne change pas de
comportement après la migration `welcome_goodbye`. Rien n'est stocké par membre.

## Options écartées

- Modèle dédié `WelcomeConfig` en relation 1-1 avec `Guild` : séparation plus nette, mais une
  seconde lecture dans le cache et `upsertGuild` / `newGuildConfig` à dupliquer.

## Conséquences

- Peu de code, migration additive.
- La table grossit encore.
- Retour en arrière : une migration qui retire les colonnes, destructive pour les réglages, donc
  soumise à l'accord de l'utilisateur.
- Le rôle d'arrivée (`welcomeRoleId`) est indépendant du message d'arrivée : choisir un rôle suffit
  à l'activer, `null` le désactive. `welcomeEnabled` ne commande que le message.
