export const AntState = Object.freeze({
  IDLE: "IDLE",
  EXPLORING: "EXPLORING",
  SEARCHING_FOOD: "SEARCHING_FOOD",
  RETURNING_HOME: "RETURNING_HOME",
  RESTING: "RESTING",
  RAIDING: "RAIDING",
  DEAD: "DEAD",
});

export const ReturnReason = Object.freeze({
  FOOD: "FOOD",
  ENERGY: "ENERGY",
});

export const Caste = Object.freeze({
  WORKER: "WORKER",
  SOLDIER: "SOLDIER",
});

export class Ant {
  constructor({
    id,
    position,
    direction,
    speed,
    colonyId,
    energy = 100,
    maxEnergy = 100,
    energyConsumptionRate = 0,
    lowEnergyThreshold = 0.4,
    health,
    maxHealth = 60,
    attackPower = 0,
    combatCooldown = 0,
    caste = Caste.WORKER,
  }) {
    this.id = id;
    this.position = { ...position };
    this.direction = direction;
    this.speed = speed;
    this.state = AntState.SEARCHING_FOOD;
    this.colonyId = colonyId;
    this.energy = energy;
    this.maxEnergy = maxEnergy;
    this.energyConsumptionRate = energyConsumptionRate;
    this.lowEnergyThreshold = lowEnergyThreshold;
    this.maxHealth = maxHealth;
    this.health = health ?? maxHealth;
    this.attackPower = attackPower;
    this.combatCooldown = combatCooldown;
    this.caste = caste;
    this.carryingFood = false;
    this.carryingFoodAmount = 0;
    this.age = 0;
    this.target = null;
    this.distanceSinceNest = 0;
    this.recentCells = [];
    this.returnStartedTick = null;
    this.returnReason = null;
    this.returnDistance = 0;
    this.directReturnDistance = 0;
    this.nearbyForeignAnts = [];
    this.lastDiscoveredSourceId = null;
    this.pendingNestIntel = null;
    this.raidId = null;
  }
}
