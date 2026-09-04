import { AntState } from "../src/entities/Ant.js";
import { ExperimentRunner } from "../src/experiments/ExperimentRunner.js";
import { DEFAULT_CONFIG } from "../src/simulation/SimulationConfig.js";

const argument = (name, fallback) => {
  const match = process.argv.find((value) => value.startsWith(`--${name}=`));
  return match ? Number(match.split("=")[1]) : fallback;
};

const seedCount = Math.max(1, argument("seeds", 1));
const duration = Math.max(1, argument("ticks", 40_000));
const seasonDurationTicks = Math.max(100, argument("season", 2_500));
const runner = new ExperimentRunner();

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
  const result = runner.run({
    config: {
      ...DEFAULT_CONFIG,
      seasonDurationTicks,
      alarmPheromonesEnabled: false,
      ...experiment.config,
      seed,
    },
    ticks: duration,
    sampleInterval: 100,
    stopWhen(simulation) {
      const hasWorkers = simulation.colony.ants.some((ant) => ant.state !== AntState.DEAD);
      return !hasWorkers && simulation.colony.brood.length === 0;
    },
  });
  const { metrics, series } = result;
  const sampledPopulation = series.map((sample) => sample.population);
  const sampledStock = series.map((sample) => sample.foodStock);
  return {
    outcome: metrics.livingAnts === 0 && metrics.broodSize === 0 ? "EXTINCTION" : "SURVIE",
    averagePopulation: sampledPopulation.reduce((total, value) => total + value, 0)
      / sampledPopulation.length,
    minimumPopulation: Math.min(...sampledPopulation),
    finalPopulation: metrics.livingAnts,
    minimumStock: Math.min(...sampledStock),
    maximumStock: Math.max(...sampledStock),
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
