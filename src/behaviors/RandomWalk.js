export class RandomWalk {
  constructor(random = Math.random, turnStrength = 1.15) {
    this.random = random;
    this.turnStrength = turnStrength;
  }

  update(ant, deltaSeconds) {
    const centeredRandom = this.random() * 2 - 1;
    ant.direction += centeredRandom * this.turnStrength * Math.sqrt(deltaSeconds);
  }
}
