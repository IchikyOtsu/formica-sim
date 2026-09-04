import { PheromoneType } from "../simulation/PheromoneField.js";

export class AlarmDepositSystem {
  depositDamage(position, field, strength) {
    return field.deposit(PheromoneType.ALARM, position, strength);
  }

  depositDeath(position, field, strength) {
    const offsets = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]];
    let deposited = 0;
    for (const [x, y] of offsets) {
      deposited += field.deposit(PheromoneType.ALARM, {
        x: position.x + x * field.cellSize,
        y: position.y + y * field.cellSize,
      }, x === 0 && y === 0 ? strength : strength * 0.45);
    }
    return deposited;
  }
}
