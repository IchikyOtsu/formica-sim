export class SearchFoodBehavior {
  constructor(randomWalk, pheromoneInfluence = 0.6) {
    this.randomWalk = randomWalk;
    this.pheromoneInfluence = pheromoneInfluence;
  }

  update(ant, detectedFood, navigationSuggestion, deltaSeconds) {
    if (detectedFood?.active) ant.target = detectedFood;
    if (ant.target && !ant.target.active) ant.target = null;

    if (!ant.target) {
      this.randomWalk.update(ant, deltaSeconds);
      if (navigationSuggestion) {
        const influence = navigationSuggestion.influence ?? this.pheromoneInfluence;
        const currentWeight = 1 - influence;
        const x = Math.cos(ant.direction) * currentWeight
          + Math.cos(navigationSuggestion.direction) * influence;
        const y = Math.sin(ant.direction) * currentWeight
          + Math.sin(navigationSuggestion.direction) * influence;
        ant.direction = Math.atan2(y, x);
      }
      return Infinity;
    }

    const dx = ant.target.position.x - ant.position.x;
    const dy = ant.target.position.y - ant.position.y;
    ant.direction = Math.atan2(dy, dx);
    if (navigationSuggestion?.alarm > 0) {
      ant.direction = Math.atan2(
        Math.sin(ant.direction) * (1 - navigationSuggestion.influence)
          + Math.sin(navigationSuggestion.direction) * navigationSuggestion.influence,
        Math.cos(ant.direction) * (1 - navigationSuggestion.influence)
          + Math.cos(navigationSuggestion.direction) * navigationSuggestion.influence,
      );
    }
    return Math.hypot(dx, dy);
  }
}
