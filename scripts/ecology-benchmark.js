import { Simulation } from "../src/simulation/Simulation.js";
import { DEFAULT_CONFIG } from "../src/simulation/SimulationConfig.js";
import { AntState } from "../src/entities/Ant.js";

const argument = (name, fallback) => {
  const match = process.argv.find((value) => value.startsWith(`--${name}=`));
  return match ? Number(match.split("=")[1]) : fallback;
};
const seedCount = Math.max(1, argument("seeds", 1));
const duration = Math.max(1, argument("ticks", 50_000));

const experiments = [
  { name: "A — coût nul", energyConsumptionRate: 0, basalEnergyConsumptionRate: 0 },
  { name: "B — coût faible", energyConsumptionRate: 0.001, basalEnergyConsumptionRate: 0.0002 },
  { name: "C — coût moyen", energyConsumptionRate: 0.004, basalEnergyConsumptionRate: 0.001 },
  { name: "D — coût élevé", energyConsumptionRate: 0.02, basalEnergyConsumptionRate: 0.02 },
];

function run(experiment, seed) {
  const simulation = new Simulation({
    ...DEFAULT_CONFIG,
    reproductionEnabled: false,
    foodRegenerationRate: 0,
    ...experiment,
    seed,
  });
  while (simulation.tickCount < duration
    && simulation.colony.ants.some((ant) => ant.state !== AntState.DEAD)) {
    simulation.tick();
  }
  const metrics = simulation.getMetrics();
  return {
    outcome: metrics.livingAnts === 0
      ? "EXTINCTION"
      : metrics.foodStock > 0 ? "DURABLE" : "FRAGILE",
    survival: metrics.livingAnts / metrics.totalAnts * 100,
    stock: metrics.foodStock,
    collected: metrics.resources,
    consumed: metrics.consumedFood,
    balance: metrics.foodBalance,
    ratio: metrics.collectionConsumptionRatio ?? 0,
    mortality: metrics.deadAnts,
    averageEnergy: metrics.averageEnergy,
    averageDistance: metrics.totalDistance / metrics.totalAnts,
    finalTick: simulation.tickCount,
  };
}

function summarize(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((total, value) => total + value, 0) / values.length;
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  const variance = values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length;
  return {
    mean,
    median,
    min: sorted[0],
    max: sorted.at(-1),
    standardDeviation: Math.sqrt(variance),
  };
}

const rounded = (value) => Number(value.toFixed(2));

console.log(`Benchmark survie V0.5 — ${seedCount} seed(s), ${duration} ticks`);
for (const experiment of experiments) {
  const runs = Array.from({ length: seedCount }, (_, index) => (
    run(experiment, DEFAULT_CONFIG.seed + index * 7919)
  ));
  const outcomes = runs.reduce((totals, result) => {
    totals[result.outcome] = (totals[result.outcome] ?? 0) + 1;
    return totals;
  }, {});
  console.log(`\n${experiment.name} — ${JSON.stringify(outcomes)}`);
  console.table(Object.entries({
    "survie %": runs.map((result) => result.survival),
    "stock final": runs.map((result) => result.stock),
    collectée: runs.map((result) => result.collected),
    consommée: runs.map((result) => result.consumed),
    bilan: runs.map((result) => result.balance),
    "collecte / conso.": runs.map((result) => result.ratio),
    mortalité: runs.map((result) => result.mortality),
    "énergie moyenne": runs.map((result) => result.averageEnergy),
    "distance moyenne": runs.map((result) => result.averageDistance),
    "tick final": runs.map((result) => result.finalTick),
  }).map(([metric, values]) => {
    const stats = summarize(values);
    return {
      métrique: metric,
      moyenne: rounded(stats.mean),
      médiane: rounded(stats.median),
      min: rounded(stats.min),
      max: rounded(stats.max),
      "écart-type": rounded(stats.standardDeviation),
    };
  }));
}
