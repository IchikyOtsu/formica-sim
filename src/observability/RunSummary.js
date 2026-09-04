export function createRunSummary(simulation) {
  const metrics = simulation.getMetrics();
  return {
    duration: metrics.tick,
    finalPopulation: metrics.livingAnts,
    maxPopulation: metrics.maxPopulation,
    foodStock: metrics.foodStock,
    foodCollected: metrics.resources,
    foodConsumed: metrics.consumedFood,
    births: metrics.births,
    deaths: metrics.deaths,
    starvationDeaths: metrics.starvationDeaths,
    environmentalDeaths: metrics.environmentalDeaths,
    dangerExposures: metrics.dangerExposures,
    dangerDistance: metrics.dangerDistance,
    averageEnergy: metrics.averageEnergy,
    seasonCyclesCompleted: metrics.seasonCyclesCompleted,
    extinct: metrics.livingAnts === 0 && metrics.broodSize === 0,
  };
}
