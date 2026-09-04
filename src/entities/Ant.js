export const AntState = Object.freeze({
  IDLE: "IDLE",
  EXPLORING: "EXPLORING",
  SEARCHING_FOOD: "SEARCHING_FOOD",
  RETURNING_HOME: "RETURNING_HOME",
  RESTING: "RESTING",
  RAIDING: "RAIDING",
  DEFENDING: "DEFENDING",
  IN_NEST: "IN_NEST",
  RAIDING_INSIDE: "RAIDING_INSIDE",
  DEFENDING_INSIDE: "DEFENDING_INSIDE",
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
    raidCarryCapacity = 0,
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
    this.raidCarryCapacity = raidCarryCapacity;
    this.raidCargo = 0;
    this.locationType = "WORLD";
    this.nestId = null;
    this.nestPosition = null;
    this.nestChamberId = null;
    this.nestTask = "NONE";
    this.nestTransitionCooldown = 0;
    this.internalFoodCargo = 0;
    this.nestTendTicksRemaining = 0;
    this.nestPath = null;
    this.nestPathIndex = 0;
    this.nestTargetChamberId = null;
    this.nestBuildSiteId = null;
  }
}
