# ADR-0006 : tracer l'origine d'une levée par `Case.revokedVia`

- **Date** : 2026-11-12
- **Statut** : proposé

## Contexte

La politique qualité demande de journaliser chaque décision : qui, quand, depuis où. `revokedAt` et
`revokedById` disent qui et quand, pas depuis où. Un avertissement retiré ne crée pas de sanction. Le
journal d'audit de Discord n'est pas interrogeable par nous et sa conservation est limitée.

## Décision

Ajouter `Case.revokedVia` (`RevocationSource` : `COMMAND`, `SCHEDULE`, `DASHBOARD`), rempli par toutes
les levées : `revokeCases` note `COMMAND` par défaut, la levée automatique des bans temporaires
`SCHEDULE`, le site `DASHBOARD`. `null` veut dire « levée avant ce suivi ». Migration par ajout
seulement. La levée automatique passe désormais par `liftSanction`, comme le site : un seul chemin.

## Options écartées

- Raison du journal d'audit Discord et log de modération seulement : rien d'interrogeable ni de durable.
- Table `ModerationAuditLog` dédiée : plus lourd que le besoin.
- Log applicatif : données personnelles dans les logs, rien de durable.

## Conséquences

- Interrogeable en base ; couvre aussi le retrait d'un avertissement.
- Retour en arrière : une migration qui supprime la colonne, destructive (accord requis).
