export class FoodSource {
  constructor({ x, y, quantity, radius }) {
    this.position = { x, y };
    this.quantity = quantity;
    this.initialQuantity = quantity;
    this.radius = radius;
  }

  get active() {
    return this.quantity > 0;
  }

  take(amount = 1) {
    if (!this.active || amount <= 0) return 0;
    const collected = Math.min(amount, this.quantity);
    this.quantity -= collected;
    return collected;
  }
}
