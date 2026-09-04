import { TimeSeries } from "./TimeSeries.js";

export const RECORDED_METRICS = Object.freeze([
  "tick",
  "population",
  "foodStock",
  "foodCollected",
  "foodConsumed",
  "broodCount",
  "births",
  "deaths",
  "environmentDeaths",
  "averageEnergy",
  "foodPheromoneIntensity",
  "homePheromoneIntensity",
  "alarmPheromoneIntensity",
  "territoryPheromoneIntensity",
  "hazardExposures",
  "foreignContacts",
  "avoidedContacts",
  "threats",
  "fights",
  "attacks",
  "damageDealt",
  "combatDeaths",
  "contestedArea",
  "colonies",
]);

export class MetricsRecorder {
  constructor({ sampleInterval = 50, maxSamples = 10_000 } = {}) {
    this.sampleInterval = Number.isFinite(sampleInterval)
      ? Math.max(1, Math.floor(sampleInterval))
      : 50;
    this.series = new TimeSeries({ maxSamples });
  }

  record(simulation, { force = false } = {}) {
    if (!force && simulation.tickCount % this.sampleInterval !== 0) return null;
    const metrics = simulation.getMetrics();
    return this.series.append({
      tick: metrics.tick,
      population: metrics.livingAnts,
      foodStock: metrics.foodStock,
      foodCollected: metrics.resources,
      foodConsumed: metrics.consumedFood,
      broodCount: metrics.broodSize,
      births: metrics.births,
      deaths: metrics.deaths,
      environmentDeaths: metrics.environmentalDeaths,
      averageEnergy: metrics.averageEnergy,
      foodPheromoneIntensity: metrics.foodPheromones.total,
      homePheromoneIntensity: metrics.homePheromones.total,
      alarmPheromoneIntensity: metrics.alarmPheromones.total,
      territoryPheromoneIntensity: metrics.territoryPheromones.total,
      hazardExposures: metrics.dangerExposures,
      foreignContacts: metrics.foreignContacts,
      avoidedContacts: metrics.avoidedContacts,
      threats: metrics.threats,
      fights: metrics.fights,
      attacks: metrics.attacks,
      damageDealt: metrics.damageDealt,
      combatDeaths: metrics.combatDeaths,
      contestedArea: metrics.contestedArea,
      colonies: metrics.colonies.map((colony) => ({
        id: colony.id,
        population: colony.totalPopulation,
        foodStock: colony.foodStock,
        foodCollected: colony.resources,
        territoryCells: colony.territoryCells,
        foreignContacts: colony.foreignContacts,
        avoidedContacts: colony.avoidedContacts,
        fights: colony.fights,
        attacks: colony.attacks,
        kills: colony.kills,
        combatLosses: colony.combatLosses,
      })),
    });
  }

  clear() {
    this.series.clear();
  }
}
