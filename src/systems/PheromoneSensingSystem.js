export class PheromoneSensingSystem {
  constructor(random = Math.random) {
    this.random = random;
  }

  suggestDirection(ant, field, options) {
    const {
      distance,
      arc,
      samples,
      minimumSignal,
    } = options;
    const candidates = [];
    let totalWeight = 0;

    for (let index = 0; index < samples; index += 1) {
      const progress = samples === 1 ? 0.5 : index / (samples - 1);
      const direction = ant.direction - arc / 2 + progress * arc;
      const position = {
        x: ant.position.x + Math.cos(direction) * distance,
        y: ant.position.y + Math.sin(direction) * distance,
      };
      const strength = field.sample(position);
      if (strength < minimumSignal) continue;
      const weight = strength * strength;
      totalWeight += weight;
      candidates.push({ direction, strength, weight });
    }

    if (candidates.length === 0) return null;
    let choice = this.random() * totalWeight;
    for (const candidate of candidates) {
      choice -= candidate.weight;
      if (choice <= 0) return candidate;
    }
    return candidates.at(-1);
  }
}
