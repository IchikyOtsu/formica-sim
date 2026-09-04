import { compareReference, referenceConfig, REFERENCE_SCENARIO } from "../src/experiments/ReferenceScenario.js";
import { assertSimulationInvariants } from "../src/simulation/Invariants.js";
import { Simulation } from "../src/simulation/Simulation.js";

const simulation = new Simulation(referenceConfig());
simulation.run(REFERENCE_SCENARIO.ticks);
const comparison = compareReference(simulation.getMetrics());
const invariants = assertSimulationInvariants(simulation);

console.log(`Scénario de référence V1.0 — seed ${REFERENCE_SCENARIO.seed}, ${REFERENCE_SCENARIO.ticks} ticks`);
console.table(comparison.checks.map((check) => ({
  métrique: check.metric,
  observé: check.actual,
  référence: check.expected,
  tolérance: check.tolerance,
  état: check.pass ? "PASS" : "FAIL",
})));
console.log(`Invariants: ${invariants.valid ? "PASS" : "FAIL"} · erreur de masse ${invariants.food.error}`);
if (!comparison.pass) process.exitCode = 1;
