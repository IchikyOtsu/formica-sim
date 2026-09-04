// Profils de combat figés — V1.2 "Balanced Combat" (calibrés par la grille
// courte puis validés sur 20 seeds × 20 000 ticks, voir docs/combat.md).
// Mêmes statistiques brutes (health, attackPower) pour les trois profils :
// seule la décision (seuils IGNORE/AVOID/THREATEN/ATTACK, poids contextuels,
// coût/cooldown d'attaque) diffère, pour que l'écart mesuré vienne de la
// stratégie et non des chiffres bruts.
export const COMBAT_PROFILES = Object.freeze({
  pacifist: {
    label: "Pacifique",
    overrides: Object.freeze({
      encounterAvoidanceThreshold: 0.15,
      combatThreatenThreshold: 0.55,
      combatAttackThreshold: 1,
      combatFleeHealthRatio: 0.5,
    }),
  },
  defensive: {
    label: "Défensif",
    overrides: Object.freeze({
      encounterAvoidanceThreshold: 0.3,
      combatThreatenThreshold: 0.35,
      combatAttackThreshold: 0.55,
      combatFleeHealthRatio: 0.35,
      // Bonus contextuel (alliés proches, territoire) et cooldown raccourci :
      // le défensif combat mieux en position favorable sans stat brute en plus.
      combatNumbersAdvantageWeight: 0.45,
      combatTerritorialAdvantageWeight: 0.45,
      combatAttackCooldownTicks: 4,
    }),
  },
  aggressive: {
    label: "Agressif",
    overrides: Object.freeze({
      encounterAvoidanceThreshold: 0.75,
      combatThreatenThreshold: 0.15,
      combatAttackThreshold: 0.25,
      // Attaquer coûte plus cher (énergie + cooldown) et l'acharnement à
      // faible santé est un peu plus limité.
      combatFleeHealthRatio: 0.22,
      combatAttackEnergyCost: 10,
      combatAttackCooldownTicks: 8,
    }),
  },
});

export function combatProfileOverrides(id) {
  const profile = COMBAT_PROFILES[id];
  if (!profile) throw new Error(`Unknown combat profile: ${id}`);
  return profile.overrides;
}
