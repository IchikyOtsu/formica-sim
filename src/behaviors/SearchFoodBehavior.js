export class SearchFoodBehavior {
  constructor(randomWalk) {
    this.randomWalk = randomWalk;
  }

  update(ant, detectedFood, deltaSeconds) {
    if (detectedFood?.active) ant.target = detectedFood;
    if (ant.target && !ant.target.active) ant.target = null;

    if (!ant.target) {
      this.randomWalk.update(ant, deltaSeconds);
      return;
    }

    const dx = ant.target.position.x - ant.position.x;
    const dy = ant.target.position.y - ant.position.y;
    ant.direction = Math.atan2(dy, dx);
  }
}
