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

## V1.5.3 — Construction dynamique du nid + fourmis 2D orientées

Opt-in comme toujours : `nestConstructionEnabled` (défaut `false`). À `false`,
`NestInterior` reste strictement les cinq chambres fixes de V1.5.1 — vérifié
explicitement (183/183 tests, dont un test dédié qui tick 2000 fois et
n'observe jamais un chantier ni une sixième chambre).

### `NestInterior` devient un graphe, pas une étoile figée

Changement structurel : `chambers` est maintenant indexé par un **ID unique**,
plus par type — la construction dynamique peut créer plusieurs chambres du
même type (`STORAGE-2`, `STORAGE-3`, ...). Les cinq chambres d'origine
gardent leur type comme ID (`"STORAGE"`), donc toute l'API de V1.5.1/V1.5.2
(`getChamber(id)`, `moveAntToChamber`) continue de fonctionner à l'identique
sans qu'aucune construction n'ait eu lieu — c'est ce qui garantit la
non-régression.

- `getChambersByType(type)` — toutes les chambres d'un type donné.
- `addChamber(type, position, anchorId)` — finalise un chantier en vraie
  chambre, ajoute un corridor `[anchorId, nouvelId]`.
- `path(fromId, toId)` — plus court chemin **via les corridors existants**
  (BFS), jamais une ligne droite à travers le nid. C'est le changement de
  navigation demandé : même sans aucune construction, les fourmis suivent
  maintenant visuellement les corridors dessinés au lieu de couper en
  diagonale à travers les chambres (BROOD → REST passe par
  ENTRANCE → STORAGE, exactement comme les traits affichés le montrent).
  Vérifié que ce changement ne casse aucun test existant : les tests
  n'affirment jamais un trajet ou un nombre de ticks exact, seulement l'état
  final (dépôt à STORAGE, sortie, etc.).

### Qui décide quand construire

`NestConstructionSystem.evaluate()` (nouveau) — une photo instantanée par
tick : pour STORAGE/REST/BROOD, si même la variante la moins chargée de ce
type a atteint `nestChamberCapacity` fourmis **physiquement présentes**, et
qu'aucun chantier de ce type n'est déjà ouvert, et qu'il reste de la place
sous `nestMaxConcurrentSites`, un chantier s'ouvre — position déterministe
via un flux RNG dédié (`Simulation.constructionRandom`, seedé séparément de
tous les autres flux existants pour ne perturber aucun tirage déjà testé),
à `nestChamberSpacing` de la chambre-ancre. BROOD n'est jamais ciblé si la
colonie n'a aucun couvain.

### Qui creuse

`NestTaskSystem.decide()` gagne un cinquième palier, `BUILD`, **après**
`FEED_BROOD`/`TEND_BROOD` et avant `EXIT_NEST` — les soins au couvain
passent toujours en premier. Réservé aux ouvrières (jamais un soldat),
plafonné par `nestMaxActiveBuilders` par colonie (pas par chantier — au
départ un seul chantier concurrent par défaut, donc équivalent). Une
bâtisseuse marche en ligne directe vers la position du chantier (il n'existe
pas encore de corridor vers un endroit qui n'existe pas encore), puis
incrémente `site.progress` de 1 par tick de présence — plusieurs bâtisseuses
accélèrent réellement le chantier. Une fois `progress >= nestBuildTicks`,
`Simulation.updateBuildingAnt` finalise : `interior.addChamber(...)`, coût
en nourriture prélevé via `colony.consumeFood()` (même mécanisme que le coût
d'un œuf — une vraie consommation, pas une nouvelle réserve à suivre dans
`Invariants.js`), et **toutes** les bâtisseuses de ce chantier (pas
seulement celle qui vient de finir) sont libérées le même tick, y compris
celles pas encore traitées dans la boucle de ce tick.

### Routage : une chambre précise, pas juste un type

`ensureNestRoute()` choisit, parmi les chambres du type visé, celle qui a le
moins d'occupantes (répartition de charge simple), puis calcule le chemin
via `interior.path()` — recalculé uniquement quand le type visé change (une
nouvelle tâche, ou le passage STORAGE → BROOD de `FEED_BROOD` une fois la
charge ramassée), jamais à chaque tick.

### Fourmis 2D orientées (`AntSprite.drawAnt2D`)

Nouveau `src/rendering/AntSprite.js`, sans dépendance externe (Canvas pur,
comme tout le reste du projet) : tête/thorax/abdomen + 6 pattes, orienté via
`ctx.rotate(ant.direction)`. `ant.direction` est le **même champ** que celui
déjà utilisé dehors — `NestNavigationSystem.moveToward` le met à jour à
chaque pas, donc la fourmi tourne réellement selon son cap réel dans le
corridor, sans nouveau champ ni duplication d'état. Soldat vs ouvrière :
tête et thorax plus larges. Postures : `resting` (aplatie, immobile),
`tending`/`building` (halo distinct), `carrying` (petit point porté). Léger
balancement des pattes dérivé de `tickCount` + un hash déterministe de
l'ID de la fourmi — aucun état d'animation supplémentaire à faire persister
ou à répliquer.

Pas d'interpolation sous-tick séparée : le mouvement était déjà incrémental
tick par tick (V1.5.1), et à `tickDurationMs=100` avec les vitesses
intérieures par défaut, un pas fait 2-3 unités sur une vue d'environ
200 unités de large — assez fin pour rester lisible sans double-buffering.
Le vrai changement de fluidité vient d'ailleurs : la marche suit maintenant
les corridors (`path()`) au lieu de sauter en diagonale d'une chambre à
l'autre.

### `NestRenderer` : échelle dynamique

L'échelle fixe (`220` unités) de V1.5.1 ne suffit plus dès que le nid
grandit par construction. `computeBounds()` calcule la boîte englobante de
toutes les chambres + chantiers en cours à chaque frame et recadre dessus —
un nid à 5 chambres fixes se comporte visuellement presque comme avant, un
nid qui a construit 3 chambres supplémentaires reste entièrement visible.
Un chantier en cours se dessine en pointillés avec un petit arc de
progression.

### Non fait volontairement (V1.5.3)

- Pas de vraies contraintes géométriques (chevauchement de chambres,
  collision de corridors) — la position d'un chantier est un simple offset
  déterministe depuis son ancre, jamais vérifiée contre les autres chambres.
  Sur un nid qui construit beaucoup, deux chambres pourraient visuellement
  se chevaucher ; accepté comme limite du modèle "abstrait" assumé depuis
  V1.5.1.
- QUEEN et ENTRANCE ne sont jamais dupliquées (pas dans
  `CONSTRUCTIBLE_TYPES`) — une seule reine, un seul point d'entrée.
- `NestRenderer.drawQueen`/`drawBrood` placent toujours leurs marqueurs dans
  la chambre QUEEN/BROOD **d'origine** — si une deuxième chambre BROOD est
  construite, les ouvrières peuvent réellement y travailler, mais les points
  décoratifs représentant le couvain ne s'y dessinent pas (le couvain n'a de
  toute façon aucune position individuelle suivie, V1.5.1).
  `nestChamberCapacity` n'est PAS le même champ que `NestChamber.capacity`
  (toujours informative, jamais appliquée) — c'est un seuil de déclenchement
  de construction indépendant, plus simple que de fiabiliser une capacité
  par chambre.
- Pas de creusement "gratuit" : chaque chambre construite coûte
  `nestBuildFoodCost`, mais ce n'est qu'un coût forfaitaire déduit à la
  finalisation, pas un vrai budget matériaux suivi dans le temps.
