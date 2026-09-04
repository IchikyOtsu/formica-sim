import { NestChamber, NestChamberType } from "./NestChamber.js";

// Petit monde intérieur abstrait, dans un espace de coordonnées LOCAL à la
// colonie (indépendant des coordonnées monde) : cinq chambres fixes au
// départ, disposées en étoile autour de l'entrée plutôt qu'autour d'un HUB
// séparé — la topologie du ticket (BROOD / ENTRANCE-HUB-QUEEN / STORAGE /
// REST) reste respectée visuellement (corridors dessinés depuis l'entrée),
// sans ajouter un sixième type de chambre absent de la spécification.
//
// Depuis V1.5.3, `chambers` est indexé par un ID unique — pas par type — car
// la construction dynamique peut créer plusieurs chambres du même type
// (ex. STORAGE-2). Les cinq chambres d'origine gardent leur type comme ID
// (ex. "STORAGE"), donc tout code qui appelait `getChamber(TYPE)` avant
// V1.5.3 continue de fonctionner à l'identique tant qu'aucune chambre
// supplémentaire n'a été construite.
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
    this.corridors = [...NEST_CORRIDORS.map((edge) => [...edge])];
    // Chantiers en cours (V1.5.3) : id -> { id, type, position, anchorId,
    // progress, requiredProgress }. Une fois achevé, un chantier devient une
    // vraie chambre via addChamber() et disparaît de cette Map.
    this.pendingSites = new Map();
    this.nextSiteId = 1;
  }

  getChamber(id) {
    const chamber = this.chambers.get(id);
    if (!chamber) throw new Error(`Unknown nest chamber: ${id}`);
    return chamber;
  }

  getChambersByType(type) {
    return [...this.chambers.values()].filter((chamber) => chamber.type === type);
  }

  // Parmi les chambres d'un type donné, celle qui a le moins d'occupantes
  // actuellement — répartition de charge simple, réutilisée pour router les
  // fourmis (V1.5.3) comme pour choisir une entrée (V1.5.4). Déterministe :
  // en cas d'égalité, la première par ordre d'insertion l'emporte.
  leastLoadedChamberOfType(type) {
    const candidates = this.getChambersByType(type);
    return candidates.reduce((best, chamber) => (
      chamber.occupants.size < best.occupants.size ? chamber : best
    ), candidates[0]);
  }

  // Ajoute une chambre construite dynamiquement, reliée par un corridor à la
  // chambre "ancre" depuis laquelle elle a été creusée. L'ID est dérivé du
  // type + d'un compteur (STORAGE-2, STORAGE-3, ...) pour rester lisible.
  // `exitAngle` n'est utile que pour une chambre ENTRANCE : l'angle de
  // sortie côté monde, fixe et déterministe pour cette entrée précise.
  addChamber(type, position, anchorId, exitAngle = null) {
    const existingOfType = this.getChambersByType(type).length;
    const id = existingOfType === 0 ? type : `${type}-${existingOfType + 1}`;
    const chamber = new NestChamber({ id, type, position, exitAngle });
    this.chambers.set(id, chamber);
    this.corridors.push([anchorId, id]);
    return chamber;
  }

  // Plus court chemin (en nombre de chambres) entre deux chambres, en
  // suivant uniquement les corridors existants — jamais une ligne droite à
  // travers le nid. Retourne une liste d'IDs, `toId` compris. Si `fromId`
  // n'est relié à rien (ne devrait jamais arriver sur un graphe connexe),
  // retombe sur un saut direct vers `toId`.
  path(fromId, toId) {
    if (fromId === toId) return [toId];
    const adjacency = new Map();
    for (const [a, b] of this.corridors) {
      if (!adjacency.has(a)) adjacency.set(a, []);
      if (!adjacency.has(b)) adjacency.set(b, []);
      adjacency.get(a).push(b);
      adjacency.get(b).push(a);
    }
    const visited = new Set([fromId]);
    const queue = [[fromId]];
    while (queue.length > 0) {
      const current = queue.shift();
      const last = current[current.length - 1];
      if (last === toId) return current;
      for (const neighbor of adjacency.get(last) ?? []) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        queue.push([...current, neighbor]);
      }
    }
    return [toId];
  }

  moveAntToChamber(ant, id) {
    const target = this.getChamber(id);
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
