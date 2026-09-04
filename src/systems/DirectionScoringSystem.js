import { PheromoneType } from "../simulation/PheromoneField.js";

function angleDifference(first, second) {
  return Math.atan2(Math.sin(first - second), Math.cos(first - second));
}

export class DirectionScoringSystem {
  constructor(random = Math.random) {
    this.random = random;
  }

  suggestDirection(ant, field, options) {
    const candidates = [];
    let hasSignal = false;
    let maximumAlarmRepulsion = 0;
    for (let index = 0; index < options.samples; index += 1) {
      const progress = options.samples === 1 ? 0.5 : index / (options.samples - 1);
      const direction = ant.direction - options.arc / 2 + progress * options.arc;
      const position = {
        x: ant.position.x + Math.cos(direction) * options.distance,
        y: ant.position.y + Math.sin(direction) * options.distance,
      };
      const food = field.sample(PheromoneType.FOOD, position) / field.maxIntensity;
      const home = field.sample(PheromoneType.HOME, position) / field.maxIntensity;
      const alarm = field.sample(PheromoneType.ALARM, position) / field.maxIntensity;
      if ((options.foodWeight > 0 && food >= options.minimumSignal)
        || (options.homeWeight > 0 && home >= options.minimumSignal)
        || (options.alarmWeight > 0 && alarm >= options.minimumAlarmSignal)) hasSignal = true;
      const recentlyVisited = ant.recentCells.includes(field.indexAt(position));
      const revisitFactor = recentlyVisited ? options.revisitPenalty : 1;
      const attraction = (food * options.foodWeight + home * options.homeWeight) * revisitFactor;
      const repulsion = alarm * options.alarmWeight;
      maximumAlarmRepulsion = Math.max(maximumAlarmRepulsion, repulsion);
      const inertia = Math.cos(angleDifference(direction, ant.direction)) * options.inertiaWeight;
      candidates.push({ direction, attraction, repulsion, inertia });
    }
    if (!hasSignal) return null;

    let best = null;
    for (const candidate of candidates) {
      const noise = (this.random() * 2 - 1) * options.noiseWeight;
      const score = candidate.attraction - candidate.repulsion + candidate.inertia + noise;
      if (!best || score > best.score) best = { ...candidate, score };
    }
    return {
      direction: best.direction,
      score: best.score,
      alarm: maximumAlarmRepulsion,
      influence: Math.min(0.95, options.baseInfluence + maximumAlarmRepulsion),
    };
  }
}
