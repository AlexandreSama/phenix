# ADR-0003 : rendu des modèles de message dans `@phenix/shared`

- **Date** : 2026-11-12
- **Statut** : accepté

## Contexte

Le bot produit le texte des messages d'arrivée et de départ ; le site doit pouvoir valider le même
modèle. L'échappement du markdown est propre à discord.js.

## Décision

Mettre dans `@phenix/shared` le schéma zod du modèle et `renderWelcomeTemplate(modèle, valeurs, type)`,
fonction pure : un seul passage avec fonction de remplacement (une valeur égale à `{serveur}` n'est
pas redéveloppée, `$&` n'est pas interprété), troncature à 4096 unités UTF-16 (limite de
discord.js, sans couper une paire de surrogates). Le rendu n'échappe rien : le bot échappe les
valeurs (`escapeMarkdown`, mentions neutralisées dans `{pseudo}`) avant l'appel.

Variables : `{membre}`, `{pseudo}`, `{serveur}`, `{effectif}` (`{nombre}` est déjà pris par
`/clear`). Le refus de `@everyone`, `@here` et `<@&id>` par zod n'est qu'une aide à la saisie : le
vrai contrôle est `allowedMentions` (`{ users: [id] }` à l'arrivée, `{ parse: [] }` au départ).

## Conséquences

- Une seule règle, testée une fois ; l'API publique de shared grossit.
- Retour en arrière : déplacer la fonction dans le bot.
