import { configForPreset } from "./ScenarioPresets.js";

export const REFERENCE_SCENARIO = Object.freeze({
  id: "reference-v1",
  schemaVersion: 1,
  seed: 1847,
  ticks: 50_000,
  expected: Object.freeze({
    livingAnts: { value: 80, tolerance: 0 },
    totalPopulation: { value: 83, tolerance: 0 },
    maxPopulation: { value: 83, tolerance: 0 },
    foodStock: { value: 2527.526498236266, tolerance: 0.001 },
    resources: { value: 2717, tolerance: 0 },
    consumedFood: { value: 199.47350176504415, tolerance: 0.001 },
    births: { value: 32, tolerance: 0 },
    deaths: { value: 2, tolerance: 0 },
    environmentalDeaths: { value: 2, tolerance: 0 },
    broodSize: { value: 2, tolerance: 0 },
    dangerExposures: { value: 33688, tolerance: 0 },
    seasonCyclesCompleted: { value: 2, tolerance: 0 },
    totalDistance: { value: 4447322.4219749225, tolerance: 0.01 },
  }),
});

export function referenceConfig() {
  return configForPreset(REFERENCE_SCENARIO.id);
}

export function compareReference(metrics) {
  const checks = Object.entries(REFERENCE_SCENARIO.expected).map(([metric, expected]) => {
    const actual = metrics[metric];
    const error = Math.abs(actual - expected.value);
    return {
      metric,
      actual,
      expected: expected.value,
      tolerance: expected.tolerance,
      pass: Number.isFinite(actual) && error <= expected.tolerance,
    };
  });
  return { pass: checks.every((check) => check.pass), checks };
}
