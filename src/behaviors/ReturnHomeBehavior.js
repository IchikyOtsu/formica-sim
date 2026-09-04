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

  update(ant, homeTrail, locallyDetectedHome, deltaSeconds) {
    this.randomWalk.update(ant, deltaSeconds);
    if (locallyDetectedHome) {
      ant.direction = blendDirections(ant.direction, locallyDetectedHome.direction, 0.94);
      return locallyDetectedHome.distance;
    }
    if (homeTrail) {
      ant.direction = blendDirections(ant.direction, homeTrail.direction, this.trailInfluence);
    }
    return Infinity;
  }
}
