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

## V1.5.2 — Tâches internes du nid

Les fourmis à l'intérieur ne se contentent plus de stocker/se reposer : une
vraie économie interne existe, avec un ordre de priorité fixe recalculé à
chaque fois qu'une fourmi finit une étape (`nestTask === NONE`) :

```text
1. décharger nourriture portée (GO_TO_STORAGE)
2. se soigner si énergie faible (GO_TO_REST)
3. nourrir le couvain si des larves ont faim (FEED_BROOD)
4. soigner le couvain sinon, tant que le nid en a (TEND_BROOD)
5. sortir (EXIT_NEST)
```

### Qui décide quoi

- **`NestTaskSystem.decide()`** (nouveau, `src/nest/NestTaskSystem.js`) —
  fonction pure, ne modifie rien, prend en entrée l'état de la fourmi + une
  photo du besoin du couvain. Testable isolément.
- **`BroodDemandSystem.evaluate()`** (nouveau, `src/systems/BroodDemandSystem.js`)
  — expose `hungryLarvae`/`foodDemand` à partir du flag `brood.starved`
  (posé par `BroodSystem` à chaque tick où une larve n'a pas pu consommer
  tout son besoin). Lu avec **un tick de retard** volontairement — ce n'est
  pas un bug : `broodDemand` est calculé une fois par colonie avant la boucle
  des fourmis, à partir de l'état laissé par le tick précédent.
- `NestNavigationSystem` reste inchangé (le COMMENT déplacer) ; Simulation
  reste responsable des effets d'arrivée (le QUOI faire une fois là), exactement
  comme en V1.5.1 — pas de `NestInteractionSystem` séparé : les effets
  d'arrivée (dépôt, repos, ramassage, livraison, sortie) restent des méthodes
  de `Simulation`, qui gère déjà toute l'économie/les événements de colonie ;
  un wrapper séparé n'aurait fait que déplacer le même code sans réduire le
  couplage réel à `colony`/`emitEvent`.

### Nourrir le couvain : une vraie ressource en transit

`ant.internalFoodCargo` est un troisième pool de charge, distinct de
`carryingFoodAmount` (butin de forage) et `raidCargo` (butin de pillage).
Cycle `FEED_BROOD` :

```text
STORAGE : colony.takeStock(nestInternalFoodCarry) → ant.internalFoodCargo
  (retire du stock SANS le compter "consommé" — c'est en transit, comme un
  forager qui porte de la nourriture)
BROOD   : ant.internalFoodCargo → colony.broodFoodBuffer (livré, pas encore mangé)
```

`BroodSystem` puise dans `colony.broodFoodBuffer` **en priorité**, avant de
retomber sur `colony.consumeFood()` directement sur le stock général (le
même mécanisme qu'avant V1.5.2, inchangé). Si aucune nourrice n'a jamais
rien livré, `broodFoodBuffer` reste à 0 pour toujours et le comportement est
strictement identique à avant ce ticket — encore une fois strictement additif.

Sous un stock confortable (le cas par défaut), une larve n'est quasiment
jamais `starved` : `consumeFood()` seul suffit à couvrir son besoin minuscule
(`larvaFoodPerTick`) chaque tick, sans délai. `FEED_BROOD` ne s'active donc
en pratique que sous vraie disette — un mécanisme de secours, pas un flux
permanent. Vérifié : sur le scénario par défaut (20 000 ticks), `TEND_BROOD`
s'active naturellement mais `FEED_BROOD` reste dormant ; forcé en scénario de
disette contrôlée, le cycle complet (ramassage → livraison → `broodFoodBuffer`)
a été vérifié pas à pas.

### Soigner le couvain

`TEND_BROOD` immobilise l'ouvrière dans `BROOD` pendant `nestTendBroodTicks`
(défaut 40), plafonné par `nestCaregiverRatio` (une fraction du couvain, pas
un nombre fixe). Pendant qu'elle y est, elle compte dans
`activeTenders` et accélère très légèrement le développement du couvain :

```text
broodCareFactor = 1 + min(activeTenders, brood.length) × nestBroodCareBonus
```

multiplié directement dans le `developmentMultiplier` déjà utilisé par
`BroodSystem.update` (le même paramètre que la saisonnalité) — à `0`
soigneur, `broodCareFactor = 1`, comportement identique à avant.

### Plafond anti-ruée

`activeCaregivers` (fourmis déjà en `FEED_BROOD`/`TEND_BROOD`) est compté une
fois par colonie avant la boucle des fourmis, puis tenu à jour en direct à
chaque changement de tâche dans la même boucle — pas de re-scan `O(n²)`. Le
plafond est `max(1, ⌈brood.length × nestCaregiverRatio⌉)` : jamais toute la
colonie ne se rue sur le couvain, même avec beaucoup de larves affamées.

### Soldats

Un soldat entré dans le nid (uniquement via `RETURNING_HOME`, jamais
`DEFENDING`, inchangé depuis V1.5.1) ne reçoit jamais `FEED_BROOD` ni
`TEND_BROOD` — `NestTaskSystem` l'exclut explicitement par caste. Il ne fait
que se reposer puis ressortir.

### Conservation

Deux nouveaux termes dans `Invariants.js`, tous deux nécessaires pour que la
masse ne "disparaisse" jamais pendant le transit interne :
`ant.internalFoodCargo` (porté par une nourrice en route) et
`colony.broodFoodBuffer` (livré à BROOD mais pas encore consommé par les
larves). Vérifié sur 20 000 ticks en continu, y compris pendant un cycle de
ramassage/livraison forcé.

### Non fait volontairement (V1.5.2)

- Pas de `MOVE_FOOD` (transport ENTRANCE→STORAGE) : le dépôt a lieu
  directement à STORAGE depuis V1.5.1, donc cette tâche n'a d'utilité
  qu'avec plusieurs chambres de stockage (V1.5.3+).
- Pas de panneau UI dédié "Tâches internes" avec répartition en temps réel —
  seulement deux nouvelles lignes dans la carte de colonie
  (`Nourrices / Soigneuses`, `Nourriture livrée au couvain`) ; un vrai
  histogramme est reporté à une itération future si le besoin s'en fait sentir.
- Pas de nouveaux marqueurs `TacticalOverlaySystem` (BROOD_FED etc.) —
  ce système ne couvre que la vue MONDE, pas la vue intérieure du nid.
- Nouveaux réglages (`nestCaregiverRatio`, `nestBroodFeedStockThreshold`,
  `nestInternalFoodCarry`, `nestTendBroodTicks`, `nestBroodCareBonus`) non
  exposés dans le panneau de paramètres web — seulement en configuration,
  comme la majorité des réglages fins de raid/combat déjà non exposés.
