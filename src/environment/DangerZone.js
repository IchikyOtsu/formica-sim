export class DangerZone {
  constructor({ id, x, y, radius, energyMultiplier = 2, mortalityProbability = 0 }) {
    this.id = id;
    this.position = { x, y };
    this.radius = radius;
    this.energyMultiplier = energyMultiplier;
    this.mortalityProbability = mortalityProbability;
  }

  contains(position) {
    return Math.hypot(
      position.x - this.position.x,
      position.y - this.position.y,
    ) <= this.radius;
  }
}
