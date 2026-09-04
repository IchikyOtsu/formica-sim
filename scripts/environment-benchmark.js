import { AntState } from "../src/entities/Ant.js";
import { Simulation } from "../src/simulation/Simulation.js";
import { DEFAULT_CONFIG } from "../src/simulation/SimulationConfig.js";

const argument = (name, fallback) => {
  const match = process.argv.find((value) => value.startsWith(`--${name}=`));
  return match ? Number(match.split("=")[1]) : fallback;
};

const seedCount = Math.max(1, argument("seeds", 1));
const duration = Math.max(1, argument("ticks", 40_000));
const seasonDurationTicks = Math.max(100, argument("season", 2_500));

const experiments = [
  {
    name: "A — environnement stable",
    config: {
      environmentEnabled: false,
      foodRegenerationRate: 0.004,
    },
  },
  {
    name: "B — saisons modérées",
    config: {
      environmentEnabled: true,
      environmentSeverity: 1,
      foodSpawnProbability: 0.003,
    },
  },
  {
    name: "C — saisons hostiles",
    config: {
      environmentEnabled: true,
      environmentSeverity: 1.9,
      foodRegenerationRate: 0.0003,
      foodSpawnProbability: 0.0002,
      initialFoodStock: 0,
      foodSources: DEFAULT_CONFIG.foodSources.map((source, index) => ({
        ...source,
        quantity: [8, 6, 4][index],
      })),
      foodEnergyValue: 12,
      energyConsumptionRate: 0.025,
      basalEnergyConsumptionRate: 0.025,
      dangerZones: DEFAULT_CONFIG.dangerZones.map((zone) => ({
        ...zone,
        mortalityProbability: zone.mortalityProbability * 3,
      })),
    },
  },
];

function run(experiment, seed) {
  const simulation = new Simulation({
    ...DEFAULT_CONFIG,
    seasonDurationTicks,
    ...experiment.config,
    seed,
  });
  let populationTotal = 0;
  let samples = 0;
  let minimumPopulation = Infinity;
  let minimumStock = Infinity;
  let maximumStock = 0;
  while (simulation.tickCount < duration) {
    const hasWorkers = simulation.colony.ants.some((ant) => ant.state !== AntState.DEAD);
    if (!hasWorkers && simulation.colony.brood.length === 0) break;
    simulation.tick();
    if (simulation.tickCount % 100 !== 0) continue;
    const metrics = simulation.getMetrics();
    populationTotal += metrics.livingAnts;
    samples += 1;
    minimumPopulation = Math.min(minimumPopulation, metrics.livingAnts);
    minimumStock = Math.min(minimumStock, metrics.foodStock);
    maximumStock = Math.max(maximumStock, metrics.foodStock);
  }
  const metrics = simulation.getMetrics();
  return {
    outcome: metrics.livingAnts === 0 && metrics.broodSize === 0 ? "EXTINCTION" : "SURVIE",
    averagePopulation: samples === 0 ? metrics.livingAnts : populationTotal / samples,
    minimumPopulation: minimumPopulation === Infinity ? metrics.livingAnts : minimumPopulation,
    finalPopulation: metrics.livingAnts,
    minimumStock: minimumStock === Infinity ? metrics.foodStock : minimumStock,
    maximumStock,
    finalStock: metrics.foodStock,
    births: metrics.births,
    deaths: metrics.deaths,
    starvationDeaths: metrics.starvationDeaths,
    environmentalDeaths: metrics.environmentalDeaths,
    cyclesSurvived: metrics.seasonCyclesCompleted,
    finalTick: metrics.tick,
  };
}

const rounded = (value) => Number(value.toFixed(2));

console.log(
  `Benchmark environnement V0.7 — ${seedCount} seed(s), ${duration} ticks, saisons de ${seasonDurationTicks} ticks`,
);
for (const experiment of experiments) {
  const runs = Array.from({ length: seedCount }, (_, index) => (
    run(experiment, DEFAULT_CONFIG.seed + index * 7919)
  ));
  console.log(`\n${experiment.name}`);
  console.table(runs.map((result) => ({
    résultat: result.outcome,
    "population moy.": rounded(result.averagePopulation),
    "population min.": result.minimumPopulation,
    "population finale": result.finalPopulation,
    "stock min.": rounded(result.minimumStock),
    "stock max.": rounded(result.maximumStock),
    "stock final": rounded(result.finalStock),
    naissances: result.births,
    morts: result.deaths,
    famine: result.starvationDeaths,
    environnement: result.environmentalDeaths,
    "cycles survécus": result.cyclesSurvived,
    ticks: result.finalTick,
  })));
}
