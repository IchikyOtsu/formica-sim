export class Colony {
  constructor({ id, name = id, nest, color = "#f0b45f", initialFoodStock = 0 }) {
    this.id = id;
    this.name = name;
    this.nest = nest;
    this.color = color;
    this.resources = 0;
    this.foodStock = initialFoodStock;
    this.consumedFood = 0;
    this.ants = [];
    this.queen = null;
    this.brood = [];
    this.births = 0;
    this.starvationDeaths = 0;
    this.environmentalDeaths = 0;
    this.lostFood = 0;
    this.totalDistance = 0;
    this.totalPickups = 0;
    this.foreignContacts = 0;
    this.avoidedContacts = 0;
    this.maxPopulation = 1;
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
