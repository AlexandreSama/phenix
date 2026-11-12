# Glossaire de l'interface

Mot unique affiché aux personnes (bot, tableau de bord, site, docs) pour chaque concept. Les
identifiants techniques restent en anglais (voir `.claude/conventions-nommage.md`). Un nouveau mot
entre ici **avant** d'apparaître dans l'interface. Tenu par l'agent `nommage`.

Relevé fait sur le vocabulaire déjà en usage dans `apps/web`, `apps/bot` et `packages/shared`.

| Terme affiché           | Définition courte                                                                       | Identifiant technique                        | À ne pas employer                             |
| ----------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------- | --------------------------------------------- |
| serveur                 | Un serveur Discord où le bot est installé                                               | `guild`, `guildId`, `Guild`                  | guilde, server                                |
| membre                  | Personne présente sur un serveur                                                        | `member` ; option de commande `membre`       | joueur (hors Division 2), user                |
| utilisateur             | Compte Discord, hors du contexte d'un serveur (ex. débannir)                            | `user`, `userId`                             | membre pour une personne non présente         |
| salon                   | Salon textuel d'un serveur                                                              | `channel`, `…ChannelId`                      | channel, canal                                |
| catégorie               | Regroupement de salons (tickets)                                                        | `ticketCategoryId`                           | dossier                                       |
| rôle                    | Rôle Discord d'un serveur                                                               | `role`, `…RoleId`, `…RoleIds`                | grade                                         |
| tableau de bord         | Le site de gestion d'un serveur                                                         | `dashboard`, route `/dashboard`              | dashboard, panel                              |
| onglet                  | Une section du tableau de bord, une par module                                          | `DashboardModule`, `GUILD_TABS`              | page, menu                                    |
| accès délégué           | Droit donné par un admin à un membre d'ouvrir certains onglets                          | `GuildDelegate`, route `acces`               | permission, invité                            |
| délégué                 | Membre qui détient un accès délégué                                                     | `delegate`                                   | modérateur du site                            |
| ticket                  | Demande d'aide ouverte dans un salon dédié                                              | `Ticket`, `tickets`                          | billet                                        |
| transcript              | Copie archivée d'un ticket fermé                                                        | clé S3 `<guildId>/<id>.html`                 | journal du ticket                             |
| sanction                | Mesure de modération prise contre un membre                                             | `Case`, `/sanctions`                         | punition                                      |
| avertissement           | Sanction : simple rappel à l'ordre                                                      | `CaseType.WARN`                              | warn (en interface)                           |
| sourdine                | Sanction : membre rendu muet pour une durée                                             | `CaseType.MUTE`                              | mute (en interface)                           |
| expulsion               | Sanction : retrait du serveur, retour possible                                          | `CaseType.KICK`                              | kick (en interface)                           |
| bannissement            | Sanction : exclusion durable                                                            | `CaseType.BAN`                               | ban (en interface)                            |
| niveau                  | Palier d'ancienneté gagné avec l'XP                                                     | `leveling`, `LEVELING`                       | rang, level                                   |
| XP                      | Points d'expérience gagnés en écrivant                                                  | `xp…`                                        | points                                        |
| classement              | Liste des membres par XP                                                                | `leaderboard`, `/classement`                 | leaderboard (en interface)                    |
| panneau de rôles        | Message avec boutons pour s'attribuer des rôles                                         | `RolePanel`, `role-panels`                   | menu de rôles                                 |
| giveaway                | Tirage au sort avec récompense                                                          | `Giveaway`, `giveaways`                      | concours (non employé à ce jour)              |
| gagnant                 | Membre tiré au sort                                                                     | `winner`                                     |                                               |
| sortie                  | Activité planifiée (raid, incursion) de The Division 2                                  | `td2`, page publique `/sorties`              | event, événement                              |
| signalement             | Report d'un joueur au réseau The Division 2                                             | `td2Report…`                                 | report (en interface)                         |
| **Bienvenue** (onglet)  | Onglet du module qui accueille les arrivées et salue les départs                        | `DashboardModule.WELCOME`, `welcome`         | Accueil (réservé à la page d'accueil du site) |
| **message d'arrivée**   | Texte envoyé dans un salon quand un membre rejoint le serveur                           | `welcomeMessage`                             | message de bienvenue, join message            |
| **message de départ**   | Texte envoyé dans un salon quand un membre quitte le serveur                            | `goodbyeMessage`                             | message d'au revoir, leave message            |
| **rôle d'arrivée**      | Rôle donné automatiquement à chaque nouveau membre                                      | `welcomeRoleId`                              | rôle par défaut, rôle de bienvenue, autorôle  |
| **variable de message** | Mot entre accolades remplacé à l'envoi : `{membre}` `{pseudo}` `{serveur}` `{effectif}` | `WELCOME_VARIABLES`, `renderWelcomeTemplate` | placeholder, balise                           |

Notes sur les variables de message (à figer avant le code) :

- `{membre}` : mention du membre ; `{pseudo}` : son nom affiché sans mention ; `{serveur}` : nom
  du serveur ; `{effectif}` : nombre de membres du serveur (et non `{nombre}`, déjà pris par l’option de `/clear`).

Les lignes en gras sont les mots **ajoutés** pour le module de bienvenue ; ils restent à valider
avec le choix final des noms.
