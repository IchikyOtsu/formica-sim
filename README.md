# Formica Sim

Un petit laboratoire visuel pour observer une colonie de fourmis dans un monde
2D. Cette première milestone pose le socle de la simulation : fourmis autonomes,
marche aléatoire, sources de nourriture, contrôles temporels et métriques.

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
├── behaviors/RandomWalk.js
├── entities/{Ant,Colony,FoodSource,Nest}.js
├── rendering/Renderer.js
├── simulation/{Simulation,SimulationConfig,World}.js
├── systems/MovementSystem.js
├── main.js
└── styles.css
```

La simulation est indépendante du Canvas : `Simulation.tick()` ne connaît pas le
rendu. Les positions sont exprimées dans les coordonnées du monde, puis le
renderer les adapte à la taille visible. Le générateur pseudo-aléatoire à graine
fixe rend chaque reset reproductible.
