export const FoodSourceState = Object.freeze({
  SPAWN: "SPAWN",
  ACTIVE: "ACTIVE",
  DEPLETED: "DEPLETED",
  COOLDOWN: "COOLDOWN",
});

export class FoodSource {
  constructor({ id = null, x, y, quantity, radius, state = FoodSourceState.ACTIVE }) {
    this.id = id;
    this.position = { x, y };
    this.quantity = quantity;
    this.initialQuantity = quantity;
    this.radius = radius;
    this.state = state;
    this.age = 0;
    this.cooldownRemaining = 0;
  }

  get active() {
    return this.state === FoodSourceState.ACTIVE && this.quantity >= 1;
  }

  take(amount = 1) {
    if (!this.active || amount <= 0) return 0;
    const collected = Math.min(amount, this.quantity);
    this.quantity -= collected;
    if (this.quantity < 1) this.state = FoodSourceState.DEPLETED;
    return collected;
  }

  regenerate(amount) {
    if (amount <= 0 || this.quantity >= this.initialQuantity) return 0;
    const regenerated = Math.min(amount, this.initialQuantity - this.quantity);
    this.quantity += regenerated;
    if (this.quantity >= 1 && this.state !== FoodSourceState.COOLDOWN) {
      this.state = FoodSourceState.ACTIVE;
    }
    return regenerated;
  }

  deplete() {
    this.state = FoodSourceState.DEPLETED;
  }

  startCooldown(delay) {
    this.state = FoodSourceState.COOLDOWN;
    this.cooldownRemaining = delay;
    this.quantity = 0;
    this.age = 0;
  }

  spawn(position, quantity, radius = this.radius) {
    this.position = { ...position };
    this.quantity = quantity;
    this.initialQuantity = quantity;
    this.radius = radius;
    this.state = FoodSourceState.SPAWN;
    this.age = 0;
    this.cooldownRemaining = 0;
  }

  activate() {
    this.state = FoodSourceState.ACTIVE;
    this.age = 0;
  }
}
