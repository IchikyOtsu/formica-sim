import { summarize } from "../src/experiments/AggregateStatistics.js";
import { ExperimentRunner } from "../src/experiments/ExperimentRunner.js";
import { configForPreset } from "../src/experiments/ScenarioPresets.js";

const argument = (name, fallback) => {
  const match = process.argv.find((value) => value.startsWith(`--${name}=`));
  return match ? Number(match.split("=")[1]) : fallback;
};

const seedCount = Math.max(1, argument("seeds", 10));
const ticks = Math.max(1, argument("ticks", 50_000));
const base = configForPreset("symmetric-competition");
const runner = new ExperimentRunner();
const runs = [];

for (let index = 0; index < seedCount; index += 1) {
  const seed = base.seed + index * 7919;
  const result = runner.run({ config: { ...base, seed }, ticks, sampleInterval: 500 });
  const [a, b] = result.metrics.colonies;
  runs.push({
    seed,
    foodCollectedA: a.resources,
    foodCollectedB: b.resources,
    populationA: a.totalPopulation,
    populationB: b.totalPopulation,
    territoryA: a.territoryCells,
    territoryB: b.territoryCells,
    contestedArea: result.metrics.contestedArea,
    foreignContacts: result.metrics.foreignContacts,
    survivalA: a.livingAnts > 0,
    survivalB: b.livingAnts > 0,
    winner: a.resources === b.resources ? "DRAW" : a.resources > b.resources ? "A" : "B",
  });
}

const numeric = [
  "foodCollectedA", "foodCollectedB", "populationA", "populationB",
  "territoryA", "territoryB", "contestedArea", "foreignContacts",
];
console.log(`Compétition V1.1 — ${seedCount} seed(s), ${ticks} ticks`);
console.table(numeric.map((metric) => {
  const stats = summarize(runs.map((run) => run[metric]));
  return {
    métrique: metric,
    moyenne: Number(stats.mean.toFixed(2)),
    médiane: Number(stats.median.toFixed(2)),
    min: Number(stats.min.toFixed(2)),
    max: Number(stats.max.toFixed(2)),
  };
}));
const winsA = runs.filter(({ winner }) => winner === "A").length;
const winsB = runs.filter(({ winner }) => winner === "B").length;
const draws = runs.length - winsA - winsB;
console.table([{
  "victoires A": winsA,
  "victoires B": winsB,
  égalités: draws,
  "taux A hors égalités": winsA + winsB === 0 ? 0 : Number((winsA / (winsA + winsB) * 100).toFixed(1)),
  "survie A": runs.filter(({ survivalA }) => survivalA).length,
  "survie B": runs.filter(({ survivalB }) => survivalB).length,
}]);
