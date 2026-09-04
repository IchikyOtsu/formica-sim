export class HomeDetectionSystem {
  distanceToHome(ant, nest) {
    return Math.hypot(
      nest.position.x - ant.position.x,
      nest.position.y - ant.position.y,
    );
  }

  isInside(ant, nest) {
    return this.distanceToHome(ant, nest) <= nest.radius;
  }

  suggestDirection(ant, nest, detectionRadius) {
    const dx = nest.position.x - ant.position.x;
    const dy = nest.position.y - ant.position.y;
    const distance = this.distanceToHome(ant, nest);
    if (distance > detectionRadius + nest.radius) return null;
    return { direction: Math.atan2(dy, dx), distance };
  }
}
