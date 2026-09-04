# Vue intérieure abstraite du nid — V1.5.1

Le nid n'est plus un simple point : une fourmi qui l'atteint peut désormais
y entrer réellement, y accomplir une tâche (stockage, repos), puis ressortir.
Pas de creusement, pas de construction dynamique — un petit monde intérieur
**fixe et abstrait**, comme demandé.

## Opt-in strict : `nestInteriorEnabled` (défaut `false`)

Comme chaque système ajouté depuis V1.2, la couche intérieure est
entièrement gatée par un flag. À `false`, le comportement est **strictement
identique** à avant ce ticket — la logique de dépôt/repos à l'arrivée au nid
reste exactement celle d'origine, non touchée. Vérifié explicitement : les
149 tests déjà existants passent sans aucune modification une fois ce
ticket posé dessus.

## Localisation

Sur `Ant` : `locationType` (`"WORLD" | "NEST"`), `nestId`, `nestPosition`
(coordonnées **locales** à l'intérieur, indépendantes du monde), `nestTask`,
`nestChamberId`, `nestTransitionCooldown`.

**Une fourmi `NEST` est invisible à tout le reste du moteur** : dans la
boucle principale, `if (ant.locationType === "NEST") { updateNestAnt(...);
continue; }` — elle saute entièrement le pipeline monde (mouvement,
dangers, phéromones, détection étrangère, combat, raids). Trois détections
supplémentaires ont aussi été fermées pour rester cohérentes :
`ForeignAntDetectionSystem`, `detectEnemyNests` (une fourmi indoor
n'explore rien), `detectNestThreats` (elle n'est plus une cible ni une
sentinelle) et `RaidSystem.availableRaiders` (jamais réquisitionnée pour un
raid pendant qu'elle est à l'intérieur).

**Exception volontaire : `DEFENDING` n'entre jamais.** Un soldat qui
converge sur son nid pour le défendre doit rester en espace MONDE pour
pouvoir combattre — le faire entrer casserait la défense (V1.4.3) entière.
Seul l'état `RETURNING_HOME` déclenche une entrée.

## `NestInterior` — cinq chambres fixes

`src/nest/` : `NestChamber` (id, type, position, radius, capacity —
informative seulement, jamais bloquante), `NestInterior` (cinq chambres
`ENTRANCE / STORAGE / BROOD / QUEEN / REST`, disposées en étoile autour de
l'entrée plutôt qu'autour d'un HUB séparé — simplification assumée : la
topologie du ticket reste lisible visuellement via les corridors dessinés,
sans ajouter un sixième type de chambre absent de la spécification).

Pas de pathfinding : `NestNavigationSystem.moveToward` est une ligne droite
vers la chambre visée, dans l'espace de coordonnées local à la colonie.

## Cycle complet

```text
RETURNING_HOME + isInside(nid) + cooldown écoulé
  → NestTransitionSystem.enter()   : locationType=NEST, état=IN_NEST, à ENTRANCE
  → assignNestTask()                : GO_TO_STORAGE / GO_TO_REST / EXIT_NEST
  → déplacement direct vers la chambre visée
  → arrivée : dépôt (STORAGE) / repos+alimentation (REST) / sortie (ENTRANCE)
  → NestTransitionSystem.exit()     : locationType=WORLD, cooldown armé, état=SEARCHING_FOOD
```

Le dépôt (`carryingFood` et `raidCargo`) n'a lieu **qu'à l'arrivée physique
à STORAGE** — pendant tout le trajet intérieur, la nourriture reste portée,
exactement comme demandé. Testé explicitement (le stock ne bouge pas tant
que `ant.nestChamberId !== "STORAGE"`).

## Conservation

Aucun changement de formule nécessaire dans `Invariants.js` :
`carryingFoodAmount` et `raidCargo` sont déjà sommés sur **tous** les ants
de `colony.ants`, qu'ils soient `WORLD` ou `NEST` — une fourmi indoor
n'est jamais retirée de cette collection, seulement traitée par un pipeline
différent. Vérifié sur 6000 ticks avec forage + entrée + stockage + sortie
en continu.

## Anti-boucle entrée/sortie

`nestTransitionCooldownTicks` (défaut 5) est armé à chaque sortie et
bloque toute ré-entrée tant qu'il n'est pas retombé à zéro — testé
explicitement en forçant une fourmi tout juste sortie à retoucher
`isInside(nid)` immédiatement : l'entrée est refusée jusqu'à expiration du
cooldown.

## Reine et couvain

Ni la reine ni le couvain n'ont de position propre suivie (aucun des deux
ne se déplace dans le moteur). `NestRenderer` les place simplement dans
leur chambre dédiée (`QUEEN`, `BROOD`) au moment du dessin — un choix de
rendu, pas un état simulé.

## UI

- Sélecteur **Vue** (Monde / Nid par colonie) dans le bandeau de contrôles ;
  bascule le canvas entre `Renderer` (monde) et le nouveau `NestRenderer`
  (chambres en ovales, corridors en traits, fourmis en points, repos en vert).
- Case **Vue intérieure du nid** dans le panneau de paramètres.
- Nouveau scénario **"Vue intérieure du nid"** (mono-colonie,
  `nestInteriorEnabled: true`) pour l'essayer immédiatement.
- Cartes de colonie : `Dehors / Dans le nid`, `Au stockage`.

## Non fait volontairement (hors scope V1.5.1)

- Pas de creusement ni de construction de chambres (V1.5.3).
- Pas de tâches internes élaborées au-delà de stockage/repos — `GO_TO_BROOD`
  existe dans `NestTask` mais n'est jamais assigné automatiquement (aucune
  fourmi ne "soigne" le couvain individuellement dans ce moteur ; réservé).
- Les raiders n'entrent jamais dans le nid ennemi (inchangé depuis V1.4.1) ;
  un raider revenant chez lui suit le même cycle qu'un forager normal.
- `capacity` des chambres n'est pas encore appliquée (informative).
