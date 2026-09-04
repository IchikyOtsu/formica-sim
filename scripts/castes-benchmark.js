import { summarize } from "../src/experiments/AggregateStatistics.js";
import { ExperimentRunner } from "../src/experiments/ExperimentRunner.js";
import { COMBAT_PROFILES, combatProfileOverrides } from "../src/experiments/CombatProfiles.js";
import { DEFAULT_CONFIG } from "../src/simulation/SimulationConfig.js";

const argument = (name, fallback) => {
  const match = process.argv.find((value) => value.startsWith(`--${name}=`));
  return match ? match.split("=")[1] : fallback;
};

const seedCount = Math.max(1, Number(argument("seeds", 10)));
const ticks = Math.max(1, Number(argument("ticks", 10_000)));
const profileFilter = argument("profile", null);

// Colonie A varie sa politique de castes ; colonie B reste l'agresseur figé de
// Balanced Combat V1.2, pour comparer les 4 stratégies face à la même menace.
// Base commune : posture défensive (comme V1.2), seule la production de
// soldats change — pas de proportion fixe codée en dur pour C, une règle
// économique (stock + threatPressure, plafonnée par un ratio).
const CASTE_PROFILES = {
  "workers-only": {
    label: "A — Workers only",
    overrides: { castesEnabled: false },
  },
  "fixed-ratio": {
    label: "B — 10-15% soldiers (ratio quasi fixe)",
    overrides: {
      castesEnabled: true,
      casteSoldierRatioCap: 0.125,
      threatPressureRatioScale: 1,
      casteStockThreshold: 20,
    },
  },
  adaptive: {
    label: "C — Allocation adaptative",
    overrides: {
      castesEnabled: true,
      casteSoldierRatioCap: 0.35,
      threatPressureRatioScale: 150,
      casteStockThreshold: 30,
    },
  },
  "over-militarized": {
    label: "D — Surmilitarisation",
    overrides: {
      castesEnabled: true,
      casteSoldierRatioCap: 0.7,
      threatPressureRatioScale: 5,
      casteStockThreshold: 5,
    },
  },
};

function baseColonies() {
  return [
    {
      id: "A", name: "Colonie Ambre", color: "#f0b45f",
      nest: { x: 105, y: 260, radius: 28 }, initialAnts: 50, initialFoodStock: 10,
    },
    {
      id: "B", name: "Colonie Azur", color: "#65a9d8",
      nest: { x: 695, y: 260, radius: 28 }, initialAnts: 50, initialFoodStock: 10,
    },
  ];
}

function scenarioConfig(profileId, seed) {
  const [colonyA, colonyB] = baseColonies();
  return {
    ...DEFAULT_CONFIG,
    seed,
    colonies: [
      { ...colonyA, ...combatProfileOverrides("defensive"), ...CASTE_PROFILES[profileId].overrides },
      { ...colonyB, ...combatProfileOverrides("aggressive"), castesEnabled: false },
    ],
    foodSources: [
      { id: "CENTER", x: 400, y: 260, quantity: 140, radius: 22 },
      { id: "WEST", x: 265, y: 120, quantity: 60, radius: 16 },
      { id: "EAST", x: 535, y: 400, quantity: 60, radius: 16 },
    ],
  };
}

function round(value) {
  return Number(value.toFixed(2));
}

function statRow(label, values) {
  const stats = summarize(values);
  return {
    métrique: label,
    moyenne: round(stats.mean),
    médiane: round(stats.median),
    "écart-type": round(stats.standardDeviation),
    min: round(stats.min),
    max: round(stats.max),
  };
}

const runner = new ExperimentRunner();
const ids = Object.keys(CASTE_PROFILES).filter((id) => !profileFilter || id === profileFilter);

for (const id of ids) {
  const runs = [];
  for (let index = 0; index < seedCount; index += 1) {
    const seed = 1847 + index * 7919;
    const result = runner.run({ config: scenarioConfig(id, seed), ticks, sampleInterval: ticks });
    const [a] = result.metrics.colonies;
    runs.push({
      survived: a.livingAnts > 0 ? 1 : 0,
      livingAnts: a.livingAnts,
      population: a.totalPopulation,
      collected: a.resources,
      foodStock: a.foodStock,
      soldierCount: a.soldierCount,
      workerCount: a.workerCount,
      soldierBirths: a.soldierBirths,
      kills: a.kills,
      combatLosses: a.combatLosses,
      soldierKills: a.soldierKills,
      workerKills: a.workerKills,
      soldierLosses: a.soldierLosses,
      workerLosses: a.workerLosses,
      territoryCells: a.territoryCells,
      militaryFoodCost: a.militaryFoodCost,
    });
  }
  const label = CASTE_PROFILES[id].label;
  const survivalCount = runs.filter((run) => run.survived === 1).length;
  console.log(`\n=== ${label} vs ${COMBAT_PROFILES.aggressive.label} (fixe) — ${runs.length} seed(s), ${ticks} ticks ===`);
  console.log(`Survie : ${survivalCount}/${runs.length}`);
  const metrics = [
    "population", "collected", "foodStock", "soldierCount", "workerCount", "soldierBirths",
    "kills", "combatLosses", "soldierKills", "workerKills", "soldierLosses", "workerLosses",
    "territoryCells", "militaryFoodCost",
  ];
  console.table(metrics.map((metric) => statRow(metric, runs.map((run) => run[metric]))));
}
