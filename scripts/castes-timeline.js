import { Simulation } from "../src/simulation/Simulation.js";
import { AntState } from "../src/entities/Ant.js";
import { PheromoneType } from "../src/simulation/PheromoneField.js";
import { combatProfileOverrides } from "../src/experiments/CombatProfiles.js";
import { DEFAULT_CONFIG } from "../src/simulation/SimulationConfig.js";

// Scénario en trois phases pour vérifier que la production de soldats suit
// (avec un décalage dû au cycle du couvain) une pression ennemie réelle et
// organique — pas une règle codée sur le numéro de tick. Colonie B (agressive,
// sans castes) est physiquement déplacée près/loin du nid de A pour faire
// varier le contact réel ; toute la chaîne (contacts -> threatPressure ->
// decideCaste -> ponte -> développement -> émergence) reste celle du moteur.

const TOTAL_TICKS = 25_000;
const PHASE_2_START = 5_000;
const PHASE_3_START = 15_000;
const SAMPLE_INTERVAL = 100;

const config = {
  ...DEFAULT_CONFIG,
  seed: 1847,
  queenLayingCooldownTicks: 300,
  maxBrood: 20,
  // Environnement statique : pas de saisons ni de sources dynamiques qui
  // pourraient réintroduire un contact "organique" imprévu entre les deux
  // colonies pendant une phase censée être calme.
  environmentEnabled: false,
  colonies: [
    {
      id: "A",
      name: "Colonie Ambre",
      nest: { x: 105, y: 260, radius: 28 },
      initialAnts: 50,
      initialFoodStock: 10,
      ...combatProfileOverrides("defensive"),
      castesEnabled: true,
      casteSoldierRatioCap: 0.35,
      threatPressureRatioScale: 150,
      casteStockThreshold: 30,
    },
    {
      id: "B",
      name: "Colonie Azur",
      nest: { x: 695, y: 260, radius: 28 },
      initialAnts: 50,
      initialFoodStock: 10,
      ...combatProfileOverrides("aggressive"),
      castesEnabled: false,
    },
  ],
  // Pas de source partagée : chaque colonie a la sienne, près de son nid, pour
  // que la phase "calme" soit réellement calme (aucune raison organique de
  // croiser l'autre colonie). Le contact ne vient que de l'injection contrôlée
  // ci-dessous, pas d'une ressource commune qui les ferait déjà se rencontrer.
  foodSources: [
    { id: "NEAR_A", x: 150, y: 260, quantity: 300, radius: 18 },
    { id: "NEAR_B", x: 650, y: 260, quantity: 300, radius: 18 },
  ],
};

const simulation = new Simulation(config);
const colonyA = simulation.colonies[0];
const colonyB = simulation.colonies[1];
const RAID_SIZE = 15; // sur 50 : un parti de raid en contact soutenu, pas l'invasion totale
const LEASH_RADIUS = 120; // rayon de maintien autour d'une cible (nid propre ou nid adverse)
const raiderIds = new Set(colonyB.ants.slice(0, RAID_SIZE).map((ant) => ant.id));

function leashTo(ants, target) {
  for (const ant of ants) {
    if (ant.state === AntState.DEAD) continue;
    const dx = ant.position.x - target.x;
    const dy = ant.position.y - target.y;
    if (dx * dx + dy * dy > LEASH_RADIUS * LEASH_RADIUS) {
      ant.position = { x: target.x + (Math.random() - 0.5) * 20, y: target.y + (Math.random() - 0.5) * 20 };
    }
  }
}

const rows = [];
let recentCombatDeathsWindow = 0;
let recentForeignContactsWindow = 0;

for (let tick = 0; tick < TOTAL_TICKS; tick += 1) {
  const inPressure = tick >= PHASE_2_START && tick < PHASE_3_START;
  const raiders = [];
  const homeGuard = [];
  for (const ant of colonyB.ants) (raiderIds.has(ant.id) ? raiders : homeGuard).push(ant);
  leashTo(colonyA.ants, colonyA.nest.position);
  leashTo(homeGuard, colonyB.nest.position);
  leashTo(raiders, inPressure ? colonyA.nest.position : colonyB.nest.position);

  const combatLossesBefore = colonyA.combatLosses;
  const contactsBefore = colonyA.foreignContacts;
  simulation.tick();
  recentCombatDeathsWindow += colonyA.combatLosses - combatLossesBefore;
  recentForeignContactsWindow += colonyA.foreignContacts - contactsBefore;

  if ((tick + 1) % SAMPLE_INTERVAL === 0) {
    const fieldA = simulation.colonyPheromones.get("A");
    const alarmNearNest = fieldA.sample(PheromoneType.ALARM, colonyA.nest.position) / fieldA.maxIntensity;
    const metrics = simulation.getColonyMetrics(colonyA);
    rows.push({
      tick: tick + 1,
      phase: tick < PHASE_2_START ? "calme" : tick < PHASE_3_START ? "pression" : "retour au calme",
      threatPressure: Number(colonyA.threatPressure.toFixed(2)),
      soldierCount: metrics.soldierCount,
      workerCount: metrics.workerCount,
      soldierRatio: metrics.livingAnts === 0 ? 0 : Number((metrics.soldierCount / metrics.livingAnts).toFixed(3)),
      recentCombatDeaths: recentCombatDeathsWindow,
      recentForeignContacts: recentForeignContactsWindow,
      alarmNearNest: Number(alarmNearNest.toFixed(4)),
      foodStock: Number(metrics.foodStock.toFixed(1)),
    });
    recentCombatDeathsWindow = 0;
    recentForeignContactsWindow = 0;
  }
}

console.table(rows.filter((_, index) => index % 5 === 0));
