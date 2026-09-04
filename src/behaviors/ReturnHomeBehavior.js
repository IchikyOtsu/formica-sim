function blendDirections(current, suggested, influence) {
  const x = Math.cos(current) * (1 - influence) + Math.cos(suggested) * influence;
  const y = Math.sin(current) * (1 - influence) + Math.sin(suggested) * influence;
  return Math.atan2(y, x);
}

export class ReturnHomeBehavior {
  constructor(randomWalk, trailInfluence = 0.72) {
    this.randomWalk = randomWalk;
    this.trailInfluence = trailInfluence;
  }

  update(ant, navigationSuggestion, locallyDetectedHome, deltaSeconds) {
    this.randomWalk.update(ant, deltaSeconds);
    if (locallyDetectedHome) {
      ant.direction = blendDirections(ant.direction, locallyDetectedHome.direction, 0.94);
      return locallyDetectedHome.distance;
    }
    if (navigationSuggestion) {
      ant.direction = blendDirections(
        ant.direction,
        navigationSuggestion.direction,
        navigationSuggestion.influence ?? this.trailInfluence,
      );
    }
    return Infinity;
  }
}
