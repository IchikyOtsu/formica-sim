import { NestChamber, NestChamberType } from "./NestChamber.js";

// Petit monde intérieur abstrait, dans un espace de coordonnées LOCAL à la
// colonie (indépendant des coordonnées monde) : cinq chambres fixes, disposées
// en étoile autour de l'entrée plutôt qu'autour d'un HUB séparé — la
// topologie du ticket (BROOD / ENTRANCE-HUB-QUEEN / STORAGE / REST) reste
// respectée visuellement (corridors dessinés depuis l'entrée), sans ajouter
// un sixième type de chambre absent de la spécification. Pas de pathfinding :
// tout déplacement intérieur est une ligne directe vers la chambre cible.
const LAYOUT = Object.freeze({
  [NestChamberType.ENTRANCE]: { x: 0, y: 0 },
  [NestChamberType.BROOD]: { x: 0, y: -40 },
  [NestChamberType.QUEEN]: { x: 40, y: 0 },
  [NestChamberType.STORAGE]: { x: 0, y: 40 },
  [NestChamberType.REST]: { x: 0, y: 75 },
});

export const NEST_CORRIDORS = Object.freeze([
  [NestChamberType.ENTRANCE, NestChamberType.BROOD],
  [NestChamberType.ENTRANCE, NestChamberType.QUEEN],
  [NestChamberType.ENTRANCE, NestChamberType.STORAGE],
  [NestChamberType.STORAGE, NestChamberType.REST],
]);

export class NestInterior {
  constructor() {
    this.chambers = new Map();
    for (const [type, position] of Object.entries(LAYOUT)) {
      this.chambers.set(type, new NestChamber({ id: type, type, position }));
    }
    this.entrance = this.chambers.get(NestChamberType.ENTRANCE);
    this.corridors = NEST_CORRIDORS;
  }

  getChamber(type) {
    const chamber = this.chambers.get(type);
    if (!chamber) throw new Error(`Unknown nest chamber: ${type}`);
    return chamber;
  }

  moveAntToChamber(ant, type) {
    const target = this.getChamber(type);
    if (ant.nestChamberId) {
      this.chambers.get(ant.nestChamberId)?.occupants.delete(ant.id);
    }
    target.occupants.add(ant.id);
    ant.nestChamberId = target.id;
    ant.nestPosition = { ...target.position };
  }

  removeAnt(ant) {
    if (ant.nestChamberId) {
      this.chambers.get(ant.nestChamberId)?.occupants.delete(ant.id);
    }
  }
}
