import { NestChamberType } from "./NestChamber.js";

const CONSTRUCTIBLE_TYPES = Object.freeze([
  NestChamberType.STORAGE,
  NestChamberType.REST,
  NestChamberType.BROOD,
  // V1.5.4 : une entrée saturée (beaucoup de trafic entrant/sortant) peut
  // elle aussi être doublée — c'est exactement le même déclencheur
  // générique (occupation instantanée >= nestChamberCapacity), rendu
  // vraiment utile une fois la congestion (V1.5.4.2) activée.
  NestChamberType.ENTRANCE,
]);

// Décide QUAND ouvrir un nouveau chantier — jamais COMMENT creuser (ça reste
// `Simulation.updateBuildingAnt` + `NestInterior.addChamber`, une fois le
// travail terminé). "Pleine" est une photo instantanée du nombre de fourmis
// PHYSIQUEMENT présentes dans la chambre la moins chargée de ce type — pas
// une prévision de charge future, volontairement simple et déterministe.
export class NestConstructionSystem {
  evaluate(colony, interior, config, randomFn) {
    if (interior.pendingSites.size >= config.nestMaxConcurrentSites) return null;
    if (colony.foodStock < config.nestBuildFoodCost) return null;
    const typesAlreadyPending = new Set([...interior.pendingSites.values()].map((site) => site.type));

    for (const type of CONSTRUCTIBLE_TYPES) {
      if (type === NestChamberType.BROOD && colony.brood.length === 0) continue;
      if (typesAlreadyPending.has(type)) continue;
      const chambers = interior.getChambersByType(type);
      const leastLoaded = chambers.reduce((min, chamber) => (
        chamber.occupants.size < min.occupants.size ? chamber : min
      ), chambers[0]);
      if (leastLoaded.occupants.size < config.nestChamberCapacity) continue;
      return this.openSite(interior, type, leastLoaded, config, randomFn);
    }
    return null;
  }

  openSite(interior, type, anchor, config, randomFn) {
    const angle = randomFn() * Math.PI * 2;
    const position = {
      x: anchor.position.x + Math.cos(angle) * config.nestChamberSpacing,
      y: anchor.position.y + Math.sin(angle) * config.nestChamberSpacing,
    };
    const site = {
      id: `SITE-${interior.nextSiteId}`,
      type,
      position,
      anchorId: anchor.id,
      progress: 0,
      requiredProgress: config.nestBuildTicks,
      exitAngle: type === NestChamberType.ENTRANCE ? angle : null,
    };
    interior.nextSiteId += 1;
    interior.pendingSites.set(site.id, site);
    return site;
  }
}
