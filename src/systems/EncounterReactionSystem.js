export const EncounterReaction = Object.freeze({
  IGNORE: "IGNORE",
  AVOID: "AVOID",
});

export class EncounterReactionSystem {
  computeRisk(ant) {
    const energyRisk = 1 - ant.energy / ant.maxEnergy;
    const outnumbered = Math.min(1, ant.nearbyForeignAnts.length / 3);
    return Math.max(0, Math.min(1, energyRisk * 0.6 + outnumbered * 0.4));
  }

  evaluate(ant, threshold) {
    return this.computeRisk(ant) >= threshold
      ? EncounterReaction.AVOID
      : EncounterReaction.IGNORE;
  }
}
