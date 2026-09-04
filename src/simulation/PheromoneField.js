export class PheromoneField {
  constructor(width, height, cellSize = 10, maxIntensity = 100) {
    if (width <= 0 || height <= 0 || cellSize <= 0) {
      throw new Error("Pheromone field dimensions and cell size must be positive");
    }
    this.width = width;
    this.height = height;
    this.cellSize = cellSize;
    this.columns = Math.ceil(width / cellSize);
    this.rows = Math.ceil(height / cellSize);
    this.maxIntensity = maxIntensity;
    this.values = new Float32Array(this.columns * this.rows);
  }

  indexAt(position) {
    if (position.x < 0 || position.y < 0 || position.x >= this.width || position.y >= this.height) {
      return -1;
    }
    const column = Math.floor(position.x / this.cellSize);
    const row = Math.floor(position.y / this.cellSize);
    return row * this.columns + column;
  }

  sample(position) {
    const index = this.indexAt(position);
    return index === -1 ? 0 : this.values[index];
  }

  deposit(position, amount) {
    if (amount <= 0) return 0;
    const index = this.indexAt(position);
    if (index === -1) return 0;
    this.values[index] = Math.min(this.maxIntensity, this.values[index] + amount);
    return this.values[index];
  }

  evaporate(decayFactor, threshold = 0) {
    if (decayFactor < 0 || decayFactor > 1) {
      throw new Error("Pheromone decay factor must be between 0 and 1");
    }
    for (let index = 0; index < this.values.length; index += 1) {
      const decayed = this.values[index] * decayFactor;
      this.values[index] = decayed < threshold ? 0 : decayed;
    }
  }

  clear() {
    this.values.fill(0);
  }

  getStats() {
    let total = 0;
    let activeCells = 0;
    let maximum = 0;
    for (const intensity of this.values) {
      total += intensity;
      if (intensity > 0) activeCells += 1;
      if (intensity > maximum) maximum = intensity;
    }
    return { total, activeCells, maximum };
  }
}
