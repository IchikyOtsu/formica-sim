import { BroodStage } from "../entities/Brood.js";

// Expose le besoin du couvain en nourriture, tel que constaté au tick
// précédent (BroodSystem marque une larve `starved` quand elle n'a pas pu
// consommer tout ce dont elle avait besoin). Ne modifie jamais l'état —
// une simple lecture consommée par NestTaskSystem.
export class BroodDemandSystem {
  evaluate(colony, config) {
    const hungryLarvae = colony.brood.filter(
      (brood) => brood.stage === BroodStage.LARVA && brood.starved,
    ).length;
    return {
      hungryLarvae,
      foodDemand: hungryLarvae * config.larvaFoodPerTick,
    };
  }
}
