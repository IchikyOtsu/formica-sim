export const NestChamberType = Object.freeze({
  ENTRANCE: "ENTRANCE",
  STORAGE: "STORAGE",
  BROOD: "BROOD",
  QUEEN: "QUEEN",
  REST: "REST",
});

export class NestChamber {
  constructor({ id, type, position, radius = 10, capacity = Infinity }) {
    this.id = id;
    this.type = type;
    this.position = { ...position };
    this.radius = radius;
    // V1.5.1 : informative only, jamais bloquante — un occupant de plus que
    // la capacité reste autorisé, seule la valeur est exposée pour un futur
    // ticket qui voudrait la faire respecter.
    this.capacity = capacity;
    this.occupants = new Set();
  }
}
