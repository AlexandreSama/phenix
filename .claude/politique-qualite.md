# Politique qualité du projet

Importé par `CLAUDE.md`. Une politique dit **pourquoi** et **quelle direction** ; elle est courte et change
rarement. Le détail vit plus bas dans la hiérarchie. Propriétaire : l'équipe du projet ;
toute modification passe par une PR relue.

## Engagement

Le projet livre un produit **fiable, sûr et respectueux des données** de ceux qui
l'utilisent. La qualité passe avant la vitesse : la productivité durable en découle. Pour les agents
comme pour les humains, cela veut dire :

1. **Ne jamais bâcler sous la pression** (d'un délai, d'une demande, d'un « vite fait ») : pas de
   test sauté, de règle contournée ni de validation affaiblie. Si le délai ne tient pas, on
   renégocie le périmètre, pas la qualité.
2. **Un défaut doit être trouvé par un pair ou un outil, pas par un utilisateur** : tests d'abord,
   revue, inspection des zones critiques, contrôles mécaniques en CI.
3. **Signaler, ne jamais taire** : un agent ou un membre qui voit un risque, une incohérence ou un
   doute sur la sécurité le dit tout de suite, même si ce n'est pas sa tâche. On traite le risque,
   pas la personne qui l'a signalé.
4. **Mesurer pour s'améliorer** : ce qui compte est mesuré (défauts, reprises, temps de
   restauration, disponibilité) et sert à décider.
5. **Pas de dogme** : on fait ce qui est raisonnable pour une petite équipe ; une règle qui ne sert
   plus est revue, pas contournée en silence.
6. **Petits pas** : améliorer une chose à la fois, celle qui rapporte le plus, et commencer tout de suite.
7. **Sans blâme** : après un incident, on cherche la cause dans le processus, pas un coupable.
8. **Déterministe plutôt que jugé** : ce qui se vérifie, s'inventorie ou se calcule de façon
   répétée est fait par un **script testé** (`.claude/scripts/`, `.claude/ci/`, CI), pas par le
   jugement d'un agent ; l'agent lance le script et rapporte sa sortie. Un contrôle qui repose sur
   la vigilance n'est pas un contrôle.

## Principes de conception

- **Fiabilité n'est pas sécurité** : un composant qui « a toujours marché » n'est pas pour autant
  sûr ; modifier un composant mature demande la même rigueur qu'en créer un.
- **Conception défensive des automatismes qui agissent sur des personnes** (ban, kick, sanction,
  détection automatique) : intégrité élevée ; plusieurs signaux plutôt qu'un seul, seuils
  documentés, mode observation avant le mode action, journal de chaque décision, annulation
  possible, désactivation facile par l'admin du serveur.
- **Données personnelles** : minimisation, protection par défaut, conformité à la réglementation applicable, ex. RGPD (voir `CLAUDE.md`) ; les
  agents ne voient que le problème, jamais les données des clients.
- **Sobriété** : un seul serveur auto-hébergé ; ressources limitées et justifiées, rétentions
  bornées, caches de CI, pas de surdimensionnement ni de calcul inutile.

## Coût de la qualité

On distingue l'effort de **prévention** (règles, formation, outils, politiques conftest, hooks),
de **détection** (tests, revues, audits) et de **non-conformité** (reprise après un défaut trouvé
en interne, et surtout après un défaut trouvé par un utilisateur — le plus cher, avec l'atteinte à
la réputation). Investir en prévention et en détection précoce réduit le coût total ; l'agent
`qualite` suit la part de reprise.

## Les cinq dimensions d'un projet

Fonctionnalités, qualité, échéance, coût, personnel : pour chaque jalon, chacune est déclarée
**objectif** (non négociable), **contrainte** (imposée de l'extérieur) ou **degré de liberté**
(ajustable). La qualité n'est jamais un degré de liberté en dessous des exigences de la politique.

## Hiérarchie documentaire

| Niveau          | Répond à                   | Chez nous                                                                                                                                                      |
| --------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Politique       | pourquoi, quelle direction | ce fichier ; règles communes de `CLAUDE.md`                                                                                                                    |
| Processus       | quoi, qui, quand           | les **skills** (`/orchestrer`, `/inspection`, `/release`, `/maj-versions`, `/nouveau-paquet`…) : but, résultats attendus, étapes, rôles (agents), début et fin |
| Procédures      | comment, avec quoi         | étapes détaillées des skills, listes de vérification et gabarits (`docs/qualite/`)                                                                             |
| Enregistrements | preuves que c'est fait     | issues et PR GitHub et leurs relectures, exécutions GitHub Actions, rapports d'audit et d'inspection, rétrospectives (`docs/qualite/`)                         |

- Un processus (skill) appuie au moins un principe de cette politique ; il a un but clair, des
  résultats observables, des rôles, des entrées et sorties, un début et une fin, et se mesure.
- **Adapter un processus** à un cas particulier est permis : l'écart est annoncé avec sa raison et
  accepté par l'utilisateur. Un agent ne saute jamais une étape d'un skill en silence.
- Documentation au plus près du code (Markdown dans le dépôt), découpée en morceaux cohérents, sans
  mélanger politique, processus et formation, et sans volume inutile (une doc que personne ne lit ne sert à rien).
