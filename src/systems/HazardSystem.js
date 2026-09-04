import { AntState } from "../entities/Ant.js";

export class HazardSystem {
  movementMultiplier(position, dangerZones) {
    return dangerZones.reduce(
      (multiplier, zone) => zone.contains(position)
        ? Math.max(multiplier, zone.energyMultiplier)
        : multiplier,
      1,
    );
  }

  applyMortality(ant, dangerZones, probabilityMultiplier, random) {
    if (ant.state === AntState.DEAD) return false;
    for (const zone of dangerZones) {
      if (!zone.contains(ant.position)) continue;
      if (random() < zone.mortalityProbability * probabilityMultiplier) {
        ant.energy = 0;
        ant.state = AntState.DEAD;
        ant.target = null;
        ant.returnReason = null;
        return true;
      }
    }
    return false;
  }
}
