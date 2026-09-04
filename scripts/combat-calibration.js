import { ExperimentRunner } from "../src/experiments/ExperimentRunner.js";
import { DEFAULT_CONFIG } from "../src/simulation/SimulationConfig.js";

// Grille de calibration courte (V1.2 étape 3) : on ne touche pas attackPower.
// Trois leviers testés isolément puis combinés : coût d'attaque, bonus
// contextuel défensif (alliés/territoire), et acharnement offensif limité.

const seedCount = 6;
const ticks = 10_000;
const initialAnts = 50;

const BASE_PACIFIST = {
  encounterAvoidanceThreshold: 0.15,
  combatThreatenThreshold: 0.55,
  combatAttackThreshold: 1,
  combatFleeHealthRatio: 0.5,
};
const BASE_DEFENSIVE = {
  encounterAvoidanceThreshold: 0.3,
  combatThreatenThreshold: 0.35,
  combatAttackThreshold: 0.55,
  combatFleeHealthRatio: 0.35,
};
const BASE_AGGRESSIVE = {
  encounterAvoidanceThreshold: 0.75,
  combatThreatenThreshold: 0.15,
  combatAttackThreshold: 0.25,
  combatFleeHealthRatio: 0.12,
};

const COMBOS = {
  baseline: { defensive: {}, aggressive: {} },
  "attack-cost": {
    defensive: {},
    aggressive: { combatAttackEnergyCost: 14, combatAttackCooldownTicks: 10 },
  },
  "contextual-defense": {
    defensive: {
      combatNumbersAdvantageWeight: 0.6,
      combatTerritorialAdvantageWeight: 0.6,
      combatAttackCooldownTicks: 3,
    },
    aggressive: {},
  },
  "limit-overcommitment": {
    defensive: {},
    aggressive: { combatFleeHealthRatio: 0.28 },
  },
  combined: {
    defensive: {
      combatNumbersAdvantageWeight: 0.6,
      combatTerritorialAdvantageWeight: 0.6,
      combatAttackCooldownTicks: 3,
    },
    aggressive: {
      combatAttackEnergyCost: 14,
      combatAttackCooldownTicks: 10,
      combatFleeHealthRatio: 0.28,
    },
  },
  "combined-milder": {
    defensive: {
      combatNumbersAdvantageWeight: 0.45,
      combatTerritorialAdvantageWeight: 0.45,
      combatAttackCooldownTicks: 4,
    },
    aggressive: {
      combatAttackEnergyCost: 10,
      combatAttackCooldownTicks: 8,
      combatFleeHealthRatio: 0.22,
    },
  },
};

function baseColonies() {
  return [
    {
      id: "A", name: "Colonie Ambre", color: "#f0b45f",
      nest: { x: 105, y: 260, radius: 28 }, initialAnts, initialFoodStock: 10,
    },
    {
      id: "B", name: "Colonie Azur", color: "#65a9d8",
      nest: { x: 695, y: 260, radius: 28 }, initialAnts, initialFoodStock: 10,
    },
  ];
}

function scenarioConfig(overridesA, overridesB, seed) {
  const [colonyA, colonyB] = baseColonies();
  return {
    ...DEFAULT_CONFIG,
    seed,
    colonies: [{ ...colonyA, ...overridesA }, { ...colonyB, ...overridesB }],
    foodSources: [
      { id: "CENTER", x: 400, y: 260, quantity: 140, radius: 22 },
      { id: "WEST", x: 265, y: 120, quantity: 60, radius: 16 },
      { id: "EAST", x: 535, y: 400, quantity: 60, radius: 16 },
    ],
  };
}

function mean(values) {
  return values.length === 0 ? 0 : values.reduce((total, value) => total + value, 0) / values.length;
}

function runMatchup(overridesA, overridesB) {
  const runner = new ExperimentRunner();
  const runs = [];
  for (let index = 0; index < seedCount; index += 1) {
    const seed = 1847 + index * 7919;
    const config = scenarioConfig(overridesA, overridesB, seed);
    const result = runner.run({ config, ticks, sampleInterval: ticks });
    const [a, b] = result.metrics.colonies;
    runs.push({
      livingAntsA: a.livingAnts, livingAntsB: b.livingAnts,
      collectedA: a.resources, collectedB: b.resources,
      killsA: a.kills, killsB: b.kills,
      combatLossesA: a.combatLosses, combatLossesB: b.combatLosses,
    });
  }
  return {
    livingAntsA: mean(runs.map((run) => run.livingAntsA)),
    livingAntsB: mean(runs.map((run) => run.livingAntsB)),
    collectedA: mean(runs.map((run) => run.collectedA)),
    collectedB: mean(runs.map((run) => run.collectedB)),
    killsA: mean(runs.map((run) => run.killsA)),
    killsB: mean(runs.map((run) => run.killsB)),
    combatLossesA: mean(runs.map((run) => run.combatLossesA)),
    combatLossesB: mean(runs.map((run) => run.combatLossesB)),
  };
}

console.log(`Calibration V1.2 étape 3 — ${seedCount} seeds, ${ticks} ticks, ${Object.keys(COMBOS).length} combos\n`);

const rows = [];
for (const [name, combo] of Object.entries(COMBOS)) {
  const defensive = { ...BASE_DEFENSIVE, ...combo.defensive };
  const aggressive = { ...BASE_AGGRESSIVE, ...combo.aggressive };

  const defVsAgg = runMatchup(defensive, aggressive);
  const aggMirror = runMatchup(aggressive, aggressive);
  const defMirror = runMatchup(defensive, defensive);

  rows.push({
    combo: name,
    "défensif % pop. initiale (vs agressif)": Number((defVsAgg.livingAntsA / initialAnts * 100).toFixed(1)),
    "agressif % pop. initiale (vs défensif)": Number((defVsAgg.livingAntsB / initialAnts * 100).toFixed(1)),
    "kills agressif (vs défensif)": Number(defVsAgg.killsB.toFixed(1)),
    "kills défensif (vs défensif)": Number(defVsAgg.killsA.toFixed(1)),
    "agressif/agressif % pop.": Number((aggMirror.livingAntsA / initialAnts * 100).toFixed(1)),
    "défensif/défensif % pop.": Number((defMirror.livingAntsA / initialAnts * 100).toFixed(1)),
    "défensif/défensif collecte": Number(defMirror.collectedA.toFixed(0)),
  });
}
console.table(rows);
