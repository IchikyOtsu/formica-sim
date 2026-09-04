export class Colony {
  constructor({ id, nest, color = "#f0b45f", initialFoodStock = 0 }) {
    this.id = id;
    this.nest = nest;
    this.color = color;
    this.resources = 0;
    this.foodStock = initialFoodStock;
    this.consumedFood = 0;
    this.ants = [];
  }

  depositFood(amount) {
    if (amount <= 0) return 0;
    this.resources += amount;
    this.foodStock += amount;
    return amount;
  }

  consumeFood(amount) {
    if (amount <= 0 || this.foodStock <= 0) return 0;
    const consumed = Math.min(amount, this.foodStock);
    this.foodStock -= consumed;
    this.consumedFood += consumed;
    return consumed;
  }
}
