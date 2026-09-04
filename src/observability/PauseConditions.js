export function evaluatePauseConditions(events, metrics, conditions) {
  const eventTypes = new Set(events.map((event) => event.type));
  if (conditions.death
    && (eventTypes.has("WORKER_DIED") || eventTypes.has("ENVIRONMENTAL_DEATH"))) {
    return "mort d’une ouvrière";
  }
  if (conditions.depletion && eventTypes.has("FOOD_SOURCE_DEPLETED")) return "source épuisée";
  if (conditions.season && eventTypes.has("SEASON_CHANGED")) return "changement de saison";
  if (conditions.extinction && metrics.livingAnts === 0 && metrics.broodSize === 0) {
    return "colonie éteinte";
  }
  if (Number.isFinite(conditions.population)
    && conditions.population > 0
    && metrics.totalPopulation >= conditions.population) {
    return `population ≥ ${conditions.population}`;
  }
  if (conditions.stock !== null
    && Number.isFinite(conditions.stock)
    && metrics.foodStock <= conditions.stock) {
    return `stock ≤ ${conditions.stock}`;
  }
  return null;
}
