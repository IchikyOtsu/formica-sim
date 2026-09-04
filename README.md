# Formica Sim

Un petit laboratoire visuel pour observer une colonie de fourmis dans un monde
2D. La V0.2 ajoute un cycle de foraging complet : exploration, détection locale,
prélèvement, retour au nid, dépôt et épuisement des sources de nourriture.

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

## Architecture

```text
src/
├── behaviors/{RandomWalk,SearchFoodBehavior,ReturnHomeBehavior}.js
├── entities/{Ant,Colony,FoodSource,Nest}.js
├── rendering/Renderer.js
├── simulation/{Simulation,SimulationConfig,World}.js
├── systems/{MovementSystem,FoodDetectionSystem,FoodCollectionSystem}.js
├── main.js
└── styles.css
```

La simulation est indépendante du Canvas : `Simulation.tick()` ne connaît pas le
rendu. Les positions sont exprimées dans les coordonnées du monde, puis le
renderer les adapte à la taille visible. Le générateur pseudo-aléatoire à graine
fixe rend chaque reset reproductible.

## Cycle V0.2

Une fourmi en `SEARCHING_FOOD` marche aléatoirement tant qu'aucune source active
n'entre dans son rayon de détection. Elle rejoint alors cette cible, prélève une
unité et passe en `RETURNING_HOME`. Au contact du nid, l'unité est ajoutée aux
ressources de la colonie et la fourmi reprend sa recherche. Les sources à zéro
unité sont désactivées et ne sont plus rendues.
