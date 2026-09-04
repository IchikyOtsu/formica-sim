export const AntState = Object.freeze({
  IDLE: "IDLE",
  EXPLORING: "EXPLORING",
  SEARCHING_FOOD: "SEARCHING_FOOD",
  RETURNING_HOME: "RETURNING_HOME",
});

export class Ant {
  constructor({ id, position, direction, speed, colonyId, energy = 100 }) {
    this.id = id;
    this.position = { ...position };
    this.direction = direction;
    this.speed = speed;
    this.state = AntState.SEARCHING_FOOD;
    this.colonyId = colonyId;
    this.energy = energy;
    this.carryingFood = false;
    this.age = 0;
    this.target = null;
    this.distanceSinceNest = 0;
    this.recentCells = [];
    this.returnStartedTick = null;
  }
}
