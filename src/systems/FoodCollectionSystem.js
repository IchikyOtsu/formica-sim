import { AntState, ReturnReason } from "../entities/Ant.js";

function distance(first, second) {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

export class FoodCollectionSystem {
  collect(ant, pickupDistance = 3) {
    const source = ant.target;
    if (!source?.active) return false;
    if (distance(ant.position, source.position) > source.radius + pickupDistance) return false;

    const collected = source.take(1);
    if (collected === 0) return false;
    ant.carryingFood = true;
    ant.carryingFoodAmount = collected;
    ant.state = AntState.RETURNING_HOME;
    ant.target = null;
    ant.direction += Math.PI;
    ant.recentCells = [];
    ant.returnReason = ReturnReason.FOOD;
    return true;
  }

  deposit(ant, colony) {
    if (!ant.carryingFood) return false;
    if (ant.colonyId !== colony.id) return false;
    if (distance(ant.position, colony.nest.position) > colony.nest.radius) return false;

    colony.depositFood(ant.carryingFoodAmount);
    ant.carryingFood = false;
    ant.carryingFoodAmount = 0;
    ant.state = AntState.SEARCHING_FOOD;
    ant.target = null;
    ant.direction += Math.PI;
    ant.distanceSinceNest = 0;
    ant.recentCells = [];
    ant.returnReason = null;
    return true;
  }
}
