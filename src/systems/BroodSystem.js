import { Brood, BroodStage } from "../entities/Brood.js";
import { AntState, Caste } from "../entities/Ant.js";

export class BroodSystem {
  constructor() {
    this.nextBroodId = 1;
    this.broodFoodConsumed = 0;
    this.layingFoodConsumed = 0;
    this.militaryFoodConsumed = 0;
  }

  decideCaste(colony, config) {
    if (!config.castesEnabled) return Caste.WORKER;
    const livingAnts = colony.ants.filter((ant) => ant.state !== AntState.DEAD);
    const soldierCount = livingAnts.filter((ant) => ant.caste === Caste.SOLDIER).length;
    const currentRatio = livingAnts.length === 0 ? 0 : soldierCount / livingAnts.length;
    const desiredRatio = Math.min(
      config.casteSoldierRatioCap,
      Math.max(0, colony.threatPressure / config.threatPressureRatioScale),
    );
    const wantsSoldier = colony.foodStock >= config.casteStockThreshold && currentRatio < desiredRatio;
    return wantsSoldier ? Caste.SOLDIER : Caste.WORKER;
  }

  update(colony, config, developmentMultiplier = 1) {
    if (!config.reproductionEnabled) return [];
    const emerged = [];
    for (const brood of colony.brood) {
      brood.age += 1;
      if (brood.stage === BroodStage.EGG) {
        this.advanceFreeStage(brood, config.eggDurationTicks, BroodStage.LARVA, developmentMultiplier);
      } else if (brood.stage === BroodStage.LARVA) {
        const isSoldier = brood.caste === Caste.SOLDIER;
        const needed = config.larvaFoodPerTick * (isSoldier ? config.soldierLarvaFoodMultiplier : 1);
        const consumed = colony.consumeFood(needed);
        brood.foodConsumed += consumed;
        this.broodFoodConsumed += consumed;
        if (isSoldier) this.militaryFoodConsumed += consumed;
        if (consumed + Number.EPSILON >= needed) {
          this.advanceFreeStage(
            brood,
            config.larvaDurationTicks,
            BroodStage.PUPA,
            developmentMultiplier,
          );
        }
      } else if (brood.stage === BroodStage.PUPA) {
        brood.stageAge += developmentMultiplier;
        brood.developmentProgress = Math.min(1, brood.stageAge / config.pupaDurationTicks);
        if (brood.stageAge >= config.pupaDurationTicks) emerged.push(brood);
      }
    }
    if (emerged.length > 0) {
      const emergedIds = new Set(emerged.map((brood) => brood.id));
      colony.brood = colony.brood.filter((brood) => !emergedIds.has(brood.id));
    }

    const queen = colony.queen;
    const livingWorkers = colony.ants.filter((ant) => ant.state !== AntState.DEAD).length;
    queen.cooldownRemaining = Math.max(0, queen.cooldownRemaining - 1);
    if (queen.cooldownRemaining === 0
      && colony.brood.length < config.maxBrood
      && livingWorkers + colony.brood.length < (config.maxWorkers ?? Infinity)
      && colony.foodStock >= config.reproductionFoodThreshold) {
      const caste = this.decideCaste(colony, config);
      const isSoldier = caste === Caste.SOLDIER;
      const eggCost = config.eggFoodCost * (isSoldier ? config.soldierEggFoodMultiplier : 1);
      if (colony.foodStock >= eggCost) {
        const consumed = colony.consumeFood(eggCost);
        if (consumed === eggCost) {
          colony.brood.push(new Brood({ id: `BROOD-${this.nextBroodId}`, caste }));
          this.nextBroodId += 1;
          queen.eggsLaid += 1;
          queen.cooldownRemaining = queen.layingCooldownTicks;
          this.layingFoodConsumed += consumed;
          if (isSoldier) this.militaryFoodConsumed += consumed;
        }
      }
    }
    return emerged;
  }

  advanceFreeStage(brood, duration, nextStage, developmentMultiplier = 1) {
    brood.stageAge += developmentMultiplier;
    brood.developmentProgress = Math.min(1, brood.stageAge / duration);
    if (brood.stageAge < duration) return;
    brood.stage = nextStage;
    brood.stageAge = 0;
    brood.developmentProgress = 0;
  }

  get totalFoodCost() {
    return this.broodFoodConsumed + this.layingFoodConsumed;
  }
}
