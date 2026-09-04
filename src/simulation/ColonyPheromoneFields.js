import { PheromoneField } from "./PheromoneField.js";

export class ColonyPheromoneFields {
  constructor(colonyIds, width, height, cellSize, maxIntensity) {
    this.fields = new Map(colonyIds.map((id) => [
      id,
      new PheromoneField(width, height, cellSize, maxIntensity),
    ]));
  }

  get(colonyId) {
    const field = this.fields.get(colonyId);
    if (!field) throw new Error(`Unknown colony pheromone field: ${colonyId}`);
    return field;
  }

  entries() {
    return this.fields.entries();
  }

  values() {
    return this.fields.values();
  }

  clear() {
    for (const field of this.fields.values()) field.clear();
  }
}
