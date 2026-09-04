import { AntState } from "../entities/Ant.js";
import { PheromoneType } from "../simulation/PheromoneField.js";

export class PheromoneDepositSystem {
  deposit(ant, field, options) {
    if (ant.state === AntState.SEARCHING_FOOD && options.homeEnabled) {
      const strength = options.homeStrength / (1 + ant.distanceSinceNest / options.homeFalloffDistance);
      return field.deposit(PheromoneType.HOME, ant.position, strength);
    }
    if (ant.state === AntState.RETURNING_HOME && ant.carryingFood && options.foodEnabled) {
      return field.deposit(PheromoneType.FOOD, ant.position, options.foodStrength);
    }
    return 0;
  }
}
