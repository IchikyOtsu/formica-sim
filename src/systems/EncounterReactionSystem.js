export const EncounterReaction = Object.freeze({
  IGNORE: "IGNORE",
  AVOID: "AVOID",
  THREATEN: "THREATEN",
  ATTACK: "ATTACK",
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export class EncounterReactionSystem {
  computeRisk(ant) {
    const energyRisk = 1 - ant.energy / ant.maxEnergy;
    const outnumbered = Math.min(1, ant.nearbyForeignAnts.length / 3);
    return clamp(energyRisk * 0.6 + outnumbered * 0.4, 0, 1);
  }

  evaluate(ant, threshold) {
    return this.computeRisk(ant) >= threshold
      ? EncounterReaction.AVOID
      : EncounterReaction.IGNORE;
  }

  computeAggression(ant, {
    allyCount = 0,
    enemyCount = 0,
    territorialAdvantage = 0,
    numbersWeight = 0.25,
    territoryWeight = 0.15,
  } = {}) {
    const healthConfidence = ant.health / ant.maxHealth;
    const energyConfidence = ant.energy / ant.maxEnergy;
    const numbersAdvantage = clamp((allyCount - enemyCount) / 3, -1, 1);
    return clamp(
      healthConfidence * 0.35 + energyConfidence * 0.25 + numbersAdvantage * numbersWeight
        + clamp(territorialAdvantage, -1, 1) * territoryWeight,
      0,
      1,
    );
  }

  evaluateStance(ant, {
    allyCount = 0,
    enemyCount = 0,
    territorialAdvantage = 0,
    numbersWeight,
    territoryWeight,
    threatenThreshold,
    attackThreshold,
    fleeHealthRatio,
  }) {
    const healthRatio = ant.health / ant.maxHealth;
    const energyRatio = ant.energy / ant.maxEnergy;
    if (healthRatio < fleeHealthRatio || energyRatio < ant.lowEnergyThreshold) {
      return EncounterReaction.AVOID;
    }
    const aggression = this.computeAggression(ant, {
      allyCount, enemyCount, territorialAdvantage, numbersWeight, territoryWeight,
    });
    if (ant.combatCooldown > 0) {
      return aggression >= threatenThreshold ? EncounterReaction.THREATEN : EncounterReaction.IGNORE;
    }
    if (aggression >= attackThreshold) return EncounterReaction.ATTACK;
    if (aggression >= threatenThreshold) return EncounterReaction.THREATEN;
    return EncounterReaction.IGNORE;
  }
}
