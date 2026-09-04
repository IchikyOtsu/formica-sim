# Architecture

Formica Sim sépare trois couches : le moteur déterministe dans `src/simulation`,
les systèmes et entités du domaine, puis l'interface Canvas dans `src/main.js` et
`src/rendering`. Le moteur n'importe ni DOM, ni Canvas, ni API navigateur.

`Simulation` orchestre les systèmes dans un ordre stable : environnement,
phéromones, ouvrières, dangers, collecte, couvain, métriques. Les systèmes
spécialisés restent seuls propriétaires de leurs règles. L'observabilité reçoit
des états et événements après les ticks ; elle ne produit aucune décision.

API publique :

```js
import { Simulation } from "./src/index.js";

const simulation = new Simulation(config, 1847);
simulation.tick();
simulation.run(10_000);
const snapshot = simulation.getState();
```

`getState()` retourne un instantané sérialisable et indépendant des objets
internes. `src/index.js` est le point d'entrée stable du moteur V1.
