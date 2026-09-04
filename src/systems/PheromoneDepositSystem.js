import { AntState } from "../entities/Ant.js";

export class PheromoneDepositSystem {
  deposit(ant, field, nest, world, baseAmount) {
    if (!ant.carryingFood || ant.state !== AntState.RETURNING_HOME) return 0;
    const distanceFromNest = Math.hypot(
      ant.position.x - nest.position.x,
      ant.position.y - nest.position.y,
    );
    const worldDiagonal = Math.hypot(world.width, world.height);
    const distanceSignal = 0.15 + 3 * (distanceFromNest / worldDiagonal);
    return field.deposit(ant.position, baseAmount * distanceSignal);
  }
}
