import { Simulation } from "../src/simulation/Simulation.js";
import { DEFAULT_CONFIG } from "../src/simulation/SimulationConfig.js";

const argument = (name, fallback) => {
  const match = process.argv.find((value) => value.startsWith(`--${name}=`));
  return match ? Number(match.split("=")[1]) : fallback;
};

const seedCount = Math.max(1, argument("seeds", 1));
const duration = Math.max(1, argument("ticks", 30_000));

const experiments = [
  { name: "A — dangers, ALARM désactivée", enabled: false, influence: 0 },
  { name: "B — ALARM faible", enabled: true, influence: 0.45 },
  { name: "C — ALARM équilibrée", enabled: true, influence: 1.2 },
  {
    name: "D — ALARM forte et persistante",
    enabled: true,
    influence: 4,
    alarmEvaporationRate: 0.004,
    alarmDamageDepositStrength: 3,
    alarmDeathDepositStrength: 45,
  },
];

function run(experiment, seed) {
  const simulation = new Simulation({
    ...DEFAULT_CONFIG,
    seed,
    reproductionEnabled: false,
    dangerZones: DEFAULT_CONFIG.dangerZones.map((zone) => ({
      ...zone,
      mortalityProbability: zone.mortalityProbability * 8,
    })),
    alarmPheromonesEnabled: experiment.enabled,
    alarmInfluence: experiment.influence,
    alarmEvaporationRate: experiment.alarmEvaporationRate
      ?? DEFAULT_CONFIG.alarmEvaporationRate,
    alarmDamageDepositStrength: experiment.alarmDamageDepositStrength
      ?? DEFAULT_CONFIG.alarmDamageDepositStrength,
    alarmDeathDepositStrength: experiment.alarmDeathDepositStrength
      ?? DEFAULT_CONFIG.alarmDeathDepositStrength,
  });
  for (let index = 0; index < duration; index += 1) simulation.tick();
  const metrics = simulation.getMetrics();
  return {
    livingWorkers: metrics.livingAnts,
    environmentalDeaths: metrics.environmentalDeaths,
    starvationDeaths: metrics.starvationDeaths,
    exposures: metrics.dangerExposures,
    dangerDistance: metrics.dangerDistance,
    collected: metrics.resources,
    totalDistance: metrics.totalDistance,
    averageDetour: metrics.averageDetourDistance,
    alarmIntensity: metrics.alarmPheromones.total,
    alarmCells: metrics.alarmPheromones.activeCells,
  };
}

function mean(runs, key) {
  return runs.reduce((total, result) => total + result[key], 0) / runs.length;
}

const rounded = (value) => Number(value.toFixed(2));

console.log(`Benchmark ALARM V0.8 — ${seedCount} seed(s), ${duration} ticks`);
for (const experiment of experiments) {
  const runs = Array.from({ length: seedCount }, (_, index) => (
    run(experiment, DEFAULT_CONFIG.seed + index * 7919)
  ));
  console.log(`\n${experiment.name}`);
  console.table([{
    "ouvrières vivantes": rounded(mean(runs, "livingWorkers")),
    "morts environnement": rounded(mean(runs, "environmentalDeaths")),
    "morts famine": rounded(mean(runs, "starvationDeaths")),
    expositions: rounded(mean(runs, "exposures")),
    "distance en danger": rounded(mean(runs, "dangerDistance")),
    collectée: rounded(mean(runs, "collected")),
    "distance totale": rounded(mean(runs, "totalDistance")),
    "détour moyen": rounded(mean(runs, "averageDetour")),
    "ALARM totale": rounded(mean(runs, "alarmIntensity")),
    "cellules ALARM": rounded(mean(runs, "alarmCells")),
  }]);
}
