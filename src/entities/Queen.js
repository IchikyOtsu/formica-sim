export class Queen {
  constructor({ id, colonyId, position, layingCooldownTicks }) {
    this.id = id;
    this.colonyId = colonyId;
    this.position = { ...position };
    this.layingCooldownTicks = layingCooldownTicks;
    this.cooldownRemaining = 0;
    this.eggsLaid = 0;
  }
}
