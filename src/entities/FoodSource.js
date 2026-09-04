export class FoodSource {
  constructor({ x, y, quantity, radius }) {
    this.position = { x, y };
    this.quantity = quantity;
    this.initialQuantity = quantity;
    this.radius = radius;
  }

  get active() {
    return this.quantity >= 1;
  }

  take(amount = 1) {
    if (!this.active || amount <= 0) return 0;
    const collected = Math.min(amount, this.quantity);
    this.quantity -= collected;
    return collected;
  }

  regenerate(amount) {
    if (amount <= 0 || this.quantity >= this.initialQuantity) return 0;
    const regenerated = Math.min(amount, this.initialQuantity - this.quantity);
    this.quantity += regenerated;
    return regenerated;
  }
}
