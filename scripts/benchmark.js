import { Simulation } from "../src/simulation/Simulation.js";
import { DEFAULT_CONFIG } from "../src/simulation/SimulationConfig.js";

const argument = (name, fallback) => {
  const match = process.argv.find((value) => value.startsWith(`--${name}=`));
  return match ? Number(match.split("=")[1]) : fallback;
};
const seedCount = Math.max(1, argument("seeds", 5));
const tickLimit = Math.max(1, argument("limit", 100_000));

const experiments = [
  {
    name: "A — aucun signal",
    config: { pheromonesEnabled: false, foodPheromonesEnabled: false, homePheromonesEnabled: false, directHomeNavigation: true, pheromoneDiffusionRate: 0 },
  },
  {
    name: "B — FOOD uniquement",
    config: { pheromonesEnabled: true, foodPheromonesEnabled: true, homePheromonesEnabled: false, directHomeNavigation: true, pheromoneDiffusionRate: 0 },
  },
  {
    name: "C — FOOD + HOME",
    config: { pheromonesEnabled: true, foodPheromonesEnabled: true, homePheromonesEnabled: true, directHomeNavigation: false, pheromoneDiffusionRate: 0 },
  },
  {
    name: "D — FOOD + HOME + diffusion",
    config: { pheromonesEnabled: true, foodPheromonesEnabled: true, homePheromonesEnabled: true, directHomeNavigation: false, pheromoneDiffusionRate: DEFAULT_CONFIG.pheromoneDiffusionRate },
  },
];

function run(config, seed) {
  const simulation = new Simulation({
    ...DEFAULT_CONFIG,
    environmentEnabled: false,
    reproductionEnabled: false,
    foodRegenerationRate: 0,
    ...config,
    seed,
  });
  while (simulation.completionTick === null && simulation.tickCount < tickLimit) simulation.tick();
  const metrics = simulation.getMetrics();
  return {
    completed: simulation.completionTick !== null,
    ticks: simulation.completionTick ?? tickLimit,
    distance: metrics.totalDistance,
    pickups: metrics.totalPickups,
    returnTicks: metrics.averageReturnTicks,
    exploredCells: metrics.exploredCells,
  };
}

function summarize(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((total, value) => total + value, 0) / values.length;
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  const variance = values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length;
  return { mean, median, min: sorted[0], max: sorted.at(-1), standardDeviation: Math.sqrt(variance) };
}

function rounded(value) {
  return Number(value.toFixed(1));
}

console.log(`Benchmark Formica Sim — ${seedCount} seed(s), limite ${tickLimit} ticks`);
for (const experiment of experiments) {
  const runs = Array.from({ length: seedCount }, (_, index) => (
    run(experiment.config, DEFAULT_CONFIG.seed + index * 7919)
  ));
  console.log(`\n${experiment.name} — ${runs.filter((runResult) => runResult.completed).length}/${seedCount} complétées`);
  console.table(Object.entries({
    ticks: runs.map((result) => result.ticks),
    distance: runs.map((result) => result.distance),
    pickups: runs.map((result) => result.pickups),
    "retour moyen": runs.map((result) => result.returnTicks),
    "cellules explorées": runs.map((result) => result.exploredCells),
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
