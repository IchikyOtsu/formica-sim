import { Simulation } from "../src/simulation/Simulation.js";
import { Ant, Caste } from "../src/entities/Ant.js";
import { DEFAULT_CONFIG } from "../src/simulation/SimulationConfig.js";
import { summarize } from "../src/experiments/AggregateStatistics.js";

// Mini-benchmark V1.4.4 : est-ce qu'un raid a une valeur économique mesurable
// une fois le pillage actif ? Même scénario, même colonie attaquante, seule
// différence entre les deux conditions : `pillageEnabled`. Les raids
// eux-mêmes (déplacement, combat, retour) tournent identiquement dans les
// deux cas — seul le vol change.
//
// Le déclenchement des raids est scripté ici (pas une politique du moteur) :
// toutes les RAID_INTERVAL_TICKS, si assez de soldats sont disponibles, la
// colonie A envoie un groupe vers le nid de B, déjà connu (injecté
// directement pour ne pas mélanger la question "découverte" avec la question
// "le pillage rapporte-t-il"). `directHomeNavigation` est activé : sans trace
// HOME préexistante sur un aussi long trajet, un raider livré à lui-même peut
// errer indéfiniment avant de retrouver son nid (limite du système de
// navigation, déjà présente depuis V1.4.1, indépendante du pillage).

const argument = (name, fallback) => {
  const match = process.argv.find((value) => value.startsWith(`--${name}=`));
  return match ? match.split("=")[1] : fallback;
};

const seedCount = Math.max(1, Number(argument("seeds", 10)));
const ticks = Math.max(1, Number(argument("ticks", 8_000)));

const RAID_GROUP_SIZE = 4;
const RAID_INTERVAL_TICKS = 400;
const SOLDIER_COUNT = 12;

function scenarioConfig(seed, pillageEnabled) {
  return {
    ...DEFAULT_CONFIG,
    seed,
    combatEnabled: true,
    castesEnabled: false, // soldiers are seeded directly; caste production is not the question here
    directHomeNavigation: true,
    pillageEnabled,
    raidCarryCapacity: 15,
    raidGroupSize: RAID_GROUP_SIZE,
    colonies: [
      {
        id: "A", name: "Ambre", color: "#f0b45f",
        nest: { x: 105, y: 260, radius: 28 }, initialAnts: 40, initialFoodStock: 60,
      },
      {
        id: "B", name: "Azur", color: "#65a9d8",
        nest: { x: 695, y: 260, radius: 28 }, initialAnts: 40, initialFoodStock: 400,
      },
    ],
    foodSources: [
      { id: "NEAR_A", x: 200, y: 260, quantity: 80, radius: 18 },
      { id: "NEAR_B", x: 600, y: 260, quantity: 80, radius: 18 },
    ],
    environmentEnabled: false,
  };
}

function runOnce(seed, pillageEnabled) {
  const simulation = new Simulation(scenarioConfig(seed, pillageEnabled));
  const colonyA = simulation.colonies[0];
  const colonyB = simulation.colonies[1];

  for (let index = 0; index < SOLDIER_COUNT; index += 1) {
    colonyA.ants.push(new Ant({
      id: `A-SOLDIER-${index}`,
      position: { ...colonyA.nest.position },
      direction: 0,
      speed: simulation.config.antSpeed,
      colonyId: "A",
      energy: 100,
      maxEnergy: 100,
      energyConsumptionRate: simulation.config.energyConsumptionRate,
      maxHealth: simulation.config.combatMaxHealth,
      attackPower: simulation.config.combatAttackPower,
      caste: Caste.SOLDIER,
      raidCarryCapacity: simulation.config.raidCarryCapacity,
    }));
  }
  colonyA.knownEnemyNests.set("B", {
    position: { ...colonyB.nest.position },
    discoveredTick: 0,
    lastSeenTick: 0,
  });

  let raidsLaunched = 0;
  for (let tick = 0; tick < ticks; tick += 1) {
    if (tick % RAID_INTERVAL_TICKS === 0) {
      const raid = simulation.requestRaid("A", "B", RAID_GROUP_SIZE);
      if (raid) raidsLaunched += 1;
    }
    simulation.tick();
  }

  const metricsA = simulation.getColonyMetrics(colonyA);
  const metricsB = simulation.getColonyMetrics(colonyB);
  return {
    raidsLaunched,
    aFoodStock: metricsA.foodStock,
    aFoodStolen: metricsA.foodStolen,
    aFoodRecovered: metricsA.foodRecovered,
    aFoodDropped: metricsA.foodDropped,
    aRaidersReturnedWithLoot: metricsA.raidersReturnedWithLoot,
    aRaidersKilledWithLoot: metricsA.raidersKilledWithLoot,
    aRaidersLost: metricsA.raidersLost,
    aLivingAnts: metricsA.livingAnts,
    bFoodStock: metricsB.foodStock,
    bFoodLostToRaids: metricsB.foodLostToRaids,
  };
}

function statRow(label, values) {
  const stats = summarize(values);
  console.log(
    `${label.padEnd(28)} mean=${stats.mean.toFixed(2).padStart(9)}  median=${stats.median.toFixed(2).padStart(9)}  `
    + `stddev=${stats.standardDeviation.toFixed(2).padStart(8)}  min=${stats.min.toFixed(2).padStart(9)}  max=${stats.max.toFixed(2).padStart(9)}`,
  );
}

function runCondition(label, pillageEnabled) {
  console.log(`\n=== ${label} (pillageEnabled=${pillageEnabled}) — ${seedCount} seeds x ${ticks} ticks ===`);
  const results = [];
  for (let index = 0; index < seedCount; index += 1) {
    results.push(runOnce(1000 + index, pillageEnabled));
  }
  statRow("Stock final colonie A", results.map((r) => r.aFoodStock));
  statRow("Nourriture volée", results.map((r) => r.aFoodStolen));
  statRow("Nourriture rapportée", results.map((r) => r.aFoodRecovered));
  statRow("Nourriture perdue (butin tombé)", results.map((r) => r.aFoodDropped));
  statRow("Raiders revenus avec butin", results.map((r) => r.aRaidersReturnedWithLoot));
  statRow("Raiders tués avec butin", results.map((r) => r.aRaidersKilledWithLoot));
  statRow("Raiders perdus (total)", results.map((r) => r.aRaidersLost));
  statRow("Population A restante", results.map((r) => r.aLivingAnts));
  statRow("Stock final colonie B", results.map((r) => r.bFoodStock));
  return results;
}

const without = runCondition("Sans pillage", false);
const withPillage = runCondition("Pillage actif", true);

const meanStock = (results) => summarize(results.map((r) => r.aFoodStock)).mean;
const delta = meanStock(withPillage) - meanStock(without);

console.log("\n=== Verdict ===");
console.log(`Stock final moyen (A) sans pillage : ${meanStock(without).toFixed(2)}`);
console.log(`Stock final moyen (A) avec pillage : ${meanStock(withPillage).toFixed(2)}`);
console.log(`Écart attribuable au pillage        : ${delta.toFixed(2)} (${delta > 0 ? "+" : ""}${((delta / meanStock(without)) * 100).toFixed(1)}%)`);
