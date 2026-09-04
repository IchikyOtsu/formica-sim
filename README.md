# Formica Sim

Un petit laboratoire visuel pour observer une colonie de fourmis dans un monde
2D. La V0.4 introduit une écologie à deux signaux : les chercheuses déposent
`HOME`, suivent `FOOD`, et les fourmis chargées retrouvent le nid grâce au gradient
collectif plutôt qu'avec une position globale.

## Lancer le projet

Prérequis : Node.js 18 ou plus récent.

```bash
npm start
```

Puis ouvrir <http://localhost:4173>.

## Tester

```bash
npm test
```

Comparer les quatre expériences sur cinq seeds :

```bash
npm run benchmark
```

Le nombre de seeds et la limite sont configurables, par exemple :

```bash
npm run benchmark -- --seeds=100 --limit=100000
```

## Architecture

```text
src/
├── behaviors/{RandomWalk,SearchFoodBehavior,ReturnHomeBehavior}.js
├── entities/{Ant,Colony,FoodSource,Nest}.js
├── rendering/Renderer.js
├── simulation/{Simulation,SimulationConfig,World,PheromoneField}.js
├── systems/{MovementSystem,FoodDetectionSystem,FoodCollectionSystem}.js
├── systems/{PheromoneDepositSystem,PheromoneSensingSystem,HomeDetectionSystem}.js
├── main.js
└── styles.css
```

La simulation est indépendante du Canvas : `Simulation.tick()` ne connaît pas le
rendu. Les positions sont exprimées dans les coordonnées du monde, puis le
renderer les adapte à la taille visible. Le générateur pseudo-aléatoire à graine
fixe rend chaque reset reproductible.

## Cycle de foraging

Une fourmi en `SEARCHING_FOOD` marche aléatoirement tant qu'aucune source active
n'entre dans son rayon de détection. Elle rejoint alors cette cible, prélève une
unité et passe en `RETURNING_HOME`. Au contact du nid, l'unité est ajoutée aux
ressources de la colonie et la fourmi reprend sa recherche. Les sources à zéro
unité sont désactivées et ne sont plus rendues.

## Écologie des phéromones V0.4

`PheromoneField` gère deux couches scalaires indépendantes sur une grille de 10
unités. Les fourmis en recherche déposent `HOME` avec une force décroissante
depuis leur dernier passage au nid. Les fourmis chargées remontent ce gradient et
déposent `FOOD`. L'évaporation et une diffusion légère sont appliquées à chaque
tick ; une diffusion à zéro reproduit le modèle sans diffusion.

Les comportements échantillonnent neuf directions et ne reçoivent qu'une
suggestion issue du champ. Une mémoire courte des cellules récentes pénalise les
retours immédiats. `ReturnHomeBehavior` ne reçoit ni le nid ni sa position : seul
`HomeDetectionSystem` fournit une direction lorsque l'individu entre dans le
petit rayon de détection local du nid.

Le sélecteur **Pistes** affiche `FOOD`, `HOME`, les deux couches ou aucune. Masquer
les couches n'arrête jamais leur calcul. Le panneau de paramètres applique avec
reset la population, l'évaporation, la diffusion, les forces de dépôt,
l'influence des pistes et l'exploration.

## Benchmark

Le benchmark compare :

- A — aucun signal, retour direct historique ;
- B — `FOOD` uniquement, modèle V0.3 ;
- C — `FOOD + HOME`, sans diffusion ;
- D — `FOOD + HOME`, avec diffusion.

Il rapporte les ticks, la distance totale, les prélèvements, le temps moyen de
retour et les cellules explorées, avec moyenne, médiane, minimum, maximum et
écart-type sur plusieurs seeds.

Sur la seed de référence :

```text
A — aucun signal              22 441 ticks
B — FOOD uniquement            5 239 ticks
C — FOOD + HOME                7 421 ticks
D — FOOD + HOME + diffusion    7 350 ticks
```

Sur les cinq seeds par défaut, les moyennes de collecte sont respectivement
19 772,2 (A), 5 227 (B), 9 584,8 (C) et 8 082,6 ticks (D). La diffusion réduit
également l'écart-type du retour sans GPS de 3 665,7 à 1 492 ticks.
