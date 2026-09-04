import { AntState, Caste } from "../entities/Ant.js";

// Décide QUAND lancer un raid automatique ; RaidSystem reste responsable du
// COMMENT (assemblage, trajet, combat, retour). Entièrement déterministe :
// aucun hasard, seulement l'état déjà présent dans le moteur (stock, nids
// connus, soldats disponibles, cooldown) — seed identique => mêmes raids.
export class RaidDecisionSystem {
  decide(colony, colonyConfig, tick, activeRaidTargets) {
    if (!colonyConfig.autoRaidEnabled) return null;
    if (tick % colonyConfig.raidEvaluationIntervalTicks !== 0) return null;
    if (colony.foodStock < colonyConfig.minStockToRaid) return null;
    if (tick < (colony.nextRaidEligibleTick ?? 0)) return null;

    let target = null;
    for (const [targetColonyId, intel] of colony.knownEnemyNests) {
      if (activeRaidTargets.has(targetColonyId)) continue;
      if (!target || intel.discoveredTick < target.discoveredTick) {
        target = { targetColonyId, discoveredTick: intel.discoveredTick };
      }
    }
    if (!target) return null;

    const availableSoldiers = colony.ants.filter((ant) => (
      ant.state === AntState.SEARCHING_FOOD && ant.caste === Caste.SOLDIER && ant.raidId === null
    )).length;
    if (availableSoldiers < colonyConfig.minRaidSize) return null;

    return {
      targetColonyId: target.targetColonyId,
      groupSize: Math.min(colonyConfig.maxRaidSize, availableSoldiers),
    };
  }
}
