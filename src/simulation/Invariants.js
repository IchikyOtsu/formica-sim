import { AntState } from "../entities/Ant.js";
import { PheromoneType } from "./PheromoneField.js";

const EPSILON = 1e-6;

export function inspectSimulationInvariants(simulation) {
  const violations = [];
  const add = (name, details) => violations.push({ name, details });
  const living = simulation.colony.ants.filter((ant) => ant.state !== AntState.DEAD);

  for (const ant of simulation.colony.ants) {
    if (ant.energy < -EPSILON || ant.energy > ant.maxEnergy + EPSILON) {
      add("worker-energy-bounds", `${ant.id}: ${ant.energy}`);
    }
    if (!simulation.world.contains(ant.position)) add("worker-inside-world", ant.id);
    if (ant.state === AntState.DEAD && (ant.carryingFood || ant.target !== null)) {
      add("dead-worker-inert", ant.id);
    }
  }
  if (simulation.colony.foodStock < -EPSILON) {
    add("non-negative-food-stock", String(simulation.colony.foodStock));
  }
  if (simulation.colony.brood.length > simulation.config.maxBrood) {
    add("brood-limit", `${simulation.colony.brood.length} > ${simulation.config.maxBrood}`);
  }
  if (living.length + simulation.colony.brood.length > simulation.config.maxWorkers) {
    add("worker-limit", `${living.length} + ${simulation.colony.brood.length}`);
  }
  for (const type of Object.values(PheromoneType)) {
    for (const intensity of simulation.pheromoneField.layer(type)) {
      if (!Number.isFinite(intensity) || intensity < -EPSILON) {
        add("non-negative-pheromones", type);
        break;
      }
    }
  }

  const inputs = simulation.config.initialFoodStock
    + simulation.initialFoodQuantity
    + simulation.regeneratedFood
    + simulation.spawnedFood;
  const accounted = simulation.colony.foodStock
    + simulation.colony.consumedFood
    + simulation.foodSources.reduce((sum, source) => sum + source.quantity, 0)
    + simulation.colony.ants.reduce((sum, ant) => sum + ant.carryingFoodAmount, 0)
    + simulation.lostFood
    + simulation.expiredFood;
  const massError = inputs - accounted;
  if (Math.abs(massError) > 1e-4) add("food-conservation", `écart=${massError}`);

  return {
    valid: violations.length === 0,
    violations,
    food: { inputs, accounted, error: massError },
  };
}

export function assertSimulationInvariants(simulation) {
  const report = inspectSimulationInvariants(simulation);
  if (!report.valid) {
    const details = report.violations.map(({ name, details: value }) => `${name}: ${value}`).join("; ");
    throw new Error(`Invariant moteur violé — ${details}`);
  }
  return report;
}
