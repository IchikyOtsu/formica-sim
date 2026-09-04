import { AntState, Caste } from "../entities/Ant.js";
import { PheromoneType } from "./PheromoneField.js";

const EPSILON = 1e-6;

export function inspectSimulationInvariants(simulation) {
  const violations = [];
  const add = (name, details) => violations.push({ name, details });
  const ants = simulation.colonies.flatMap((colony) => colony.ants);

  for (const ant of ants) {
    if (ant.energy < -EPSILON || ant.energy > ant.maxEnergy + EPSILON) {
      add("worker-energy-bounds", `${ant.id}: ${ant.energy}`);
    }
    if (ant.health > ant.maxHealth + EPSILON) {
      add("worker-health-bounds", `${ant.id}: ${ant.health}`);
    }
    if (!simulation.world.contains(ant.position)) add("worker-inside-world", ant.id);
    if (ant.state === AntState.DEAD
      && (ant.carryingFood || ant.target !== null || ant.raidId !== null || ant.raidCargo !== 0)) {
      add("dead-worker-inert", ant.id);
    }
    if (ant.raidCargo < -EPSILON || ant.raidCargo > ant.raidCarryCapacity + EPSILON) {
      add("raid-cargo-bounds", `${ant.id}: ${ant.raidCargo} / ${ant.raidCarryCapacity}`);
    }
    if (ant.raidCargo > EPSILON && ant.raidId === null && ant.state !== AntState.DEAD) {
      add("raid-cargo-without-raid", ant.id);
    }
    if (ant.internalFoodCargo < -EPSILON) {
      add("internal-food-cargo-bounds", `${ant.id}: ${ant.internalFoodCargo}`);
    }
    if (ant.state !== AntState.DEAD && ant.health <= 0) {
      add("living-worker-positive-health", `${ant.id}: ${ant.health}`);
    }
    if (ant.caste === Caste.SOLDIER && ant.carryingFood) {
      add("soldier-never-forages", ant.id);
    }
    if (ant.state === AntState.RAIDING && ant.caste !== Caste.SOLDIER) {
      add("raider-must-be-soldier", ant.id);
    }
    if (ant.state === AntState.DEFENDING && ant.caste !== Caste.SOLDIER) {
      add("defender-must-be-soldier", ant.id);
    }
    if (ant.state === AntState.RAIDING_INSIDE && ant.caste !== Caste.SOLDIER) {
      add("interior-raider-must-be-soldier", ant.id);
    }
    if (ant.state === AntState.DEFENDING_INSIDE && ant.caste !== Caste.SOLDIER) {
      add("interior-defender-must-be-soldier", ant.id);
    }
  }
  // Une fourmi indoor n'est chez elle QUE si elle n'est pas en train de
  // piller un nid étranger (V1.5.4) : dans ce cas précis, et uniquement
  // celui-là, `nestId` doit être une colonie DIFFERENTE de la sienne.
  for (const colony of simulation.colonies) {
    for (const ant of colony.ants) {
      if (ant.locationType !== "NEST") continue;
      if (ant.state === AntState.RAIDING_INSIDE) {
        if (ant.nestId === colony.id) add("raiding-inside-must-be-foreign", ant.id);
      } else if (ant.nestId !== colony.id) {
        add("own-nest-only-unless-raiding-inside", ant.id);
      }
    }
  }
  for (const colony of simulation.colonies) {
    for (const [targetColonyId, intel] of colony.knownEnemyNests) {
      if (targetColonyId === colony.id) add("no-self-nest-intel", colony.id);
      if (!Number.isFinite(intel.position.x) || !Number.isFinite(intel.position.y)) {
        add("nest-intel-position-finite", `${colony.id}:${targetColonyId}`);
      }
    }
  }
  for (const colony of simulation.colonies) {
    const config = simulation.colonyConfigs.get(colony.id);
    const living = colony.ants.filter((ant) => ant.state !== AntState.DEAD);
    if (colony.foodStock < -EPSILON) {
      add("non-negative-food-stock", `${colony.id}: ${colony.foodStock}`);
    }
    if (colony.broodFoodBuffer < -EPSILON) {
      add("non-negative-brood-food-buffer", `${colony.id}: ${colony.broodFoodBuffer}`);
    }
    if (colony.brood.length > config.maxBrood) {
      add("brood-limit", `${colony.id}: ${colony.brood.length} > ${config.maxBrood}`);
    }
    if (living.length + colony.brood.length > config.maxWorkers) {
      add("worker-limit", `${colony.id}: ${living.length} + ${colony.brood.length}`);
    }
  }
  for (const [colonyId, field] of simulation.pheromoneFields) {
    for (const type of Object.values(PheromoneType)) {
      for (const intensity of field.layer(type)) {
        if (!Number.isFinite(intensity) || intensity < -EPSILON) {
          add("non-negative-pheromones", `${colonyId}:${type}`);
          break;
        }
      }
    }
  }

  const inputs = simulation.initialColonyFoodStock
    + simulation.initialFoodQuantity
    + simulation.regeneratedFood
    + simulation.spawnedFood;
  const accounted = simulation.colonies.reduce((sum, colony) => (
    sum + colony.foodStock + colony.consumedFood + colony.broodFoodBuffer
  ), 0)
    + simulation.foodSources.reduce((sum, source) => sum + source.quantity, 0)
    + ants.reduce((sum, ant) => sum + ant.carryingFoodAmount + ant.raidCargo + ant.internalFoodCargo, 0)
    + simulation.lostFood
    + simulation.expiredFood
    + simulation.removedColonyFood;
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
