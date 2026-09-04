import { SEASON_PROFILES, STABLE_PROFILE } from "../environment/EnvironmentConfig.js";
import { SEASON_ORDER } from "../environment/Season.js";

export class EnvironmentSystem {
  getState(tick, config) {
    if (!config.environmentEnabled) {
      return { season: "STABLE", seasonIndex: 0, cycle: 0, ...STABLE_PROFILE };
    }
    const seasonDuration = Math.max(1, config.seasonDurationTicks);
    const absoluteSeason = Math.floor(tick / seasonDuration);
    const seasonIndex = absoluteSeason % SEASON_ORDER.length;
    const season = SEASON_ORDER[seasonIndex];
    const base = SEASON_PROFILES[season];
    const severity = config.environmentSeverity;
    const amplifyCost = (value) => 1 + (value - 1) * severity;
    const reduceResource = (value) => value >= 1 ? value : Math.max(0, 1 - (1 - value) * severity);
    return {
      ...base,
      season,
      seasonIndex,
      cycle: Math.floor(absoluteSeason / SEASON_ORDER.length),
      foodRegenerationMultiplier: reduceResource(base.foodRegenerationMultiplier),
      metabolismMultiplier: amplifyCost(base.metabolismMultiplier),
      movementCostMultiplier: amplifyCost(base.movementCostMultiplier),
      broodDevelopmentMultiplier: reduceResource(base.broodDevelopmentMultiplier),
      hazardMultiplier: amplifyCost(base.hazardMultiplier),
      pressure: Math.min(2, base.pressure * severity),
    };
  }
}
