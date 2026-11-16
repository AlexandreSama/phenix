# ADR-0016 : bonus d'XP, multiplicateurs qui se multiplient, plafonnés par serveur

- **Date** : 2026-11-16
- **Statut** : proposé

## Contexte

Un serveur veut récompenser certains membres (les boosters, un rôle de soutien) ou animer certains salons
(un salon d'événement, une catégorie de jeux) en leur donnant plus d'XP, ou à l'inverse en réduire le gain
(un salon de discussion libre). Le calcul doit être **prévisible et testable** : pour un même message,
toujours le même gain, sans dérive de flottants. Une combinaison de bonus ne doit pas faire exploser l'XP :
le total est donc borné par un plafond propre au serveur. Les délégués de l'onglet « Niveaux » règlent les
bonus **et** ce plafond, comme les autres réglages d'XP (décision de l'utilisateur) : le plafond borne le
produit des bonus, pas le pouvoir d'un délégué.

## Décision

L'XP d'un message est l'XP de base multipliée par un **pourcentage effectif**.

- **Produit des pourcentages entiers de tous les rôles du membre qui ont un bonus, multiplié par UN SEUL
  pourcentage de lieu** : celui du salon s'il en a un, sinon celui de sa catégorie. Un fil hérite de son salon
  parent, puis de la catégorie du parent.
- Le produit est **borné entre 10 % et `GuildConfig.xpMultiplierMaxPercent`** (300 % par défaut, réglable de
  100 % à 1000 %), donc jamais au-dessus de ×10 quoi qu'il arrive.
- Chaque bonus est un pourcentage entier de **10 à 500 %** ; **50 bonus au plus** par serveur, un rôle, un
  salon ou une catégorie n'y figurant qu'une fois.
- **Calcul exact en entiers (`BigInt`)**, sans flottant ni arrondi intermédiaire : le gain est arrondi **une
  seule fois**, à l'entier le plus proche, avec **au moins 1 XP**.
- La fonction pure vit dans `@phenix/shared` (`effectiveXp`, `resolveXpPercents`), donc le bot et les tests
  partagent le même calcul.
- Les bonus sont stockés dans la table `XpMultiplier`, clé `(guildId, targetId)`, avec un genre (`ROLE`,
  `CHANNEL`, `CATEGORY`).
- API : `GET` et `PUT /api/guilds/:guildId/leveling/xp-multipliers`, corps `{ "multipliers": [...] }`.
  Le `PUT` **remplace toute la liste de façon atomique** (une liste vide supprime tout) et prévient le bot par
  `config.updated`. Le plafond se règle avec `PATCH /api/guilds/:guildId/leveling` (`xpMultiplierMaxPercent`), route de
  l'onglet « Niveaux » : un délégué de cet onglet peut donc le modifier, comme les bonus eux-mêmes.
- À l'écriture, l'API vérifie que chaque entrée **ajoutée** correspond à un objet du serveur **et à son
  genre** : un rôle pour `ROLE`, un salon texte, annonces, vocal, scène, forum ou média pour `CHANNEL`, une
  catégorie pour `CATEGORY` ; le rôle `@everyone` (qui porte l'identifiant du serveur) est refusé (400), mais
  pas un salon qui aurait cet identifiant (salon par défaut des serveurs anciens). Un élément déjà enregistré
  mais disparu ne bloque pas l'enregistrement du reste. La réponse du `PUT` et le `GET` listent les bonus
  dans le même ordre : celui des identifiants, l'ordre de saisie n'étant pas conservé.
- Les **rôles gérés** (Booster, rôle d'intégration) peuvent **recevoir un bonus** : `GET /api/guilds/:guildId/roles` les
  liste avec `managed: true`, `assignable: false` et une raison. Ils ne sont **jamais attribuables** : les
  panels de rôles et le rôle de bienvenue refusent tout rôle non `assignable`.
- Le bot garde les bonus dans un cache propre, invalidé par l'événement `config.updated`.

## Options étudiées

- **A. Produit des rôles × un pourcentage de lieu, borné (retenue).** Plus : calcul simple à énoncer, un
  lieu ne compte qu'une fois, plafond réglable. Moins : un produit croît vite, d'où le plafond.
- **B. Bonus additifs.** Plus : croissance douce. Moins : contraire à la décision prise (les bonus se
  multiplient) et deux bonus de 200 % ne feraient que 300 %, ce qui surprend.
- **C. Salon × catégorie × rôles.** Plus : traitement uniforme des rôles, salons et catégories. Moins : double comptage
  involontaire, un salon et sa catégorie s'appliquant ensemble.
- **D. Plafond fixe dans le code.** Plus : simple, et aucun délégué n'y touche. Moins : non adaptable aux
  serveurs.

## Conséquences

- Plus : le gain est exact, reproductible et testé aux frontières ; le produit des bonus ne dépasse jamais
  le plafond du serveur (1000 % au plus).
- Moins : un délégué de l'onglet « Niveaux » peut régler le plafond lui-même, jusqu'à 1000 %. Si l'on veut le
  réserver aux administrateurs, il faudra un contrôle par champ sur `PATCH /leveling` : non fait ici.
- Moins : une table de plus et un second cache dans le bot.
- Moins : un rôle ou un salon supprimé reste en base sans effet ; le tableau de bord l'affiche comme supprimé
  jusqu'à ce qu'il soit retiré.
- Moins : `GET /roles` renvoie désormais les rôles gérés. Les routes qui ne vérifient que l'existence d'un rôle
  sans regarder `assignable` (giveaways, rôles de staff, TD2) les acceptent maintenant.
- Retour en arrière : vider la table `XpMultiplier` rétablit l'XP de base partout ; la table peut rester.

## Confirmation

`xp-multipliers.test.ts` côté `@phenix/shared` (frontières du calcul), `message-xp.test.ts` côté bot, et les
tests d'API de `app.test.ts` (blocs « bonus d'XP », « plafond du total des bonus d'XP » et « panels de
rôles »).
