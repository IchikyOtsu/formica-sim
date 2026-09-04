# Formica Sim

Un petit laboratoire visuel pour observer une colonie de fourmis dans un monde
2D. La V0.3 fait émerger des pistes collectives grâce à un champ de phéromones
volatile : les fourmis chargées le renforcent et les chercheuses le suivent sans
perdre leur composante exploratoire.

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

Comparer le scénario individuel V0.2 au scénario collectif V0.3 :

```bash
npm run benchmark
```

## Architecture

```text
src/
├── behaviors/{RandomWalk,SearchFoodBehavior,ReturnHomeBehavior}.js
├── entities/{Ant,Colony,FoodSource,Nest}.js
├── rendering/Renderer.js
├── simulation/{Simulation,SimulationConfig,World,PheromoneField}.js
├── systems/{MovementSystem,FoodDetectionSystem,FoodCollectionSystem}.js
├── systems/{PheromoneDepositSystem,PheromoneSensingSystem}.js
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

## Phéromones V0.3

`PheromoneField` est une grille scalaire de 10 unités, séparée du monde et du
rendu. À chaque tick, les fourmis chargées déposent un signal `FOOD` sur leur
trajet vers le nid. Le signal est plus fort loin du nid, ce qui oriente la piste
vers la source. Le champ s'évapore sans diffusion (`intensity *= 0.997`) et les
valeurs sous le seuil sont remises à zéro.

Les chercheuses échantillonnent neuf directions locales. Le système de lecture
leur transmet une suggestion, jamais le champ ni la position d'une source. Le
comportement mélange cette suggestion avec la marche aléatoire afin d'éviter un
suivi parfaitement déterministe. Le bouton **Pistes** masque uniquement la couche
visuelle ; la simulation continue de calculer le champ. La marche et le choix
stochastique d'une piste utilisent deux flux pseudo-aléatoires distincts, ce qui
préserve une comparaison propre avec la baseline.

Avec la configuration et la seed par défaut, le benchmark déterministe mesure :

```text
V0.2 sans phéromones : 20 825 ticks
V0.3 avec phéromones : 5 505 ticks
Gain                  : 73,6 %
```
