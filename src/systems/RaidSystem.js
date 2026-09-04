import { AntState, Caste } from "../entities/Ant.js";
import { Raid } from "../entities/Raid.js";

export class RaidSystem {
  constructor() {
    this.nextRaidId = 1;
  }

  availableRaiders(colony, groupSize) {
    return colony.ants
      .filter((ant) => (
        ant.state !== AntState.DEAD
        && ant.locationType !== "NEST"
        && ant.caste === Caste.SOLDIER
        && ant.raidId === null
      ))
      .slice(0, groupSize);
  }

  createRaid(colony, targetColonyId, groupSize, tick) {
    if (!colony.knownEnemyNests.has(targetColonyId)) return null;
    const raiders = this.availableRaiders(colony, groupSize);
    if (raiders.length === 0) return null;
    const raid = new Raid({
      id: `raid-${colony.id}-${this.nextRaidId}`,
      sourceColonyId: colony.id,
      targetColonyId,
      memberIds: raiders.map((ant) => ant.id),
      createdTick: tick,
    });
    this.nextRaidId += 1;
    for (const ant of raiders) {
      ant.raidId = raid.id;
      ant.state = AntState.RAIDING;
      ant.target = null;
    }
    return raid;
  }
}
