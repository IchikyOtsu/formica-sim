export const PheromoneType = Object.freeze({
  HOME: "HOME",
  FOOD: "FOOD",
  ALARM: "ALARM",
  TERRITORY: "TERRITORY",
});

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
    this.layers = new Map(Object.values(PheromoneType).map((type) => [
      type,
      new Float32Array(this.columns * this.rows),
    ]));
    this.buffers = new Map(Object.values(PheromoneType).map((type) => [
      type,
      new Float32Array(this.columns * this.rows),
    ]));
  }

  layer(type) {
    const values = this.layers.get(type);
    if (!values) throw new Error(`Unknown pheromone type: ${type}`);
    return values;
  }

  indexAt(position) {
    if (position.x < 0 || position.y < 0 || position.x >= this.width || position.y >= this.height) {
      return -1;
    }
    return Math.floor(position.y / this.cellSize) * this.columns
      + Math.floor(position.x / this.cellSize);
  }

  sample(type, position) {
    const index = this.indexAt(position);
    return index === -1 ? 0 : this.layer(type)[index];
  }

  deposit(type, position, amount) {
    if (amount <= 0) return 0;
    const index = this.indexAt(position);
    if (index === -1) return 0;
    const values = this.layer(type);
    values[index] = Math.min(this.maxIntensity, values[index] + amount);
    return values[index];
  }

  update({ evaporationRate, diffusionRate, minimumIntensity, types = Object.values(PheromoneType) }) {
    if (evaporationRate < 0 || evaporationRate > 1 || diffusionRate < 0 || diffusionRate > 1) {
      throw new Error("Pheromone rates must be between 0 and 1");
    }
    for (const type of types) {
      this.updateLayer(type, evaporationRate, diffusionRate, minimumIntensity);
    }
  }

  updateLayer(type, evaporationRate, diffusionRate, minimumIntensity) {
    const values = this.layer(type);
    let updated = values;
    if (diffusionRate > 0) {
      const buffer = this.buffers.get(type);
      for (let row = 0; row < this.rows; row += 1) {
        for (let column = 0; column < this.columns; column += 1) {
          const index = row * this.columns + column;
          let neighborTotal = 0;
          let neighborCount = 0;
          if (column > 0) { neighborTotal += values[index - 1]; neighborCount += 1; }
          if (column + 1 < this.columns) { neighborTotal += values[index + 1]; neighborCount += 1; }
          if (row > 0) { neighborTotal += values[index - this.columns]; neighborCount += 1; }
          if (row + 1 < this.rows) { neighborTotal += values[index + this.columns]; neighborCount += 1; }
          const neighborMean = neighborCount === 0 ? 0 : neighborTotal / neighborCount;
          buffer[index] = values[index] * (1 - diffusionRate) + neighborMean * diffusionRate;
        }
      }
      updated = buffer;
    }

    const retained = 1 - evaporationRate;
    for (let index = 0; index < values.length; index += 1) {
      const intensity = updated[index] * retained;
      values[index] = intensity < minimumIntensity ? 0 : intensity;
    }
  }

  clear() {
    for (const values of this.layers.values()) values.fill(0);
    for (const buffer of this.buffers.values()) buffer.fill(0);
  }

  getStats(type = null) {
    const layers = type ? [this.layer(type)] : [...this.layers.values()];
    let total = 0;
    let activeCells = 0;
    let maximum = 0;
    for (const values of layers) {
      for (const intensity of values) {
        total += intensity;
        if (intensity > 0) activeCells += 1;
        if (intensity > maximum) maximum = intensity;
      }
    }
    return { total, activeCells, maximum };
  }
}
