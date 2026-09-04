# Formica Sim

Un petit laboratoire visuel pour observer une colonie de fourmis dans un monde
2D. La V1.0 stabilise le moteur expérimental : API publique sans Canvas, schéma
de configuration versionné, invariants, scénario de référence à 50 000 ticks,
replay déterministe, documentation scientifique et pause sur événement.

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

Validation V1.0 complète et scénario officiel :

```bash
npm run validate
npm run validate:reference
```

## API moteur V1

```js
import { Simulation } from "./src/index.js";

const simulation = new Simulation(config, 1847);
simulation.tick();
simulation.run(10_000);
const state = simulation.getState();
```

Le moteur n'a besoin ni du DOM ni du Canvas. Les configurations exportées
utilisent `schemaVersion: 1` et les sections `simulation`, `ants`, `metabolism`,
`pheromones`, `demography`, `environment`, `hazards` et `analytics`.

## Documentation

- [Architecture](docs/architecture.md)
- [Modèle et simplifications](docs/simulation-model.md)
- [Phéromones](docs/pheromones.md)
- [Métabolisme](docs/metabolism.md)
- [Démographie](docs/demography.md)
- [Environnement](docs/environment.md)
- [Déterminisme et invariants](docs/determinism.md)
- [Expériences](docs/experiments.md)
- [Replay et inspection](docs/replay.md)

Comparer danger sans alarme, puis alarme faible, équilibrée et forte :

```bash
npm run benchmark
```

Le nombre de seeds et la durée sont configurables :

```bash
npm run benchmark -- --seeds=10 --ticks=30000
```

Le benchmark historique des réseaux de phéromones reste disponible :

```bash
npm run benchmark:pheromones
```

Le benchmark démographique V0.6 reste disponible avec
`npm run benchmark:demography`.

Le benchmark environnemental V0.7 reste disponible avec
`npm run benchmark:environment`.

Le benchmark V0.5 de survie est également conservé :

```bash
npm run benchmark:survival
```

Toutes les familles utilisent désormais le même point d'entrée :

```bash
npm run experiment -- alarm --seeds=100 --ticks=30000
npm run experiment -- environment --seeds=20 --ticks=40000
```

## Architecture

```text
src/
├── config/ConfigSchema.js
├── observability/{TimeSeries,MetricsRecorder,EventLog,RunSummary}.js
├── observability/{RunExporter,ReplayController,TimeSeriesRenderer,PauseConditions}.js
├── behaviors/{RandomWalk,SearchFoodBehavior,ReturnHomeBehavior}.js
├── entities/{Ant,Colony,FoodSource,Nest,Queen,Brood}.js
├── environment/{Season,EnvironmentConfig,DangerZone}.js
├── experiments/{ScenarioPresets,ExperimentRunner,AggregateStatistics}.js
├── rendering/Renderer.js
├── simulation/{Simulation,SimulationConfig,World,PheromoneField}.js
├── systems/{MovementSystem,FoodDetectionSystem,FoodCollectionSystem}.js
├── systems/{PheromoneDepositSystem,PheromoneSensingSystem,HomeDetectionSystem}.js
├── systems/MetabolismSystem.js
├── systems/{BroodSystem,FoodRegenerationSystem}.js
├── systems/{EnvironmentSystem,FoodSpawnSystem,HazardSystem}.js
├── systems/{AlarmDepositSystem,DirectionScoringSystem}.js
├── main.js
├── index.js
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

Depuis V0.4, `PheromoneField` gère des couches scalaires indépendantes sur une grille de 10
unités. Les fourmis en recherche déposent `HOME` avec une force décroissante
depuis leur dernier passage au nid. Les fourmis chargées remontent ce gradient et
déposent `FOOD`. L'évaporation et une diffusion légère sont appliquées à chaque
tick ; une diffusion à zéro reproduit le modèle sans diffusion.

Les comportements échantillonnent neuf directions et ne reçoivent qu'une
suggestion issue du champ. Une mémoire courte des cellules récentes pénalise les
retours immédiats. `ReturnHomeBehavior` ne reçoit ni le nid ni sa position : seul
`HomeDetectionSystem` fournit une direction lorsque l'individu entre dans le
petit rayon de détection local du nid.

Le sélecteur **Pistes** affiche `FOOD`, `HOME`, `ALARM`, toutes les couches ou aucune. Masquer
les couches n'arrête jamais leur calcul. Le panneau de paramètres applique avec
reset la population, l'évaporation, la diffusion, les forces de dépôt,
l'influence des pistes et l'exploration.

## Métabolisme et survie V0.5

Chaque fourmi possède une énergie courante, une énergie maximale, un coût par
unité de distance et un seuil de retour. Le coût est calculé à partir de la
distance réellement parcourue ; changer la vitesse d'affichage ×1/×2/×5 ne
modifie donc pas la physiologie. Le transport de nourriture applique un léger
surcoût et un métabolisme basal continue au repos.

Sous le seuil de 40 %, une chercheuse interrompt son exploration et remonte
`HOME` même si elle ne porte rien. Au nid, elle consomme une quantité
fractionnaire du stock. Elle repart au-dessus du seuil de récupération ou reste
en `RESTING` si le stock est insuffisant. À zéro énergie, elle passe en `DEAD` :
elle ne bouge plus, ne collecte plus et ne dépose plus de phéromones, mais reste
visible sous forme de croix grise.

L'économie conserve séparément :

- la nourriture totale rapportée ;
- le stock actuellement disponible ;
- la nourriture consommée ;
- la nourriture perdue par les porteuses mortes.

Le bilan affiché vaut `nourriture rapportée - nourriture consommée`. Le stock
initial est volontairement exclu de ce bilan, mais reste inclus dans la loi de
conservation globale.

## Reine, couvain et démographie V0.6

La reine reste au centre du nid et pond uniquement si le stock dépasse le seuil
de reproduction, si son cooldown est terminé et si `maxBrood` n'est pas atteint.
Chaque ponte a un coût explicite. Le couvain suit le cycle :

```text
EGG → LARVA → PUPA → WORKER
```

Chaque élément mémorise son âge, son âge de stade, sa progression et sa
consommation. Seules les larves demandent un entretien continu ; si le stock ne
suffit pas, leur développement s'arrête sans créer de nourriture négative. Une
pupe arrivée à maturité devient une ouvrière normale avec un identifiant unique.

L'ordre budgétaire est déterministe à chaque tick :

1. alimentation des ouvrières présentes au nid ;
2. entretien minimal des larves ;
3. nouvelle ponte éventuelle.

La régénération des sources est bornée par leur quantité initiale. Une source
fractionnaire doit atteindre une unité avant de redevenir
collectable. Le panneau de paramètres permet de régler la reproduction, le
cooldown, le seuil de stock, la taille maximale du couvain, ses coûts et la
régénération, avec reset reproductible.

## Monde dynamique et pression environnementale V0.7

Une source parcourt désormais `SPAWN → ACTIVE → DEPLETED → COOLDOWN → RESPAWN`.
Après épuisement ou expiration, elle attend son délai puis réapparaît à une
position et avec une quantité tirées par le générateur déterministe. Le nombre
de sources actives reste borné.

Les saisons `PRINTEMPS`, `ÉTÉ`, `AUTOMNE` et `HIVER` modulent indépendamment la
régénération, le métabolisme, le coût du mouvement, le développement du couvain
et la dangerosité. Elles ne donnent aucune consigne à la reine : la contraction
en période pauvre découle uniquement du stock et des priorités économiques déjà
existantes. Une limite de population empêche une croissance sans borne pendant
les longues expériences.

Les zones dangereuses sont visibles en rouge sur le Canvas. Les traverser
augmente le coût de déplacement et expose à une faible mortalité aléatoire,
issue d'un flux pseudo-aléatoire séparé. Reset restaure donc aussi exactement
les saisons, sources et événements environnementaux.

Le tableau de bord expose la saison, la température, la pression, le cycle,
les morts par famine ou environnement et l'autonomie estimée. Cette dernière
vaut `stock / consommation moyenne récente` et reste indéfinie tant qu'aucune
nourriture n'a été consommée.

## Danger, alarme et adaptation collective V0.8

`ALARM` est une troisième couche du même `PheromoneField`. Un surcoût local
important déclenche un petit dépôt ; une mort environnementale produit un signal
fort sur la cellule et ses voisines. Son évaporation est six fois plus rapide
que celle des pistes ordinaires et sa diffusion reste faible, afin qu'un ancien
danger ne condamne pas durablement un passage.

`HazardSystem` est le seul composant qui reçoit les `DangerZone`.
`DirectionScoringSystem` échantillonne plusieurs directions et combine
attraction `FOOD` ou `HOME`, répulsion `ALARM`, inertie et bruit. Les comportements
ne reçoivent qu'une direction proposée et conservent une composante exploratoire ;
ils n'ont ni carte de danger ni pathfinding global.

Les événements létaux utilisent un tirage déterministe indexé par seed, tick,
fourmi et zone. Un benchmark avec et sans `ALARM` compare ainsi les mêmes
opportunités de mortalité, même lorsque les trajectoires divergent. Les métriques
ajoutent expositions, distance dans les zones dangereuses, intensité et cellules
`ALARM`, dépôts sur dommage ou décès et détour moyen des retours chargés.

## Benchmark des phéromones V0.4

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

## Benchmark de survie V0.5

`npm run benchmark:survival` compare un coût nul, faible, moyen et élevé pendant une durée
fixe. Il mesure survie, stock final, collecte, consommation, bilan, ratio
collecte/consommation, mortalité, énergie moyenne et distance moyenne.

Avec la seed par défaut sur 50 000 ticks :

```text
A — coût nul    DURABLE     50/50 vivantes, stock 250,00
B — coût faible DURABLE     50/50 vivantes, stock 186,79
C — coût moyen  FRAGILE     41/50 vivantes, stock   0,00
D — coût élevé  EXTINCTION   0/50 vivante au tick 40 858
```

Il n'y a toujours ni reproduction ni démographie : les différences observées
proviennent uniquement du métabolisme, de la collecte et de la mortalité.

## Benchmark démographique V0.6

`npm run benchmark:demography` compare reproduction désactivée, prudente, agressive,
ressources rares et ressources abondantes. Il rapporte population finale et
maximale, ouvrières vivantes, stock, âge moyen, naissances, morts, croissance
nette et coût du couvain. `--seeds` et `--ticks` permettent les expériences
longues sur plusieurs graines.

Sur la seed de référence à 50 000 ticks :

```text
A — sans reproduction  50 ouvrières, population max.  51
B — prudente           74 ouvrières, population max.  76
C — agressive          60 ouvrières, pic à 77 après famine
D — ressources rares    0 ouvrière, extinction au tick 35 576
E — ressources abond. 109 ouvrières, population max. 112
```

La reine compte dans la population totale, tout comme le couvain, mais pas les
ouvrières mortes. Il n'existe encore ni caste, ni soldat, ni génétique.

## Benchmark environnemental V0.7

`npm run benchmark:environment` exécute un contrôle stable, des saisons modérées et un monde
hostile sur plusieurs cycles. Il rapporte population moyenne, minimale et
finale, stocks minimal et maximal, naissances, mortalité ventilée, extinction et
cycles saisonniers traversés. Les options `--seeds`, `--ticks` et `--season`
contrôlent respectivement le nombre de graines, la durée totale et la durée de
chaque saison.

## Benchmark ALARM V0.8

`npm run benchmark` compare `ALARM` désactivée, faible, équilibrée et forte dans
le même environnement dangereux. Il mesure survie, mortalité environnementale,
expositions, distance en danger, collecte, distance totale, détour et état du
champ d'alarme. Le scénario amplifie volontairement la létalité pour rendre
l'effet mesurable sur des runs courts ; `--seeds` et `--ticks` règlent
l'expérience.

Sur la seed de référence à 10 000 ticks, l'alarme équilibrée réduit les
expositions de 13 865 à 5 347 et la distance dangereuse de 19 134 à 7 271 unités,
tout en augmentant la collecte de 399 à 539 unités. La mortalité
environnementale passe de 4 à 3 ouvrières.
Le profil fort et persistant descend à 2 morts, mais sa collecte chute à 380 et
son détour moyen remonte à 364 unités : la barrière informationnelle devient
plus coûteuse que le risque qu'elle évite.

## Observabilité, expérimentation et replay V0.9

`MetricsRecorder` échantillonne par défaut tous les 50 ticks : population,
stock, collecte, consommation, couvain, naissances, mortalité, énergie, trois
phéromones et expositions. `TimeSeries` et `EventLog` éliminent automatiquement
leurs entrées les plus anciennes au-delà de leurs limites respectives ; la
mémoire ne dépend donc pas linéairement de la durée d'un très long run.

Le panneau **Analyse temporelle** rend quatre séries sans jamais intervenir dans
le moteur : population, stock, énergie moyenne et mortalité cumulée. La fréquence
d'échantillonnage est modifiable. Le journal conserve les changements de saison,
apparitions, épuisements et réapparitions de sources, pontes, émergences et morts.

Les boutons d'export produisent :

- un run JSON identifié, avec version, seed, configuration, durée, résumé, séries et événements ;
- un CSV à colonnes stables pour Python, R ou un tableur ;
- une configuration JSON importable dans l'interface.

Sept presets couvrent stabilité, saisons modérées, hiver hostile, alarmes
équilibrée ou persistante, rareté et boom démographique. Chaque application de
preset repart de `DEFAULT_CONFIG`, ce qui empêche un paramètre du scénario
précédent de fuir dans le suivant.

Le replay stocke seulement version, seed, configuration et tick cible. Il
recalcule la simulation par blocs non bloquants depuis l'état initial, puis
reconstruit simultanément séries et événements. Les tests vérifient qu'un replay
retrouve exactement la colonie et les champs de phéromones de référence.

Enfin, `ExperimentRunner` fournit à chaque benchmark la même boucle multi-ticks,
le même échantillonnage, un `RunSummary` et un journal. `AggregateStatistics`
centralise moyenne, médiane, extrema et écart-type pour les comparaisons de seeds.
