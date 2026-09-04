export class Colony {
  constructor({ id, name = id, nest, color = "#f0b45f", initialFoodStock = 0 }) {
    this.id = id;
    this.name = name;
    this.nest = nest;
    this.color = color;
    this.resources = 0;
    this.foodStock = initialFoodStock;
    this.consumedFood = 0;
    this.ants = [];
    this.queen = null;
    this.brood = [];
    this.births = 0;
    this.starvationDeaths = 0;
    this.environmentalDeaths = 0;
    this.lostFood = 0;
    this.totalDistance = 0;
    this.totalPickups = 0;
    this.foreignContacts = 0;
    this.avoidedContacts = 0;
    this.fights = 0;
    this.attacks = 0;
    this.kills = 0;
    this.combatLosses = 0;
    this.threats = 0;
    this.damageDealt = 0;
    this.workerKills = 0;
    this.soldierKills = 0;
    this.workerLosses = 0;
    this.soldierLosses = 0;
    this.soldierBirths = 0;
    this.threatPressure = 0;
    this.maxPopulation = 1;
    this.knownEnemyNests = new Map();
    this.enemyNestsDiscovered = 0;
    this.raidsStarted = 0;
    this.raidsCompleted = 0;
    this.raidsFailed = 0;
    this.raidersSent = 0;
    this.raidersLost = 0;
    this.nestUnderThreat = false;
    this.nestThreatGraceRemaining = 0;
    this.raidersDetectedNearNest = 0;
    this.defenseActivations = 0;
    this.defendersMobilized = 0;
    this.defensiveKills = 0;
    this.workersEvacuated = 0;
    this.foodStolen = 0;
    this.foodRecovered = 0;
    this.foodDropped = 0;
    this.foodLostToRaids = 0;
    this.raidersReturnedWithLoot = 0;
    this.raidersKilledWithLoot = 0;
    this.nextRaidEligibleTick = 0;
    this.broodFoodBuffer = 0;
    this.broodFoodDelivered = 0;
    this.chambersBuilt = 0;
    this.nestBreaches = 0;
  }

  depositFood(amount) {
    if (amount <= 0) return 0;
    this.resources += amount;
    this.foodStock += amount;
    return amount;
  }

  consumeFood(amount) {
    if (amount <= 0 || this.foodStock <= 0) return 0;
    const consumed = Math.min(amount, this.foodStock);
    this.foodStock -= consumed;
    this.consumedFood += consumed;
    return consumed;
  }

  takeStock(amount) {
    if (amount <= 0 || this.foodStock <= 0) return 0;
    const taken = Math.min(amount, this.foodStock);
    this.foodStock -= taken;
    return taken;
  }
}
