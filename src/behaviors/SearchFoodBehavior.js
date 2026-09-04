export class SearchFoodBehavior {
  constructor(randomWalk, pheromoneInfluence = 0.6) {
    this.randomWalk = randomWalk;
    this.pheromoneInfluence = pheromoneInfluence;
  }

  update(ant, detectedFood, suggestedTrail, deltaSeconds) {
    if (detectedFood?.active) ant.target = detectedFood;
    if (ant.target && !ant.target.active) ant.target = null;

    if (!ant.target) {
      this.randomWalk.update(ant, deltaSeconds);
      if (suggestedTrail) {
        const currentWeight = 1 - this.pheromoneInfluence;
        const x = Math.cos(ant.direction) * currentWeight
          + Math.cos(suggestedTrail.direction) * this.pheromoneInfluence;
        const y = Math.sin(ant.direction) * currentWeight
          + Math.sin(suggestedTrail.direction) * this.pheromoneInfluence;
        ant.direction = Math.atan2(y, x);
      }
      return Infinity;
    }

    const dx = ant.target.position.x - ant.position.x;
    const dy = ant.target.position.y - ant.position.y;
    ant.direction = Math.atan2(dy, dx);
    return Math.hypot(dx, dy);
  }
}
