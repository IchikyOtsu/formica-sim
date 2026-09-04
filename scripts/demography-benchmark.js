import { AntState } from "../src/entities/Ant.js";
import { Simulation } from "../src/simulation/Simulation.js";
import { DEFAULT_CONFIG } from "../src/simulation/SimulationConfig.js";

const argument = (name, fallback) => {
  const match = process.argv.find((value) => value.startsWith(`--${name}=`));
  return match ? Number(match.split("=")[1]) : fallback;
};
const seedCount = Math.max(1, argument("seeds", 1));
const duration = Math.max(1, argument("ticks", 50_000));
const scaledFood = (quantities) => DEFAULT_CONFIG.foodSources.map((source, index) => ({
  ...source,
  quantity: quantities[index],
}));

const experiments = [
  {
    name: "A — reproduction désactivée",
    config: { reproductionEnabled: false, foodRegenerationRate: 0.002 },
  },
  {
    name: "B — reproduction prudente",
    config: { queenLayingCooldownTicks: 2000, maxBrood: 8, reproductionFoodThreshold: 60, foodRegenerationRate: 0.002 },
  },
  {
    name: "C — reproduction agressive",
    config: { queenLayingCooldownTicks: 300, maxBrood: 40, reproductionFoodThreshold: 6, eggFoodCost: 0.15, larvaFoodPerTick: 0.004, foodRegenerationRate: 0.0007, energyConsumptionRate: 0.012, basalEnergyConsumptionRate: 0.006 },
  },
  {
    name: "D — ressources rares",
    config: { initialAnts: 8, initialFoodStock: 1, foodSources: scaledFood([5, 3, 2]), foodRegenerationRate: 0.00005, energyConsumptionRate: 0.02, basalEnergyConsumptionRate: 0.02, reproductionFoodThreshold: 15 },
  },
  {
    name: "E — ressources abondantes",
    config: { queenLayingCooldownTicks: 800, maxBrood: 20, reproductionFoodThreshold: 30, foodRegenerationRate: 0.008 },
  },
];

function run(experiment, seed) {
  const simulation = new Simulation({
    ...DEFAULT_CONFIG,
    environmentEnabled: false,
    ...experiment.config,
    seed,
  });
  while (simulation.tickCount < duration) {
    const hasWorkers = simulation.colony.ants.some((ant) => ant.state !== AntState.DEAD);
    if (!hasWorkers && simulation.colony.brood.length === 0) break;
    simulation.tick();
  }
  const metrics = simulation.getMetrics();
  return {
    outcome: metrics.livingAnts === 0 && metrics.broodSize === 0
      ? "EXTINCTION"
      : metrics.foodStock === 0 ? "FRAGILE" : "SURVIE",
    finalPopulation: metrics.totalPopulation,
    livingWorkers: metrics.livingAnts,
    maxPopulation: metrics.maxPopulation,
    foodStock: metrics.foodStock,
    averageAge: metrics.averageWorkerAge,
    births: metrics.births,
    deaths: metrics.deaths,
    netGrowth: metrics.netGrowth,
    broodFoodCost: metrics.broodFoodCost + metrics.reproductionFoodCost,
    finalTick: simulation.tickCount,
  };
}

function summarize(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((total, value) => total + value, 0) / values.length;
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  const variance = values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length;
  return { mean, median, min: sorted[0], max: sorted.at(-1), sd: Math.sqrt(variance) };
}

const rounded = (value) => Number(value.toFixed(2));

console.log(`Benchmark démographique V0.6 — ${seedCount} seed(s), ${duration} ticks`);
for (const experiment of experiments) {
  const runs = Array.from({ length: seedCount }, (_, index) => (
    run(experiment, DEFAULT_CONFIG.seed + index * 7919)
  ));
  const outcomes = runs.reduce((counts, runResult) => {
    counts[runResult.outcome] = (counts[runResult.outcome] ?? 0) + 1;
    return counts;
  }, {});
  console.log(`\n${experiment.name} — ${JSON.stringify(outcomes)}`);
  console.table(Object.entries({
    "population finale": runs.map((result) => result.finalPopulation),
    "ouvrières vivantes": runs.map((result) => result.livingWorkers),
    "population maximale": runs.map((result) => result.maxPopulation),
    "stock final": runs.map((result) => result.foodStock),
    "âge moyen": runs.map((result) => result.averageAge),
    naissances: runs.map((result) => result.births),
    mortalité: runs.map((result) => result.deaths),
    "croissance nette": runs.map((result) => result.netGrowth),
    "coût du couvain": runs.map((result) => result.broodFoodCost),
    "tick final": runs.map((result) => result.finalTick),
  }).map(([metric, values]) => {
    const stats = summarize(values);
    return {
      métrique: metric,
      moyenne: rounded(stats.mean),
      médiane: rounded(stats.median),
      min: rounded(stats.min),
      max: rounded(stats.max),
      "écart-type": rounded(stats.sd),
    };
  }));
}
