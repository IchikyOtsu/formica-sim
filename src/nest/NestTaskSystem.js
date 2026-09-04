import { NestTask } from "./NestTask.js";
import { Caste } from "../entities/Ant.js";

// Décide QUOI faire ensuite pour une fourmi intérieure — jamais OÙ aller
// (NestNavigationSystem) ni ce qui se passe à l'arrivée (Simulation). Priorité
// fixe : décharger sa charge > se soigner > nourrir le couvain > soigner le
// couvain > sortir. Purement fonction de l'état courant, donc déterministe et
// testable isolément.
export class NestTaskSystem {
  decide(ant, colony, colonyConfig, { needsFood, broodDemand, activeCaregivers }) {
    if (ant.carryingFood || ant.raidCargo > 0) return NestTask.GO_TO_STORAGE;
    if (needsFood) return NestTask.GO_TO_REST;

    if (ant.caste !== Caste.SOLDIER && colony.brood.length > 0) {
      const caregiverCap = Math.max(1, Math.ceil(colony.brood.length * colonyConfig.nestCaregiverRatio));
      if (activeCaregivers < caregiverCap) {
        if (broodDemand.hungryLarvae > 0 && colony.foodStock >= colonyConfig.nestBroodFeedStockThreshold) {
          return NestTask.FEED_BROOD;
        }
        return NestTask.TEND_BROOD;
      }
    }

    return NestTask.EXIT_NEST;
  }
}
