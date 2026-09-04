import { PheromoneType } from "./PheromoneField.js";

export const TerritoryState = Object.freeze({
  NEUTRAL: "NEUTRAL",
  CONTESTED: "CONTESTED",
});

export class TerritoryMap {
  constructor(width, height, cellSize) {
    this.width = width;
    this.height = height;
    this.cellSize = cellSize;
    this.columns = Math.ceil(width / cellSize);
    this.rows = Math.ceil(height / cellSize);
    this.cells = Array(this.columns * this.rows).fill(TerritoryState.NEUTRAL);
    this.influences = new Map();
    this.stats = { neutral: this.cells.length, contested: 0, controlled: {} };
  }

  update(fields, colonyIds, { minimumInfluence = 0.08, contestThreshold = 0.4 } = {}) {
    this.influences = new Map(colonyIds.map((id) => [id, new Float32Array(this.cells.length)]));
    const controlled = Object.fromEntries(colonyIds.map((id) => [id, 0]));
    let neutral = 0;
    let contested = 0;
    for (let index = 0; index < this.cells.length; index += 1) {
      const scores = colonyIds.map((id) => {
        const field = fields.get(id);
        const value = field.layer(PheromoneType.HOME)[index] + field.layer(PheromoneType.FOOD)[index];
        this.influences.get(id)[index] = value;
        return { id, value };
      }).sort((a, b) => b.value - a.value || a.id.localeCompare(b.id));
      const first = scores[0];
      const second = scores[1];
      if (!first || first.value < minimumInfluence) {
        this.cells[index] = TerritoryState.NEUTRAL;
        neutral += 1;
      } else if (second && second.value >= minimumInfluence
        && Math.abs(first.value - second.value) < contestThreshold) {
        this.cells[index] = TerritoryState.CONTESTED;
        contested += 1;
      } else {
        this.cells[index] = first.id;
        controlled[first.id] += 1;
      }
    }
    this.stats = { neutral, contested, controlled };
    return this.stats;
  }

  getStats() {
    return {
      neutral: this.stats.neutral,
      contested: this.stats.contested,
      controlled: { ...this.stats.controlled },
    };
  }
}
