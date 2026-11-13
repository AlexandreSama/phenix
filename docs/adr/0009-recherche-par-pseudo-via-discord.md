# ADR-0009 : recherche des sanctions par pseudo via Discord

- **Date** : 2026-11-13
- **Statut** : proposé

## Contexte

La liste des sanctions se cherche par numéro, identifiant ou raison. Les modérateurs pensent en pseudos,
que la base ne garde pas (ADR-0005 : pseudos résolus à la demande, cache `discord:users:<id>`).

## Décision

`ModerationService.list` interroge `GET /guilds/{id}/members/search` de Discord
(`DiscordService.searchGuildMembers` : préfixe sur le pseudo ou le surnom, membres présents
seulement). Conditions : texte de 2 à 32 caractères après `trim` (32 = longueur maximale d'un pseudo ou
d'un surnom Discord), ni un numéro ni un identifiant ; 25 résultats au plus ; échéance de 1,5 s. Un
texte de plus de 32 caractères n'est PAS envoyé à Discord ni comparé aux profils en cache (minimisation :
un mot de la raison, parfois sensible, ne part pas chez Discord) : `not-applicable`. Cache Valkey de
60 s, clé `discord:member-search:<guildId>:<sha256 du texte en minuscules>` (identifiants seulement ;
le texte n'y figure que haché, mais le SHA-256 n'est pas salé : c'est une PSEUDONYMISATION, un texte
court se retrouve par dictionnaire, pas une anonymisation). Limite de 20 recherches par minute et par compte, 60 par serveur (seules celles qui
partent chez Discord comptent).

S'y ajoutent les profils déjà en cache `discord:users:<id>` (ADR-0005) pour 500 cibles du serveur au
plus (`distinctCasePeople`, un MGET), dont le nom commence par le texte. Les identifiants trouvés
filtrent les sanctions dont la personne est la CIBLE OU le MODÉRATEUR, en plus de la recherche existante (numéro, identifiant, raison) via
`caseSearchWhere(q, userIds)`, plafonnés à 50.

La réponse porte `CasePage.nameSearch` : `used`, `unavailable` (toute erreur de Discord : 401, 403, 429, 5xx, réseau ; délai de 1,5 s ; limite de
débit atteinte ; Valkey en panne : retour à la recherche existante, que le site affiche ; l'échec
d'ÉCRITURE du cache après une réponse réussie de Discord ne fait pas perdre le résultat : écriture
facultative, `warn` générique), `not-applicable`.
Aucune copie du pseudo en base (ADR-0005 respecté). Logs : le statut seul.

## Options écartées

- **Colonne de pseudo sur `Case`** : copie qui vieillit, rejette l'ADR-0005.
- **Résoudre toutes les cibles** : trop d'appels Discord à froid.
- **`SCAN` des clés `discord:users:*`** : O(n) et traverse les serveurs.

## Conséquences

- Un banni ou un membre parti ne se retrouve que par identifiant, raison, ou si son profil est encore en
  cache (300 s).
- La liste peut attendre jusqu'à 1,5 s quand Discord ne répond pas.
- **Non vérifié** : les profils en cache utilisent `global_name ?? username` alors que `members/search`
  compare le pseudo ou le surnom ; les deux sources peuvent différer. À constater en dev.
- Les membres bots trouvés par Discord ne sont pas filtrés.
- **Limite connue** : un texte de 2 à 32 caractères qui n'est ni un numéro ni un identifiant PART chez
  Discord même s'il vise une raison (ex. un mot court de la raison).
- Le texte saisi part chez Discord, sous-traitant existant hors UE : transfert **à valider par un
  juriste**.
- Retour en arrière : retirer `member-search.ts`. Aucune donnée à migrer.
