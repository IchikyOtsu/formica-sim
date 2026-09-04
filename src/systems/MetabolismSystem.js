import { AntState, ReturnReason } from "../entities/Ant.js";

export class MetabolismSystem {
  consumeEnergy(
    ant,
    distance,
    deltaSeconds,
    carryingCostMultiplier,
    basalRate,
    movementMultiplier = 1,
    metabolismMultiplier = 1,
  ) {
    if (ant.state === AntState.DEAD) return false;
    const movementCost = distance * ant.energyConsumptionRate
      * (ant.carryingFood ? carryingCostMultiplier : 1)
      * movementMultiplier;
    ant.energy = Math.max(
      0,
      ant.energy - movementCost - basalRate * deltaSeconds * metabolismMultiplier,
    );
    if (ant.energy > 0) return false;
    ant.state = AntState.DEAD;
    ant.target = null;
    ant.returnReason = null;
    return true;
  }

  needsFood(ant) {
    return ant.energy <= ant.maxEnergy * ant.lowEnergyThreshold;
  }

  startEnergyReturn(ant) {
    if (ant.state !== AntState.SEARCHING_FOOD) return false;
    ant.state = AntState.RETURNING_HOME;
    ant.returnReason = ReturnReason.ENERGY;
    ant.target = null;
    ant.direction += Math.PI;
    ant.recentCells = [];
    return true;
  }

  feedAtNest(ant, colony, foodEnergyValue, resumeEnergyThreshold) {
    if (ant.state === AntState.DEAD) return 0;
    const energyMissing = ant.maxEnergy - ant.energy;
    const foodNeeded = energyMissing / foodEnergyValue;
    const consumed = colony.consumeFood(foodNeeded);
    ant.energy = Math.min(ant.maxEnergy, ant.energy + consumed * foodEnergyValue);
    if (ant.energy >= ant.maxEnergy * resumeEnergyThreshold) {
      ant.state = AntState.SEARCHING_FOOD;
      ant.returnReason = null;
      ant.direction += Math.PI;
    } else {
      ant.state = AntState.RESTING;
      ant.returnReason = ReturnReason.ENERGY;
    }
    return consumed;
  }
}
