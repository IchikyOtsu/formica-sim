export const NestChamberType = Object.freeze({
  ENTRANCE: "ENTRANCE",
  STORAGE: "STORAGE",
  BROOD: "BROOD",
  QUEEN: "QUEEN",
  REST: "REST",
});

export class NestChamber {
  constructor({ id, type, position, radius = 10, capacity = Infinity, exitAngle = null }) {
    this.id = id;
    this.type = type;
    this.position = { ...position };
    this.radius = radius;
    // V1.5.1 : informative only, jamais bloquante — un occupant de plus que
    // la capacité reste autorisé ; la vraie limite appliquée (congestion,
    // V1.5.4) vit dans colonyConfig.nestChamberCapacity, pas ici.
    this.capacity = capacity;
    this.occupants = new Set();
    // V1.5.4 : uniquement pertinent pour une chambre de type ENTRANCE.
    // `null` sur l'entrée d'origine préserve le comportement V1.5.1 (sortie
    // à un angle aléatoire à chaque fois) ; une entrée creusée dynamiquement
    // reçoit un angle fixe déterministe, lui donnant une identité spatiale
    // stable côté monde.
    this.exitAngle = exitAngle;
  }
}
