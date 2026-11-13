# ADR-0011 : réponses du formulaire jamais stockées en base

- **Date** : 2026-11-13
- **Statut** : proposé

## Contexte

Minimisation des données (RGPD, voir `CLAUDE.md`). L'équipe doit lire les réponses du formulaire
d'ouverture d'un ticket et le transcript doit les contenir. Ce qui est juridique est à valider par un
juriste.

## Décision

Les réponses sont postées en embeds dans le salon du ticket, avec `allowedMentions: { parse: [] }`. Elles
entrent dans le transcript Garage par le chemin existant. Elles ne sont JAMAIS écrites en base ni dans
les logs : le logger du bot masque `requestBody` des erreurs Discord, qui contient les embeds.

## Options écartées

- **Postées dans le salon (retenue).** Plus : aucune donnée en base, aucun nouveau stockage. Moins : pas
  de recherche dans les réponses.
- **Colonne `Json` sur `Ticket`.** Plus : recherche possible. Moins : copie durable de données
  personnelles à purger et à exporter.
- **Objet Garage séparé.** Plus : isolation. Moins : un second objet à gérer pour rien.

## Conséquences

- Plus : aucune donnée personnelle de formulaire en base.
- Moins : les réponses vivent aussi longtemps que le transcript, qui n'a aujourd'hui AUCUNE durée de
  conservation.
- Neutre : une question supprimée entre l'ouverture du formulaire et son envoi s'affiche « Question
  supprimée ».
- Retour en arrière : aucun schéma à défaire.
- **À valider par un juriste** : base légale et durée de conservation des transcripts, suppression à la
  demande, information du membre dans le formulaire, risque de données sensibles (art. 9 RGPD), surtout
  pour un type « recrutement » ou « signalement ».

## Confirmation

`open.test.ts`, `messages.test.ts` et le test du logger.
