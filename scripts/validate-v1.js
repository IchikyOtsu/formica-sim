import { spawnSync } from "node:child_process";
import { EventLog } from "../src/observability/EventLog.js";
import { MetricsRecorder } from "../src/observability/MetricsRecorder.js";
import { ReplayController } from "../src/observability/ReplayController.js";
import { compareReference, referenceConfig, REFERENCE_SCENARIO } from "../src/experiments/ReferenceScenario.js";
import { ExperimentRunner } from "../src/experiments/ExperimentRunner.js";
import { configForPreset } from "../src/experiments/ScenarioPresets.js";
import { assertSimulationInvariants } from "../src/simulation/Invariants.js";
import { PheromoneType } from "../src/simulation/PheromoneField.js";
import { Simulation } from "../src/simulation/Simulation.js";
import { DEFAULT_CONFIG } from "../src/simulation/SimulationConfig.js";

const tests = spawnSync(process.execPath, ["--test"], { stdio: "inherit" });
const results = [];
const record = (name, pass, details = "") => results.push({ name, pass, details });

const reference = new Simulation(referenceConfig());
reference.run(REFERENCE_SCENARIO.ticks);
const comparison = compareReference(reference.getMetrics());
record("Reference scenario", comparison.pass);

try {
  const report = assertSimulationInvariants(reference);
  record("Mass conservation", true, `erreur=${report.food.error}`);
} catch (error) {
  record("Mass conservation", false, error.message);
}

const first = new Simulation(referenceConfig());
const second = new Simulation(referenceConfig());
first.run(5_000);
second.run(5_000);
record("Determinism", JSON.stringify(first.getState()) === JSON.stringify(second.getState()));

const observed = new Simulation(referenceConfig());
const control = new Simulation(referenceConfig());
const recorder = new MetricsRecorder({ sampleInterval: 10 });
const log = new EventLog();
observed.run(2_000, { onTick(simulation) {
  recorder.record(simulation);
  log.capture(simulation.tickEvents);
} });
control.run(2_000);
record("Observability isolation", JSON.stringify(observed.getState()) === JSON.stringify(control.getState()));

const replayed = new Simulation(referenceConfig());
const direct = new Simulation(referenceConfig());
direct.run(1_000);
const previousAnimationFrame = globalThis.requestAnimationFrame;
globalThis.requestAnimationFrame = (callback) => setImmediate(callback);
try {
  const replay = new ReplayController(replayed);
  await replay.seek(1_000, { chunkSize: 200 });
  record("Replay", JSON.stringify(replayed.getState()) === JSON.stringify(direct.getState()));
} finally {
  globalThis.requestAnimationFrame = previousAnimationFrame;
}
record("Non-negative pheromones", Object.values(PheromoneType).every((type) => (
  reference.pheromoneField.layer(type).every((value) => value >= 0)
)));

const runner = new ExperimentRunner();
const experimentProfiles = {
  Pheromones: { pheromonesEnabled: true, environmentEnabled: false },
  Survival: { reproductionEnabled: false, energyConsumptionRate: 0.002 },
  Demography: { reproductionEnabled: true, initialFoodStock: 100, reproductionFoodThreshold: 10 },
  Environment: { environmentEnabled: true, seasonDurationTicks: 100 },
  Alarm: { alarmPheromonesEnabled: true, alarmInfluence: 1.2 },
  Competition: configForPreset("symmetric-competition"),
};
const experimentResults = Object.entries(experimentProfiles).map(([name, overrides]) => {
  const result = runner.run({ config: { ...DEFAULT_CONFIG, ...overrides }, ticks: 500 });
  return { name, pass: result.metrics.tick === 500 && assertSimulationInvariants(result.simulation).valid };
});

console.log("\nFORMICA SIM 1.1 VALIDATION\n");
console.log(`Tests                  ${tests.status === 0 ? "PASS" : "FAIL"}`);
for (const result of results) {
  console.log(`${result.name.padEnd(23)}${result.pass ? "PASS" : "FAIL"}${result.details ? `  ${result.details}` : ""}`);
}
console.log("\nExperiments");
for (const result of experimentResults) console.log(`${result.name.padEnd(23)}${result.pass ? "PASS" : "FAIL"}`);
if (tests.status !== 0
  || results.some((result) => !result.pass)
  || experimentResults.some((result) => !result.pass)) process.exitCode = 1;
