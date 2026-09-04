import { RandomWalk } from "../behaviors/RandomWalk.js";
import { ReturnHomeBehavior } from "../behaviors/ReturnHomeBehavior.js";
import { SearchFoodBehavior } from "../behaviors/SearchFoodBehavior.js";
import { Ant, AntState, Caste } from "../entities/Ant.js";
import { Colony } from "../entities/Colony.js";
import { BroodStage } from "../entities/Brood.js";
import { FoodSource } from "../entities/FoodSource.js";
import { Nest } from "../entities/Nest.js";
import { Queen } from "../entities/Queen.js";
import { DangerZone } from "../environment/DangerZone.js";
import { SEASON_LABELS } from "../environment/Season.js";
import { AlarmDepositSystem } from "../systems/AlarmDepositSystem.js";
import { BroodSystem } from "../systems/BroodSystem.js";
import { DirectionScoringSystem } from "../systems/DirectionScoringSystem.js";
import { EnvironmentSystem } from "../systems/EnvironmentSystem.js";
import { MovementSystem } from "../systems/MovementSystem.js";
import { MetabolismSystem } from "../systems/MetabolismSystem.js";
import { FoodCollectionSystem } from "../systems/FoodCollectionSystem.js";
import { FoodDetectionSystem } from "../systems/FoodDetectionSystem.js";
import { FoodRegenerationSystem } from "../systems/FoodRegenerationSystem.js";
import { FoodSpawnSystem } from "../systems/FoodSpawnSystem.js";
import { HazardSystem } from "../systems/HazardSystem.js";
import { HomeDetectionSystem } from "../systems/HomeDetectionSystem.js";
import { PheromoneDepositSystem } from "../systems/PheromoneDepositSystem.js";
import { PheromoneSensingSystem } from "../systems/PheromoneSensingSystem.js";
import { ForeignAntDetectionSystem } from "../systems/ForeignAntDetectionSystem.js";
import { EncounterReactionSystem, EncounterReaction } from "../systems/EncounterReactionSystem.js";
import { RaidSystem } from "../systems/RaidSystem.js";
import { RaidState } from "../entities/Raid.js";
import { RaidDecisionSystem } from "../systems/RaidDecisionSystem.js";
import { NestInterior } from "../nest/NestInterior.js";
import { NestChamberType } from "../nest/NestChamber.js";
import { NestTask } from "../nest/NestTask.js";
import { NestNavigationSystem } from "../nest/NestNavigationSystem.js";
import { NestTransitionSystem } from "../nest/NestTransitionSystem.js";
import { NestTaskSystem } from "../nest/NestTaskSystem.js";
import { NestConstructionSystem } from "../nest/NestConstructionSystem.js";
import { BroodDemandSystem } from "../systems/BroodDemandSystem.js";
import { normalizeConfig, toVersionedConfig } from "../config/ConfigSchema.js";
import { DEFAULT_CONFIG } from "./SimulationConfig.js";
import { ColonyPheromoneFields } from "./ColonyPheromoneFields.js";
import { PheromoneType } from "./PheromoneField.js";
import { TerritoryMap } from "./TerritoryMap.js";
import { World } from "./World.js";

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function pairKey(first, second) {
  return first.id < second.id ? `${first.id}:${second.id}` : `${second.id}:${first.id}`;
}

function deterministicEventRoll(seed, tick, antId, zoneId) {
  const text = `${seed}:${tick}:${antId}:${zoneId}`;
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 2246822507);
  hash ^= hash >>> 13;
  return (hash >>> 0) / 4294967296;
}

export class Simulation {
  constructor(config = DEFAULT_CONFIG, seed) {
    this.config = normalizeConfig(config, seed);
    this.movement = new MovementSystem();
    this.foodDetection = new FoodDetectionSystem();
    this.foodCollection = new FoodCollectionSystem();
    this.pheromoneDeposit = new PheromoneDepositSystem();
    this.alarmDeposit = new AlarmDepositSystem();
    this.homeDetection = new HomeDetectionSystem();
    this.metabolism = new MetabolismSystem();
    this.foodRegeneration = new FoodRegenerationSystem();
    this.environment = new EnvironmentSystem();
    this.hazard = new HazardSystem();
    this.foreignAntDetection = new ForeignAntDetectionSystem();
    this.encounterReaction = new EncounterReactionSystem();
    this.raidSystem = new RaidSystem();
    this.raidDecisionSystem = new RaidDecisionSystem();
    this.nestNavigationSystem = new NestNavigationSystem();
    this.nestTransitionSystem = new NestTransitionSystem();
    this.nestTaskSystem = new NestTaskSystem();
    this.broodDemandSystem = new BroodDemandSystem();
    this.nestConstructionSystem = new NestConstructionSystem();
    this.reset();
  }

  reconfigure(config, seed) {
    this.config = normalizeConfig(config, seed);
    this.reset();
  }

  reset() {
    this.tickCount = 0;
    this.elapsedMs = 0;
    this.completionTick = null;
    this.random = seededRandom(this.config.seed);
    this.sensingRandom = seededRandom(this.config.seed ^ 0x9e3779b9);
    this.birthRandom = seededRandom(this.config.seed ^ 0x85ebca6b);
    this.environmentRandom = seededRandom(this.config.seed ^ 0xc2b2ae35);
    this.constructionRandom = seededRandom(this.config.seed ^ 0x2f6e9a17);
    this.intrusionRandom = seededRandom(this.config.seed ^ 0x6a09e667);
    this.randomWalk = new RandomWalk(this.random, this.config.explorationStrength);
    this.searchFood = new SearchFoodBehavior(this.randomWalk, this.config.pheromoneInfluence);
    this.returnHome = new ReturnHomeBehavior(this.randomWalk, this.config.homeTrailInfluence);
    this.pheromoneSensing = new PheromoneSensingSystem(this.sensingRandom);
    this.directionScoring = new DirectionScoringSystem(this.sensingRandom);
    this.foodSpawn = new FoodSpawnSystem(this.environmentRandom);
    this.world = new World(this.config.width, this.config.height);
    const colonyDefinitions = this.config.colonies?.length > 0
      ? this.config.colonies
      : [{
        id: "C-01",
        name: "Colonie C-01",
        color: "#f0b45f",
        nest: this.config.nest,
        initialAnts: this.config.initialAnts,
        initialFoodStock: this.config.initialFoodStock,
      }];
    this.colonyConfigs = new Map(colonyDefinitions.map((definition) => [
      definition.id,
      { ...this.config, ...definition, nest: definition.nest },
    ]));
    this.colonyPheromones = new ColonyPheromoneFields(
      colonyDefinitions.map(({ id }) => id),
      this.config.width,
      this.config.height,
      this.config.pheromoneCellSize,
      this.config.pheromoneMaxIntensity,
    );
    this.pheromoneFields = this.colonyPheromones.fields;
    this.colonies = colonyDefinitions.map((definition) => {
      const colonyConfig = this.colonyConfigs.get(definition.id);
      const nest = new Nest(definition.nest.x, definition.nest.y, definition.nest.radius);
      const colony = new Colony({
        id: definition.id,
        name: definition.name ?? definition.id,
        color: definition.color ?? "#f0b45f",
        nest,
        initialFoodStock: colonyConfig.initialFoodStock,
      });
      colony.queen = new Queen({
        id: `${definition.id}-QUEEN`,
        colonyId: definition.id,
        position: nest.position,
        layingCooldownTicks: colonyConfig.queenLayingCooldownTicks,
      });
      return colony;
    });
    this.colony = this.colonies[0];
    this.pheromoneField = this.colonyPheromones.get(this.colony.id);
    this.nestInteriors = new Map(this.colonies.map((colony) => [colony.id, new NestInterior()]));
    this.broodSystems = new Map(this.colonies.map((colony) => [colony.id, new BroodSystem()]));
    this.broodSystem = this.broodSystems.get(this.colony.id);
    this.territoryMap = new TerritoryMap(
      this.config.width,
      this.config.height,
      this.config.pheromoneCellSize,
    );
    const initialSourceConfigs = this.config.environmentEnabled
      ? this.config.foodSources.slice(0, this.config.maxActiveSources)
      : this.config.foodSources;
    this.foodSources = initialSourceConfigs.map((source, index) => new FoodSource({
      id: source.id ?? `FOOD-${index + 1}`,
      ...source,
    }));
    this.dangerZones = this.config.environmentEnabled
      ? (this.config.dangerZones ?? []).map((zone) => new DangerZone(zone))
      : [];
    this.currentEnvironment = this.environment.getState(0, this.config);
    this.initialFoodQuantity = this.foodSources.reduce((total, source) => total + source.quantity, 0);
    this.initialColonyFoodStock = this.colonies.reduce((total, colony) => total + colony.foodStock, 0);
    this.totalDistance = 0;
    this.totalPickups = 0;
    this.totalReturnTicks = 0;
    this.completedReturns = 0;
    this.totalDetourDistance = 0;
    this.dangerExposures = 0;
    this.dangerDistance = 0;
    this.damageAlarmDeposits = 0;
    this.deathAlarmDeposits = 0;
    this.exploredCells = new Set();
    this.lostFood = 0;
    this.regeneratedFood = 0;
    this.spawnedFood = 0;
    this.expiredFood = 0;
    this.removedColonyFood = 0;
    this.starvationDeaths = 0;
    this.environmentalDeaths = 0;
    this.consumptionWindow = [];
    this.consumptionWindowTotal = 0;
    this.births = 0;
    this.nextAntIds = new Map();
    this.maxPopulation = this.colonies.length;
    this.tickEvents = [];
    this.previousForeignContacts = new Set();
    this.foreignContacts = 0;
    this.avoidedContacts = 0;
    this.threats = 0;
    this.fights = 0;
    this.attacks = 0;
    this.damageDealt = 0;
    this.combatDeaths = 0;
    this.activeCombats = new Map();
    this.currentForeignContacts = [];
    this.newCombatLossesThisTick = new Map();
    this.newForeignContactsThisTick = new Map();
    this.raids = new Map();
    this.previousNestThreatContacts = new Map();
    this.newNestThreatContactsThisTick = new Map();
    this.workersSeenInDefenseZone = new Map();

    for (const colony of this.colonies) {
      const colonyConfig = this.colonyConfigs.get(colony.id);
      for (let index = 0; index < colonyConfig.initialAnts; index += 1) {
        const angle = this.random() * Math.PI * 2;
        const distance = this.random() * colony.nest.radius * 0.72;
        colony.ants.push(new Ant({
          id: this.colonies.length === 1
            ? `ANT-${String(index + 1).padStart(3, "0")}`
            : `${colony.id}-ANT-${String(index + 1).padStart(3, "0")}`,
          position: {
            x: colony.nest.position.x + Math.cos(angle) * distance,
            y: colony.nest.position.y + Math.sin(angle) * distance,
          },
          direction: this.random() * Math.PI * 2,
          speed: colonyConfig.antSpeed * (0.75 + this.random() * 0.5),
          colonyId: colony.id,
          energy: colonyConfig.antEnergy,
          maxEnergy: colonyConfig.antMaxEnergy,
          energyConsumptionRate: colonyConfig.energyConsumptionRate,
          lowEnergyThreshold: colonyConfig.lowEnergyThreshold,
          maxHealth: colonyConfig.combatMaxHealth,
          attackPower: colonyConfig.combatAttackPower,
        }));
      }
      this.nextAntIds.set(colony.id, colonyConfig.initialAnts + 1);
      colony.maxPopulation = colonyConfig.initialAnts + 1;
      this.maxPopulation += colonyConfig.initialAnts;
      for (const ant of colony.ants) this.rememberCell(ant);
    }
    if (this.colonies.length > 1) {
      this.territoryMap.update(this.pheromoneFields, this.colonies.map(({ id }) => id), {
        minimumInfluence: this.config.territoryMinimumInfluence,
        contestThreshold: this.config.territoryContestThreshold,
      });
    }
  }

  tick() {
    this.tickEvents = [];
    this.newCombatLossesThisTick = new Map();
    const deltaSeconds = this.config.tickDurationMs / 1000;
    const consumedAtStart = this.colonies.reduce((sum, colony) => sum + colony.consumedFood, 0);
    const previousSeason = this.currentEnvironment.season;
    this.currentEnvironment = this.environment.getState(this.tickCount, this.config);
    if (this.currentEnvironment.season !== previousSeason) {
      this.emitEvent("SEASON_CHANGED", {
        from: previousSeason,
        to: this.currentEnvironment.season,
      });
    }
    if (this.config.environmentEnabled) {
      const foodUpdate = this.foodSpawn.update(
        this.foodSources,
        this.world,
        this.config,
        this.currentEnvironment.foodRegenerationMultiplier,
      );
      this.regeneratedFood += foodUpdate.regenerated;
      this.spawnedFood += foodUpdate.spawnedFood;
      this.expiredFood += foodUpdate.expiredFood;
      for (const event of foodUpdate.events) this.emitEvent(event.type, event);
    } else {
      this.regeneratedFood += this.foodRegeneration.update(
        this.foodSources,
        this.config.foodRegenerationRate,
      );
    }
    if (this.config.pheromonesEnabled) {
      for (const field of this.colonyPheromones.values()) field.update({
        evaporationRate: this.config.pheromoneEvaporationRate,
        diffusionRate: this.config.pheromoneDiffusionRate,
        minimumIntensity: this.config.pheromoneMinimumIntensity,
        types: [
          this.config.foodPheromonesEnabled && PheromoneType.FOOD,
          this.config.homePheromonesEnabled && PheromoneType.HOME,
        ].filter(Boolean),
      });
      if (this.config.alarmPheromonesEnabled) {
        for (const field of this.colonyPheromones.values()) field.update({
          evaporationRate: this.config.alarmEvaporationRate,
          diffusionRate: this.config.alarmDiffusionRate,
          minimumIntensity: this.config.alarmMinimumIntensity,
          types: [PheromoneType.ALARM],
        });
      }
      if (this.config.territoryPheromonesEnabled) {
        for (const field of this.colonyPheromones.values()) field.update({
          evaporationRate: this.config.territoryEvaporationRate,
          diffusionRate: this.config.territoryDiffusionRate,
          minimumIntensity: this.config.territoryMinimumIntensity,
          types: [PheromoneType.TERRITORY],
        });
      }
    }
    const colonyOrder = this.tickCount % 2 === 0 ? this.colonies : [...this.colonies].reverse();
    for (const colony of colonyOrder) {
      const colonyConfig = this.colonyConfigs.get(colony.id);
      const field = this.colonyPheromones.get(colony.id);
      this.detectEnemyNests(colony, colonyConfig);
      this.detectNestThreats(colony, colonyConfig);
      this.evaluateAutoRaid(colony, colonyConfig);
      const interior = this.nestInteriors.get(colony.id);
      this.detectInteriorIntrusion(colony, colonyConfig, interior);
      const broodDemand = colonyConfig.nestInteriorEnabled
        ? this.broodDemandSystem.evaluate(colony, colonyConfig)
        : null;
      let activeCaregivers = colonyConfig.nestInteriorEnabled
        ? colony.ants.filter((candidate) => candidate.locationType === "NEST"
          && (candidate.nestTask === NestTask.FEED_BROOD || candidate.nestTask === NestTask.TEND_BROOD)).length
        : 0;
      let activeBuilders = 0;
      if (colonyConfig.nestConstructionEnabled) {
        this.nestConstructionSystem.evaluate(colony, interior, colonyConfig, this.constructionRandom);
        activeBuilders = colony.ants.filter((candidate) => candidate.nestTask === NestTask.BUILD).length;
      }
      for (const ant of colony.ants) {
      if (ant.state === AntState.DEAD) continue;
      if (ant.state === AntState.RAIDING_INSIDE) {
        this.updateRaidingInsideAnt(ant, colony, colonyConfig, deltaSeconds);
        continue;
      }
      if (ant.locationType === "NEST") {
        const caregiverBefore = ant.nestTask === NestTask.FEED_BROOD || ant.nestTask === NestTask.TEND_BROOD;
        const builderBefore = ant.nestTask === NestTask.BUILD;
        this.updateNestAnt(ant, colony, colonyConfig, deltaSeconds, interior, broodDemand, activeCaregivers, activeBuilders);
        const caregiverAfter = ant.nestTask === NestTask.FEED_BROOD || ant.nestTask === NestTask.TEND_BROOD;
        if (caregiverAfter && !caregiverBefore) activeCaregivers += 1;
        else if (!caregiverAfter && caregiverBefore) activeCaregivers -= 1;
        const builderAfter = ant.nestTask === NestTask.BUILD;
        if (builderAfter && !builderBefore) activeBuilders += 1;
        else if (!builderAfter && builderBefore) activeBuilders -= 1;
        continue;
      }
      if (this.config.combatEnabled && ant.combatCooldown > 0) ant.combatCooldown -= 1;
      if (ant.nestTransitionCooldown > 0) ant.nestTransitionCooldown -= 1;

      if (ant.state === AntState.RESTING) {
        ant.age += deltaSeconds;
        if (this.metabolism.consumeEnergy(
          ant,
          0,
          deltaSeconds,
          colonyConfig.carryingEnergyMultiplier,
          this.basalRateFor(ant, colonyConfig),
          1,
          this.currentEnvironment.metabolismMultiplier,
        )) {
          this.handleDeath(ant, "STARVATION", colony);
          continue;
        }
        this.metabolism.feedAtNest(
          ant,
          colony,
          colonyConfig.foodEnergyValue,
          colonyConfig.resumeEnergyThreshold,
        );
        continue;
      }

      if (ant.state === AntState.SEARCHING_FOOD && this.metabolism.needsFood(ant)) {
        if (this.homeDetection.isInside(ant, colony.nest)) {
          this.metabolism.feedAtNest(
            ant,
            colony,
            colonyConfig.foodEnergyValue,
            colonyConfig.resumeEnergyThreshold,
          );
          if (ant.state === AntState.RESTING) continue;
        } else {
          this.metabolism.startEnergyReturn(ant);
        }
      }

      let targetDistance;
      if (ant.state === AntState.RETURNING_HOME) {
        const navigation = this.scoreDirection(ant, "RETURNING_HOME");
        const detectionRadius = colonyConfig.directHomeNavigation
          ? Infinity
          : colonyConfig.homeDetectionRadius;
        const localHome = this.homeDetection.suggestDirection(
          ant,
          colony.nest,
          detectionRadius,
        );
        targetDistance = this.returnHome.update(ant, navigation, localHome, deltaSeconds);
      } else if (ant.state === AntState.RAIDING) {
        targetDistance = this.raidTravelDistance(ant, colony);
      } else if (ant.state === AntState.DEFENDING) {
        const navigation = this.scoreDirection(ant, "RETURNING_HOME");
        const detectionRadius = colonyConfig.directHomeNavigation
          ? Infinity
          : colonyConfig.homeDetectionRadius;
        const localHome = this.homeDetection.suggestDirection(ant, colony.nest, detectionRadius);
        targetDistance = this.returnHome.update(ant, navigation, localHome, deltaSeconds);
      } else {
        const food = ant.caste === Caste.SOLDIER ? null : this.foodDetection.findNearest(
          ant,
          this.foodSources,
          colonyConfig.foodDetectionRadius,
        );
        if (food && ant.lastDiscoveredSourceId !== food.id) {
          ant.lastDiscoveredSourceId = food.id;
          this.emitEvent("FOOD_SOURCE_DISCOVERED", {
            colonyId: colony.id,
            antId: ant.id,
            sourceId: food.id,
          });
        }
        const navigation = this.scoreDirection(ant, "SEARCHING_FOOD");
        targetDistance = this.searchFood.update(ant, food, navigation, deltaSeconds);
      }

      const distance = this.movement.update(ant, this.world, deltaSeconds, targetDistance);
      this.totalDistance += distance;
      colony.totalDistance += distance;
      if (ant.state === AntState.RETURNING_HOME && ant.returnStartedTick !== null) {
        ant.returnDistance += distance;
      }
      const exposure = this.hazard.exposure(ant.position, this.dangerZones);
      if (exposure.exposed) {
        this.dangerExposures += 1;
        this.dangerDistance += distance;
      }
      const carryingMultiplier = ant.carryingFood ? colonyConfig.carryingEnergyMultiplier : 1;
      const baseMovementCost = distance * ant.energyConsumptionRate * carryingMultiplier
        * this.currentEnvironment.movementCostMultiplier;
      const hazardDamage = baseMovementCost * (exposure.movementMultiplier - 1);
      if (colonyConfig.pheromonesEnabled
        && colonyConfig.alarmPheromonesEnabled
        && hazardDamage >= colonyConfig.alarmDamageThreshold) {
        this.alarmDeposit.depositDamage(
          ant.position,
          field,
          colonyConfig.alarmDamageDepositStrength,
        );
        this.damageAlarmDeposits += 1;
      }
      if (this.metabolism.consumeEnergy(
        ant,
        distance,
        deltaSeconds,
        colonyConfig.carryingEnergyMultiplier,
        this.basalRateFor(ant, colonyConfig),
        this.currentEnvironment.movementCostMultiplier * exposure.movementMultiplier,
        this.currentEnvironment.metabolismMultiplier,
      )) {
        this.handleDeath(ant, exposure.exposed ? "ENVIRONMENT" : "STARVATION", colony);
        continue;
      }
      if (this.hazard.applyMortality(
        ant,
        this.dangerZones,
        this.currentEnvironment.hazardMultiplier,
        (zone) => deterministicEventRoll(
          this.config.seed,
          this.tickCount,
          ant.id,
          zone.id,
        ),
      )) {
        this.handleDeath(ant, "ENVIRONMENT", colony);
        continue;
      }
      this.rememberCell(ant);

      if (ant.state === AntState.RETURNING_HOME) {
        if (colonyConfig.pheromonesEnabled) {
          this.depositTrail(ant);
        }
        if (!colonyConfig.nestInteriorEnabled && this.foodCollection.deposit(ant, colony)) {
          this.completedReturns += 1;
          this.totalReturnTicks += this.tickCount - ant.returnStartedTick;
          this.totalDetourDistance += Math.max(0, ant.returnDistance - ant.directReturnDistance);
          ant.returnStartedTick = null;
          ant.returnDistance = 0;
          ant.directReturnDistance = 0;
        }
        if (this.homeDetection.isInside(ant, colony.nest)) {
          if (colonyConfig.nestInteriorEnabled) {
            if (ant.nestTransitionCooldown <= 0) {
              this.nestTransitionSystem.enter(ant, colony, this.nestInteriors.get(colony.id));
              this.emitEvent("ANT_ENTERED_NEST", { antId: ant.id, colonyId: colony.id });
            }
          } else {
            if (ant.raidCargo > 0) this.depositLoot(ant, colony);
            if (ant.raidId) this.resolveRaidMemberOutcome(ant, colony, "RETURNED");
            if (this.metabolism.needsFood(ant)) {
              this.metabolism.feedAtNest(
                ant,
                colony,
                colonyConfig.foodEnergyValue,
                colonyConfig.resumeEnergyThreshold,
              );
            }
          }
        }
      } else if (ant.state === AntState.RAIDING) {
        this.updateRaidTravel(ant, colony);
      } else if (ant.state === AntState.DEFENDING) {
        if (this.homeDetection.isInside(ant, colony.nest) && this.metabolism.needsFood(ant)) {
          this.metabolism.feedAtNest(
            ant,
            colony,
            colonyConfig.foodEnergyValue,
            colonyConfig.resumeEnergyThreshold,
          );
        }
      } else {
        if (this.homeDetection.isInside(ant, colony.nest)) ant.distanceSinceNest = 0;
        if (colonyConfig.pheromonesEnabled) this.depositTrail(ant);
        const targetedSource = ant.target;
        if (this.foodCollection.collect(ant, colonyConfig.foodPickupDistance)) {
          ant.returnStartedTick = this.tickCount;
          ant.returnDistance = 0;
          ant.directReturnDistance = Math.max(
            0,
            Math.hypot(
              ant.position.x - colony.nest.position.x,
              ant.position.y - colony.nest.position.y,
            ) - colony.nest.radius,
          );
          this.totalPickups += 1;
          colony.totalPickups += 1;
          if (targetedSource && !targetedSource.active) {
            this.emitEvent("FOOD_SOURCE_DEPLETED", { sourceId: targetedSource.id, colonyId: colony.id });
          }
          if (colonyConfig.pheromonesEnabled) this.depositTrail(ant);
        }
      }
      if (ant.pendingNestIntel && this.homeDetection.isInside(ant, colony.nest)) {
        this.deliverNestIntel(ant, colony);
      }
    }
      const eggsBeforeUpdate = colony.queen.eggsLaid;
      const activeTenders = colonyConfig.nestInteriorEnabled
        ? colony.ants.filter((candidate) => candidate.nestTask === NestTask.TEND_BROOD
          && candidate.nestChamberId === NestChamberType.BROOD).length
        : 0;
      const broodCareFactor = 1 + Math.min(activeTenders, colony.brood.length) * colonyConfig.nestBroodCareBonus;
      const emergedBroods = this.broodSystems.get(colony.id).update(
        colony,
        colonyConfig,
        this.currentEnvironment.broodDevelopmentMultiplier * broodCareFactor,
      );
      if (colony.queen.eggsLaid > eggsBeforeUpdate) {
        this.emitEvent("QUEEN_LAID_EGG", { queenId: colony.queen.id, colonyId: colony.id });
      }
      for (const brood of emergedBroods) {
        this.spawnWorker(colony, brood.caste);
        if (brood.caste === Caste.SOLDIER) colony.soldierBirths += 1;
      }
      if (emergedBroods.length > 0) {
        this.emitEvent("WORKERS_EMERGED", { count: emergedBroods.length, colonyId: colony.id });
      }
      colony.births += emergedBroods.length;
      this.births += emergedBroods.length;
      const colonyPopulation = colony.ants.filter((ant) => ant.state !== AntState.DEAD).length
        + colony.brood.length + 1;
      colony.maxPopulation = Math.max(colony.maxPopulation, colonyPopulation);
    }
    this.updateForeignContacts();
    this.resolveCombat();
    this.updateThreatPressure();
    if (this.colonies.length > 1 && this.tickCount % this.config.territoryUpdateInterval === 0) {
      this.territoryMap.update(this.pheromoneFields, this.colonies.map(({ id }) => id), {
        minimumInfluence: this.config.territoryMinimumInfluence,
        contestThreshold: this.config.territoryContestThreshold,
      });
    }
    const currentPopulation = this.colonies.reduce((total, colony) => total
      + colony.ants.filter((ant) => ant.state !== AntState.DEAD).length
      + colony.brood.length + 1, 0);
    this.maxPopulation = Math.max(this.maxPopulation, currentPopulation);
    const consumedThisTick = this.colonies.reduce((sum, colony) => sum + colony.consumedFood, 0)
      - consumedAtStart;
    this.consumptionWindow.push(consumedThisTick);
    this.consumptionWindowTotal += consumedThisTick;
    if (this.consumptionWindow.length > this.config.autonomyWindowTicks) {
      this.consumptionWindowTotal -= this.consumptionWindow.shift();
    }
    this.tickCount += 1;
    this.elapsedMs += this.config.tickDurationMs;
    if (!this.config.environmentEnabled
      && this.completionTick === null
      && this.colonies.reduce((sum, colony) => sum + colony.resources, 0) === this.initialFoodQuantity) {
      this.completionTick = this.tickCount;
    }
  }

  handleDeath(ant, cause = "STARVATION", colony = this.colonyForAnt(ant), extra = {}) {
    const colonyConfig = this.colonyConfigs.get(colony.id);
    const field = this.colonyPheromones.get(colony.id);
    if (cause === "COMBAT") {
      this.combatDeaths += 1;
      colony.combatLosses += 1;
      if (ant.caste === Caste.SOLDIER) colony.soldierLosses += 1; else colony.workerLosses += 1;
      if (extra.killerColony) {
        extra.killerColony.kills += 1;
        if (extra.killerCaste === Caste.SOLDIER) extra.killerColony.soldierKills += 1;
        else extra.killerColony.workerKills += 1;
        if (extra.killerIsDefending) extra.killerColony.defensiveKills += 1;
      }
      this.newCombatLossesThisTick.set(colony.id, (this.newCombatLossesThisTick.get(colony.id) ?? 0) + 1);
      this.emitEvent("COMBAT_DEATH", {
        colonyId: colony.id,
        antId: ant.id,
        killerColonyId: extra.killerColony?.id ?? null,
        killerAntId: extra.killerId ?? null,
        position: { ...ant.position },
      });
      if (colonyConfig.pheromonesEnabled && colonyConfig.alarmPheromonesEnabled) {
        this.alarmDeposit.depositDeath(
          ant.position,
          field,
          colonyConfig.combatDeathAlarmStrength,
        );
        this.deathAlarmDeposits += 1;
      }
    } else if (cause === "ENVIRONMENT") {
      this.environmentalDeaths += 1;
      colony.environmentalDeaths += 1;
      this.emitEvent("ENVIRONMENTAL_DEATH", { antId: ant.id, colonyId: colony.id });
      if (colonyConfig.pheromonesEnabled && colonyConfig.alarmPheromonesEnabled) {
        this.alarmDeposit.depositDeath(
          ant.position,
          field,
          colonyConfig.alarmDeathDepositStrength,
        );
        this.deathAlarmDeposits += 1;
      }
    } else {
      this.starvationDeaths += 1;
      colony.starvationDeaths += 1;
      this.emitEvent("WORKER_DIED", { antId: ant.id, cause: "STARVATION", colonyId: colony.id });
    }
    if (ant.carryingFood) {
      this.lostFood += ant.carryingFoodAmount;
      colony.lostFood += ant.carryingFoodAmount;
      ant.carryingFood = false;
      ant.carryingFoodAmount = 0;
    }
    ant.returnStartedTick = null;
    ant.returnDistance = 0;
    ant.directReturnDistance = 0;
    ant.target = null;
    ant.returnReason = null;
    if (ant.raidCargo > 0) this.dropLoot(ant, colony);
    if (ant.raidId) this.resolveRaidMemberOutcome(ant, colony, "DEAD");
    if (ant.internalFoodCargo > 0) {
      this.lostFood += ant.internalFoodCargo;
      colony.lostFood += ant.internalFoodCargo;
      ant.internalFoodCargo = 0;
    }
    if (ant.locationType === "NEST") {
      // ant.nestId — pas colony.id — car un intrus V1.5.4 meurt dans
      // l'intérieur ETRANGER qu'il occupait, pas dans le sien.
      this.nestInteriors.get(ant.nestId)?.removeAnt(ant);
      ant.locationType = "WORLD";
      ant.nestId = null;
      ant.nestPosition = null;
      ant.nestChamberId = null;
      ant.nestTask = "NONE";
      ant.nestTendTicksRemaining = 0;
      ant.nestPath = null;
      ant.nestPathIndex = 0;
      ant.nestTargetChamberId = null;
      ant.nestBuildSiteId = null;
    }
  }

  detectEnemyNests(colony, colonyConfig) {
    if (this.colonies.length < 2) return;
    const radius = colonyConfig.nestDiscoveryRadius;
    const radiusSquared = radius * radius;
    for (const ant of colony.ants) {
      if (ant.state === AntState.DEAD || ant.locationType === "NEST") continue;
      for (const other of this.colonies) {
        if (other.id === colony.id) continue;
        const dx = other.nest.position.x - ant.position.x;
        const dy = other.nest.position.y - ant.position.y;
        if (dx * dx + dy * dy > radiusSquared) continue;
        ant.pendingNestIntel = {
          colonyId: other.id,
          position: { ...other.nest.position },
          tick: this.tickCount,
        };
      }
    }
  }

  detectNestThreats(colony, colonyConfig) {
    if (!colonyConfig.combatEnabled || !colonyConfig.nestDefenseEnabled || this.colonies.length < 2) return;
    const radius = colonyConfig.nestDefenseRadius;
    const radiusSquared = radius * radius;
    const currentIds = new Set();
    for (const other of this.colonies) {
      if (other.id === colony.id) continue;
      for (const ant of other.ants) {
        if (ant.state === AntState.DEAD || ant.locationType === "NEST") continue;
        const dx = ant.position.x - colony.nest.position.x;
        const dy = ant.position.y - colony.nest.position.y;
        if (dx * dx + dy * dy <= radiusSquared) currentIds.add(ant.id);
      }
    }
    const previous = this.previousNestThreatContacts.get(colony.id) ?? new Set();
    let newArrivals = 0;
    for (const id of currentIds) {
      if (previous.has(id)) continue;
      newArrivals += 1;
      colony.raidersDetectedNearNest += 1;
      this.emitEvent("NEST_THREAT_DETECTED", { colonyId: colony.id, antId: id });
    }
    this.previousNestThreatContacts.set(colony.id, currentIds);
    this.newNestThreatContactsThisTick.set(colony.id, newArrivals);

    const presenceNow = currentIds.size > 0;
    colony.nestThreatGraceRemaining = presenceNow
      ? colonyConfig.nestDefenseGraceTicks
      : Math.max(0, colony.nestThreatGraceRemaining - 1);
    const wasUnderThreat = colony.nestUnderThreat;
    colony.nestUnderThreat = presenceNow || colony.nestThreatGraceRemaining > 0;

    if (colony.nestUnderThreat) {
      const field = this.colonyPheromones.get(colony.id);
      this.alarmDeposit.depositDeath(colony.nest.position, field, colonyConfig.nestDefenseAlarmStrength);
    }

    if (!wasUnderThreat && colony.nestUnderThreat) {
      colony.defenseActivations += 1;
      this.workersSeenInDefenseZone.set(colony.id, new Set());
      this.emitEvent("DEFENSE_ACTIVATED", { colonyId: colony.id });
    }

    if (colony.nestUnderThreat) {
      const zone = this.workersSeenInDefenseZone.get(colony.id) ?? new Set();
      for (const ant of colony.ants) {
        if (ant.state === AntState.DEAD || ant.caste !== Caste.WORKER || ant.locationType === "NEST") continue;
        const dx = ant.position.x - colony.nest.position.x;
        const dy = ant.position.y - colony.nest.position.y;
        if (dx * dx + dy * dy <= radiusSquared) zone.add(ant.id);
      }
      this.workersSeenInDefenseZone.set(colony.id, zone);

      for (const ant of colony.ants) {
        if (ant.state === AntState.DEAD || ant.caste !== Caste.SOLDIER) continue;
        if (ant.state !== AntState.SEARCHING_FOOD && ant.state !== AntState.RAIDING) continue;
        if (ant.state === AntState.RAIDING) this.resolveRaidMemberOutcome(ant, colony, "RECALLED");
        ant.state = AntState.DEFENDING;
        ant.target = null;
        colony.defendersMobilized += 1;
      }
    }

    if (wasUnderThreat && !colony.nestUnderThreat) {
      const zone = this.workersSeenInDefenseZone.get(colony.id) ?? new Set();
      for (const workerId of zone) {
        const worker = colony.ants.find((candidate) => candidate.id === workerId);
        if (!worker || worker.state === AntState.DEAD) continue;
        const dx = worker.position.x - colony.nest.position.x;
        const dy = worker.position.y - colony.nest.position.y;
        if (dx * dx + dy * dy > radiusSquared) colony.workersEvacuated += 1;
      }
      this.workersSeenInDefenseZone.delete(colony.id);
      for (const ant of colony.ants) {
        if (ant.state === AntState.DEFENDING) ant.state = AntState.SEARCHING_FOOD;
      }
      this.emitEvent("DEFENSE_RELEASED", { colonyId: colony.id });
    }
  }

  // Mobilise activement des soldats indoor vers une chambre envahie — sans
  // ça, la défense intérieure dépendrait du hasard qu'un soldat traîne déjà
  // au bon endroit au bon moment (constaté explicitement en testant : un
  // soldat sans tâche ressort du nid en quelques dizaines de ticks, bien
  // avant qu'un intrus n'y arrive). Le nombre de défenseurs mobilisés par
  // chambre menacée suit la même priorité que le multiplicateur de dégâts
  // (STORAGE=1, BROOD=1.5, QUEEN=2.5, arrondi) — "défense moyenne / forte /
  // maximale" se traduit ici en plus de défenseurs, pas seulement plus de
  // dégâts par défenseur.
  detectInteriorIntrusion(colony, colonyConfig, interior) {
    if (!this.config.combatEnabled || !colonyConfig.nestIntrusionEnabled) return;
    // les intrus appartiennent à la colonie ATTAQUANTE (colony.ants ne les
    // contient jamais) — il faut chercher dans toutes les colonies celles
    // dont `nestId` pointe vers CE nid.
    const intruders = this.colonies.flatMap((candidate) => candidate.ants).filter((ant) => (
      ant.state === AntState.RAIDING_INSIDE && ant.nestId === colony.id
    ));
    if (intruders.length === 0) return;
    const threatenedChamberIds = new Set(intruders.map((intruder) => intruder.nestChamberId));
    for (const chamberId of threatenedChamberIds) {
      const priorityMultiplier = this.nestDefensePriorityMultiplier(chamberId, interior, colonyConfig);
      const desiredDefenders = Math.max(1, Math.round(priorityMultiplier));
      const alreadyDefending = colony.ants.filter((ant) => (
        ant.state === AntState.DEFENDING_INSIDE
        && (ant.nestChamberId === chamberId || ant.nestTargetChamberId === chamberId)
      )).length;
      let toMobilize = desiredDefenders - alreadyDefending;
      if (toMobilize <= 0) continue;
      for (const ant of colony.ants) {
        if (toMobilize <= 0) break;
        if (ant.state !== AntState.IN_NEST || ant.caste !== Caste.SOLDIER || ant.locationType !== "NEST") continue;
        if (ant.nestId !== colony.id) continue;
        ant.state = AntState.DEFENDING_INSIDE;
        ant.nestTask = NestTask.NONE;
        ant.nestPath = null;
        ant.nestPathIndex = 0;
        ant.nestTargetChamberId = null;
        colony.defendersMobilized += 1;
        this.emitEvent("DEFENDER_MOBILIZED_INSIDE", { colonyId: colony.id, antId: ant.id, chamberId });
        toMobilize -= 1;
      }
    }
  }

  evaluateAutoRaid(colony, colonyConfig) {
    if (!colonyConfig.autoRaidEnabled) return;
    const activeRaidTargets = new Set(
      [...this.raids.values()]
        .filter((raid) => raid.sourceColonyId === colony.id)
        .map((raid) => raid.targetColonyId),
    );
    const decision = this.raidDecisionSystem.decide(colony, colonyConfig, this.tickCount, activeRaidTargets);
    if (!decision) return;
    const raid = this.requestRaid(colony.id, decision.targetColonyId, decision.groupSize);
    if (raid) colony.nextRaidEligibleTick = this.tickCount + colonyConfig.raidCooldownTicks;
  }

  deliverNestIntel(ant, colony) {
    const intel = ant.pendingNestIntel;
    ant.pendingNestIntel = null;
    const existing = colony.knownEnemyNests.get(intel.colonyId);
    colony.knownEnemyNests.set(intel.colonyId, {
      position: intel.position,
      discoveredTick: existing ? existing.discoveredTick : intel.tick,
      lastSeenTick: intel.tick,
    });
    if (!existing) {
      colony.enemyNestsDiscovered += 1;
      this.emitEvent("ENEMY_NEST_DISCOVERED", {
        colonyId: colony.id,
        antId: ant.id,
        targetColonyId: intel.colonyId,
        position: intel.position,
      });
    }
  }

  raidTravelDistance(ant, colony) {
    const raid = this.raids.get(ant.raidId);
    const intel = raid ? colony.knownEnemyNests.get(raid.targetColonyId) : null;
    const targetPosition = intel ? intel.position : colony.nest.position;
    const dx = targetPosition.x - ant.position.x;
    const dy = targetPosition.y - ant.position.y;
    ant.direction = Math.atan2(dy, dx);
    return Math.hypot(dx, dy);
  }

  updateNestAnt(ant, colony, colonyConfig, deltaSeconds, interior, broodDemand, activeCaregivers, activeBuilders) {
    ant.age += deltaSeconds;
    if (ant.nestTransitionCooldown > 0) ant.nestTransitionCooldown -= 1;
    if (this.config.combatEnabled && ant.combatCooldown > 0) ant.combatCooldown -= 1;

    if (this.metabolism.consumeEnergy(
      ant,
      0,
      deltaSeconds,
      colonyConfig.carryingEnergyMultiplier,
      this.basalRateFor(ant, colonyConfig),
      1,
      1,
    )) {
      this.handleDeath(ant, "STARVATION", colony);
      return;
    }

    if (ant.state === AntState.RESTING) {
      this.metabolism.feedAtNest(ant, colony, colonyConfig.foodEnergyValue, colonyConfig.resumeEnergyThreshold);
      if (ant.state === AntState.RESTING) return;
      ant.state = AntState.IN_NEST;
      ant.nestTask = NestTask.NONE;
      this.emitEvent("ANT_FINISHED_REST", { antId: ant.id, colonyId: colony.id });
      return;
    }

    if (ant.state === AntState.DEFENDING_INSIDE) {
      if (this.config.combatEnabled && ant.combatCooldown > 0) ant.combatCooldown -= 1;
      const intruders = this.colonies.flatMap((candidate) => candidate.ants).filter((candidate) => (
        candidate.state === AntState.RAIDING_INSIDE && candidate.nestId === colony.id
      ));
      if (intruders.length === 0) {
        ant.state = AntState.IN_NEST;
        ant.nestTask = NestTask.NONE;
        ant.nestPath = null;
        ant.nestPathIndex = 0;
        ant.nestTargetChamberId = null;
        return;
      }
      // déjà dans la même chambre qu'un intrus : reste sur place, le combat
      // est résolu depuis le tick de l'intrus (resolveInteriorCombat), un
      // seul point de résolution par échange.
      if (intruders.some((intruder) => intruder.nestChamberId === ant.nestChamberId)) return;
      // sinon converge vers la chambre menacée la plus proche dans le
      // graphe — "convergence vers le corridor menacé", pas juste une
      // résolution passive si le hasard les fait se croiser.
      const threatenedChamberId = intruders[0].nestChamberId;
      if (!ant.nestPath || ant.nestTargetChamberId !== threatenedChamberId) {
        ant.nestTargetChamberId = threatenedChamberId;
        ant.nestPath = interior.path(ant.nestChamberId ?? NestChamberType.ENTRANCE, threatenedChamberId);
        ant.nestPathIndex = 0;
      }
      const waypointId = ant.nestPath[ant.nestPathIndex];
      const speedMultiplier = this.nestCongestionMultiplier(interior, waypointId, colonyConfig);
      const arrived = this.nestNavigationSystem.moveToward(
        ant,
        interior.getChamber(waypointId).position,
        colonyConfig.nestInteriorSpeed * speedMultiplier,
        deltaSeconds,
        colonyConfig.nestChamberArrivalRadius,
      );
      if (!arrived) return;
      if (ant.nestPathIndex < ant.nestPath.length - 1) {
        ant.nestPathIndex += 1;
        return;
      }
      interior.moveAntToChamber(ant, threatenedChamberId);
      ant.nestPath = null;
      ant.nestPathIndex = 0;
      return;
    }

    if (ant.nestTask === NestTask.TEND_BROOD && ant.nestChamberId === NestChamberType.BROOD) {
      this.tendBrood(ant, colony);
      return;
    }

    if (ant.nestTask === NestTask.BUILD) {
      this.updateBuildingAnt(ant, colony, colonyConfig, deltaSeconds, interior);
      return;
    }

    if (ant.nestTask === NestTask.NONE) {
      this.assignNestTask(ant, colony, colonyConfig, interior, broodDemand, activeCaregivers, activeBuilders);
    }

    this.ensureNestRoute(ant, colony, interior);
    const waypointId = ant.nestPath[ant.nestPathIndex];
    const speedMultiplier = this.nestCongestionMultiplier(interior, waypointId, colonyConfig);
    const arrivedWaypoint = this.nestNavigationSystem.moveToward(
      ant,
      interior.getChamber(waypointId).position,
      colonyConfig.nestInteriorSpeed * speedMultiplier,
      deltaSeconds,
      colonyConfig.nestChamberArrivalRadius,
    );
    if (!arrivedWaypoint) return;
    if (ant.nestPathIndex < ant.nestPath.length - 1) {
      ant.nestPathIndex += 1;
      return;
    }

    const targetType = this.resolveDesiredNestType(ant);
    interior.moveAntToChamber(ant, ant.nestTargetChamberId);
    ant.nestPath = null;
    ant.nestPathIndex = 0;

    if (targetType === NestChamberType.STORAGE) {
      if (ant.nestTask === NestTask.FEED_BROOD) {
        this.pickupInternalFood(ant, colony, colonyConfig);
        ant.state = AntState.IN_NEST;
      } else {
        this.depositAtStorage(ant, colony);
        ant.state = AntState.IN_NEST;
        ant.nestTask = NestTask.NONE;
      }
    } else if (targetType === NestChamberType.REST) {
      ant.state = AntState.RESTING;
      this.emitEvent("ANT_STARTED_REST", { antId: ant.id, colonyId: colony.id });
      this.metabolism.feedAtNest(ant, colony, colonyConfig.foodEnergyValue, colonyConfig.resumeEnergyThreshold);
      if (ant.state !== AntState.RESTING) {
        ant.state = AntState.IN_NEST;
        ant.nestTask = NestTask.NONE;
        this.emitEvent("ANT_FINISHED_REST", { antId: ant.id, colonyId: colony.id });
      }
    } else if (targetType === NestChamberType.BROOD) {
      if (ant.nestTask === NestTask.FEED_BROOD) {
        this.deliverBroodFood(ant, colony);
        ant.state = AntState.IN_NEST;
        ant.nestTask = NestTask.NONE;
      } else if (ant.nestTask === NestTask.TEND_BROOD) {
        ant.state = AntState.IN_NEST;
        ant.nestTendTicksRemaining = colonyConfig.nestTendBroodTicks;
      }
    } else if (targetType === NestChamberType.ENTRANCE) {
      this.nestTransitionSystem.exit(ant, colony, interior, colonyConfig, this.birthRandom);
      this.emitEvent("ANT_EXITED_NEST", { antId: ant.id, colonyId: colony.id });
    }
  }

  tendBrood(ant, colony) {
    ant.nestTendTicksRemaining -= 1;
    if (ant.nestTendTicksRemaining <= 0) ant.nestTask = NestTask.NONE;
  }

  updateBuildingAnt(ant, colony, colonyConfig, deltaSeconds, interior) {
    const site = interior.pendingSites.get(ant.nestBuildSiteId);
    if (!site) {
      // le chantier a disparu entre-temps (terminé par d'autres ouvrières
      // ce même tick) — la fourmi redécide normalement au tick suivant.
      ant.nestTask = NestTask.NONE;
      ant.nestBuildSiteId = null;
      return;
    }
    const arrived = this.nestNavigationSystem.moveToward(
      ant,
      site.position,
      colonyConfig.nestInteriorSpeed,
      deltaSeconds,
      colonyConfig.nestChamberArrivalRadius,
    );
    if (!arrived) return;
    site.progress += 1;
    if (site.progress < site.requiredProgress) return;

    const chamber = interior.addChamber(site.type, site.position, site.anchorId, site.exitAngle);
    interior.pendingSites.delete(site.id);
    colony.consumeFood(Math.min(colonyConfig.nestBuildFoodCost, colony.foodStock));
    colony.chambersBuilt += 1;
    this.emitEvent("NEST_CHAMBER_BUILT", {
      colonyId: colony.id,
      chamberId: chamber.id,
      chamberType: chamber.type,
    });
    for (const builder of colony.ants) {
      if (builder.nestBuildSiteId === site.id) {
        builder.nestTask = NestTask.NONE;
        builder.nestBuildSiteId = null;
      }
    }
  }

  assignNestTask(ant, colony, colonyConfig, interior, broodDemand, activeCaregivers, activeBuilders) {
    const pendingSite = colonyConfig.nestConstructionEnabled
      ? interior.pendingSites.values().next().value ?? null
      : null;
    const task = this.nestTaskSystem.decide(ant, colony, colonyConfig, {
      needsFood: this.metabolism.needsFood(ant),
      broodDemand: broodDemand ?? { hungryLarvae: 0, foodDemand: 0 },
      activeCaregivers: activeCaregivers ?? 0,
      construction: pendingSite
        ? { siteAvailable: true, activeBuilders: activeBuilders ?? 0, cap: colonyConfig.nestMaxActiveBuilders }
        : { siteAvailable: false, activeBuilders: 0, cap: 0 },
    });
    ant.nestTask = task;
    ant.nestBuildSiteId = task === NestTask.BUILD ? pendingSite.id : null;
  }

  resolveDesiredNestType(ant) {
    switch (ant.nestTask) {
      case NestTask.GO_TO_STORAGE: return NestChamberType.STORAGE;
      case NestTask.GO_TO_REST: return NestChamberType.REST;
      case NestTask.FEED_BROOD:
        return ant.internalFoodCargo > 0 ? NestChamberType.BROOD : NestChamberType.STORAGE;
      case NestTask.TEND_BROOD: return NestChamberType.BROOD;
      default: return NestChamberType.ENTRANCE;
    }
  }

  // Choisit, parmi les chambres du type visé, celle qui a le moins
  // d'occupantes actuellement (répartition de charge simple) — puis calcule
  // le chemin réel via les corridors existants jusqu'à cette chambre.
  // Recalculé uniquement quand le type visé change (une nouvelle tâche, ou
  // le passage STORAGE -> BROOD de FEED_BROOD une fois la charge ramassée),
  // jamais à chaque tick.
  ensureNestRoute(ant, colony, interior) {
    const desiredType = this.resolveDesiredNestType(ant);
    const currentTargetType = ant.nestTargetChamberId
      ? interior.chambers.get(ant.nestTargetChamberId)?.type
      : null;
    if (ant.nestPath && currentTargetType === desiredType) return;
    const targetChamber = interior.leastLoadedChamberOfType(desiredType);
    const fromId = ant.nestChamberId ?? NestChamberType.ENTRANCE;
    ant.nestTargetChamberId = targetChamber.id;
    ant.nestPath = interior.path(fromId, targetChamber.id);
    ant.nestPathIndex = 0;
  }

  // Ralentit une fourmi qui approche une chambre déjà à — ou au-dessus de —
  // sa capacité (V1.5.4.2). Un seuil, pas une courbe progressive : en
  // dessous de la capacité, vitesse normale ; au-dessus, un multiplicateur
  // fixe. Volontairement simple — la vraie valeur ajoutée est de rendre une
  // deuxième chambre du même type (construite dynamiquement) réellement
  // utile, pas de modéliser une file d'attente réaliste.
  nestCongestionMultiplier(interior, chamberId, colonyConfig) {
    if (!colonyConfig.nestCongestionEnabled) return 1;
    const chamber = interior.chambers.get(chamberId);
    if (!chamber || chamber.occupants.size < colonyConfig.nestChamberCapacity) return 1;
    return colonyConfig.nestCongestionSlowdown;
  }

  depositAtStorage(ant, colony) {
    if (ant.carryingFood) {
      colony.depositFood(ant.carryingFoodAmount);
      this.completedReturns += 1;
      if (ant.returnStartedTick !== null) {
        this.totalReturnTicks += this.tickCount - ant.returnStartedTick;
        this.totalDetourDistance += Math.max(0, ant.returnDistance - ant.directReturnDistance);
      }
      ant.carryingFood = false;
      ant.carryingFoodAmount = 0;
      ant.returnStartedTick = null;
      ant.returnDistance = 0;
      ant.directReturnDistance = 0;
    }
    if (ant.raidCargo > 0) this.depositLoot(ant, colony);
    if (ant.raidId) this.resolveRaidMemberOutcome(ant, colony, "RETURNED");
  }

  pickupInternalFood(ant, colony, colonyConfig) {
    const amount = Math.min(colonyConfig.nestInternalFoodCarry, colony.foodStock);
    if (amount <= 0) {
      ant.nestTask = NestTask.NONE;
      return;
    }
    colony.takeStock(amount);
    ant.internalFoodCargo = amount;
  }

  deliverBroodFood(ant, colony) {
    colony.broodFoodBuffer += ant.internalFoodCargo;
    colony.broodFoodDelivered += ant.internalFoodCargo;
    ant.internalFoodCargo = 0;
    this.emitEvent("BROOD_FED", { antId: ant.id, colonyId: colony.id });
  }

  updateRaidTravel(ant, colony) {
    const raid = this.raids.get(ant.raidId);
    if (!raid) {
      ant.raidId = null;
      ant.state = AntState.SEARCHING_FOOD;
      return;
    }
    const intel = colony.knownEnemyNests.get(raid.targetColonyId);
    const targetPosition = intel ? intel.position : colony.nest.position;
    const distance = Math.hypot(
      targetPosition.x - ant.position.x,
      targetPosition.y - ant.position.y,
    );
    if (distance <= this.config.raidArrivalRadius) {
      if (raid.state === RaidState.TRAVELLING) {
        raid.state = RaidState.RETURNING;
        this.emitEvent("RAID_REACHED_TARGET", {
          raidId: raid.id,
          colonyId: colony.id,
          targetColonyId: raid.targetColonyId,
        });
      }
      const colonyConfig = this.colonyConfigs.get(colony.id);
      const targetColony = this.colonies.find((candidate) => candidate.id === raid.targetColonyId);
      const targetConfig = targetColony ? this.colonyConfigs.get(targetColony.id) : null;
      if (colonyConfig.nestIntrusionEnabled && targetColony && targetConfig?.nestInteriorEnabled) {
        this.breachNest(ant, colony, targetColony);
        return;
      }
      this.attemptPillage(ant, colony, raid);
      ant.state = AntState.RETURNING_HOME;
      ant.direction += Math.PI;
    }
  }

  // V1.5.4 : quand l'intrusion est activée des deux côtés (config du
  // raider ET du nid visé), le raider entre PHYSIQUEMENT dans l'intérieur
  // ennemi au lieu de piller à distance — il utilise le même graphe de
  // chambres que les fourmis locales, peut y croiser des défenseurs, et son
  // `ant.nestId` pointe vers la colonie ETRANGÈRE (jamais la sienne, voir
  // l'invariant dédié dans Invariants.js).
  breachNest(ant, colony, targetColony) {
    const interior = this.nestInteriors.get(targetColony.id);
    const entrance = interior.leastLoadedChamberOfType(NestChamberType.ENTRANCE);
    interior.moveAntToChamber(ant, entrance.id);
    ant.locationType = "NEST";
    ant.nestId = targetColony.id;
    ant.nestTask = NestTask.NONE;
    ant.nestPath = null;
    ant.nestPathIndex = 0;
    ant.nestTargetChamberId = null;
    ant.state = AntState.RAIDING_INSIDE;
    targetColony.nestBreaches += 1;
    this.emitEvent("NEST_BREACHED", {
      colonyId: colony.id,
      antId: ant.id,
      targetColonyId: targetColony.id,
      chamberId: entrance.id,
    });
  }

  // Le raider à l'intérieur : combat s'il croise un défenseur dans sa
  // chambre courante, sinon avance vers STORAGE (butin) puis vers une
  // ENTRANCE (fuite) une fois chargé ou à court d'énergie — exactement la
  // même logique de répartition de charge + chemin par corridors que les
  // fourmis locales (`leastLoadedChamberOfType` + `interior.path`), pas de
  // ligne droite à travers un nid qui n'est pas le sien.
  updateRaidingInsideAnt(ant, colony, colonyConfig, deltaSeconds) {
    const targetColony = this.colonies.find((candidate) => candidate.id === ant.nestId);
    const interior = targetColony ? this.nestInteriors.get(ant.nestId) : null;
    if (!targetColony || !interior) {
      ant.locationType = "WORLD";
      ant.nestId = null;
      ant.nestChamberId = null;
      ant.nestPosition = null;
      ant.state = AntState.RETURNING_HOME;
      ant.direction += Math.PI;
      return;
    }
    ant.age += deltaSeconds;
    if (this.config.combatEnabled && ant.combatCooldown > 0) ant.combatCooldown -= 1;

    if (this.resolveInteriorCombat(ant, colony, targetColony, interior)) return;
    if (ant.state === AntState.DEAD) return;

    if (this.metabolism.consumeEnergy(
      ant,
      0,
      deltaSeconds,
      colonyConfig.carryingEnergyMultiplier,
      this.basalRateFor(ant, colonyConfig),
      1,
      1,
    )) {
      this.handleDeath(ant, "STARVATION", colony);
      return;
    }

    const fleeing = ant.raidCargo > 0 || this.metabolism.needsFood(ant);
    const targetType = fleeing ? NestChamberType.ENTRANCE : NestChamberType.STORAGE;
    const currentTargetType = ant.nestTargetChamberId
      ? interior.chambers.get(ant.nestTargetChamberId)?.type
      : null;
    if (!ant.nestPath || currentTargetType !== targetType) {
      const targetChamber = interior.leastLoadedChamberOfType(targetType);
      ant.nestTargetChamberId = targetChamber.id;
      ant.nestPath = interior.path(ant.nestChamberId ?? NestChamberType.ENTRANCE, targetChamber.id);
      ant.nestPathIndex = 0;
    }
    const waypointId = ant.nestPath[ant.nestPathIndex];
    const targetConfig = this.colonyConfigs.get(targetColony.id);
    const speedMultiplier = this.nestCongestionMultiplier(interior, waypointId, targetConfig);
    const arrived = this.nestNavigationSystem.moveToward(
      ant,
      interior.getChamber(waypointId).position,
      colonyConfig.nestInteriorSpeed * speedMultiplier,
      deltaSeconds,
      colonyConfig.nestChamberArrivalRadius,
    );
    if (!arrived) return;
    if (ant.nestPathIndex < ant.nestPath.length - 1) {
      ant.nestPathIndex += 1;
      return;
    }

    interior.moveAntToChamber(ant, ant.nestTargetChamberId);
    ant.nestPath = null;
    ant.nestPathIndex = 0;

    if (targetType === NestChamberType.STORAGE) {
      const raid = this.raids.get(ant.raidId);
      if (raid) this.attemptPillage(ant, colony, raid);
    } else if (targetType === NestChamberType.ENTRANCE) {
      interior.removeAnt(ant);
      ant.locationType = "WORLD";
      ant.nestId = null;
      ant.nestChamberId = null;
      ant.nestPosition = null;
      ant.state = AntState.RETURNING_HOME;
      ant.direction += Math.PI;
      this.emitEvent("RAIDER_EXITED_NEST", {
        colonyId: colony.id,
        antId: ant.id,
        targetColonyId: targetColony.id,
      });
    }
  }

  nestDefensePriorityMultiplier(chamberId, interior, targetConfig) {
    const type = interior.chambers.get(chamberId)?.type;
    if (type === NestChamberType.QUEEN) return targetConfig.nestDefenseQueenMultiplier;
    if (type === NestChamberType.BROOD) return targetConfig.nestDefenseBroodMultiplier;
    return 1;
  }

  // Un seul point de résolution par combat intérieur (déclenché uniquement
  // depuis le tick de l'intrus, jamais depuis celui du défenseur — voir
  // updateNestAnt/DEFENDING_INSIDE) : échanges de coups mutuels et
  // déterministes, réutilisant les mêmes réglages de dégâts que le combat
  // extérieur (`combatDamageRandomMin/Max`), mais volontairement plus
  // simple — pas de menace/fuite, juste un échange jusqu'à la mort ou le
  // départ de l'un des deux. Retourne true si un combat a occupé le tick de
  // l'intrus (donc pas de déplacement ce tick-là).
  resolveInteriorCombat(intruder, attackerColony, targetColony, interior) {
    const targetConfig = this.colonyConfigs.get(targetColony.id);
    if (!this.config.combatEnabled || !targetConfig.nestIntrusionEnabled) return false;
    const defender = targetColony.ants.find((candidate) => (
      candidate.state !== AntState.DEAD
      && candidate.caste === Caste.SOLDIER
      && candidate.locationType === "NEST"
      && candidate.nestId === targetColony.id
      && candidate.nestChamberId === intruder.nestChamberId
      && (candidate.state === AntState.IN_NEST || candidate.state === AntState.DEFENDING_INSIDE)
    ));
    if (!defender) return false;
    defender.state = AntState.DEFENDING_INSIDE;
    const priorityMultiplier = this.nestDefensePriorityMultiplier(intruder.nestChamberId, interior, targetConfig);
    const damageRange = targetConfig.combatDamageRandomMax - targetConfig.combatDamageRandomMin;

    if (defender.combatCooldown <= 0) {
      const roll = targetConfig.combatDamageRandomMin + this.intrusionRandom() * damageRange;
      intruder.health -= defender.attackPower * priorityMultiplier * roll;
      defender.combatCooldown = targetConfig.combatAttackCooldownTicks;
      this.emitEvent("NEST_INTERIOR_COMBAT", {
        colonyId: targetColony.id,
        defenderId: defender.id,
        intruderColonyId: attackerColony.id,
        intruderId: intruder.id,
        chamberId: intruder.nestChamberId,
      });
      if (intruder.health <= 0) {
        intruder.state = AntState.DEAD;
        this.handleDeath(intruder, "COMBAT", attackerColony, {
          killerColony: targetColony,
          killerCaste: defender.caste,
          killerIsDefending: true,
          killerId: defender.id,
        });
        return true;
      }
    }
    if (intruder.combatCooldown <= 0) {
      const roll = targetConfig.combatDamageRandomMin + this.intrusionRandom() * damageRange;
      defender.health -= intruder.attackPower * roll;
      intruder.combatCooldown = targetConfig.combatAttackCooldownTicks;
      if (defender.health <= 0) {
        defender.state = AntState.DEAD;
        this.handleDeath(defender, "COMBAT", targetColony, {
          killerColony: attackerColony,
          killerCaste: intruder.caste,
          killerIsDefending: false,
          killerId: intruder.id,
        });
      }
    }
    return true;
  }

  attemptPillage(ant, colony, raid) {
    const colonyConfig = this.colonyConfigs.get(colony.id);
    if (!colonyConfig.pillageEnabled || ant.raidCargo > 0) return;
    const targetColony = this.colonies.find((candidate) => candidate.id === raid.targetColonyId);
    if (!targetColony) return;
    const stolen = targetColony.takeStock(ant.raidCarryCapacity);
    if (stolen <= 0) return;
    ant.raidCargo = stolen;
    colony.foodStolen += stolen;
    targetColony.foodLostToRaids += stolen;
    this.emitEvent("FOOD_STOLEN", {
      colonyId: colony.id,
      antId: ant.id,
      targetColonyId: targetColony.id,
      amount: stolen,
    });
  }

  depositLoot(ant, colony) {
    const amount = ant.raidCargo;
    if (amount <= 0) return;
    ant.raidCargo = 0;
    colony.depositFood(amount);
    colony.foodRecovered += amount;
    colony.raidersReturnedWithLoot += 1;
    this.emitEvent("RAIDER_RETURNED_WITH_LOOT", { colonyId: colony.id, antId: ant.id, amount });
  }

  dropLoot(ant, colony) {
    const amount = ant.raidCargo;
    if (amount <= 0) return;
    ant.raidCargo = 0;
    const drop = new FoodSource({
      id: `LOOT-${colony.id}-${ant.id}-${this.tickCount}`,
      x: ant.position.x,
      y: ant.position.y,
      quantity: amount,
      radius: this.config.foodSourceRadius,
    });
    this.foodSources.push(drop);
    colony.foodDropped += amount;
    colony.raidersKilledWithLoot += 1;
    this.emitEvent("RAID_LOOT_DROPPED", {
      colonyId: colony.id,
      antId: ant.id,
      amount,
      position: { ...ant.position },
    });
  }

  resolveRaidMemberOutcome(ant, colony, outcome) {
    const raid = this.raids.get(ant.raidId);
    ant.raidId = null;
    if (!raid) return;
    if (outcome === "DEAD") {
      raid.deadIds.add(ant.id);
      colony.raidersLost += 1;
    } else {
      raid.returnedIds.add(ant.id);
      if (outcome === "RETURNED") {
        ant.state = AntState.SEARCHING_FOOD;
        ant.returnReason = null;
      }
    }
    const accountedFor = raid.returnedIds.size + raid.deadIds.size;
    if (accountedFor < raid.memberIds.size) return;
    raid.state = raid.returnedIds.size > 0 ? RaidState.COMPLETE : RaidState.FAILED;
    if (raid.state === RaidState.COMPLETE) colony.raidsCompleted += 1;
    else colony.raidsFailed += 1;
    this.emitEvent("RAID_RETURNED", {
      raidId: raid.id,
      colonyId: colony.id,
      targetColonyId: raid.targetColonyId,
      outcome: raid.state,
      survivors: raid.returnedIds.size,
      losses: raid.deadIds.size,
    });
    this.raids.delete(raid.id);
  }

  requestRaid(sourceColonyId, targetColonyId, groupSize) {
    const colony = this.colonies.find((candidate) => candidate.id === sourceColonyId);
    if (!colony) return null;
    const colonyConfig = this.colonyConfigs.get(sourceColonyId);
    const raid = this.raidSystem.createRaid(
      colony,
      targetColonyId,
      groupSize ?? colonyConfig.raidGroupSize,
      this.tickCount,
    );
    if (!raid) return null;
    this.raids.set(raid.id, raid);
    colony.raidsStarted += 1;
    colony.raidersSent += raid.memberIds.size;
    this.emitEvent("RAID_CREATED", {
      raidId: raid.id,
      colonyId: colony.id,
      targetColonyId,
      memberCount: raid.memberIds.size,
    });
    this.emitEvent("RAID_DEPARTED", { raidId: raid.id, colonyId: colony.id, targetColonyId });
    return raid;
  }

  emitEvent(type, details = {}) {
    this.tickEvents.push({ tick: this.tickCount, type, ...details });
  }

  colonyForAnt(ant) {
    const colony = this.colonies.find((candidate) => candidate.id === ant.colonyId);
    if (!colony) throw new Error(`Unknown ant colony: ${ant.colonyId}`);
    return colony;
  }

  removeColony(colonyId) {
    if (this.colonies.length <= 1) return false;
    const index = this.colonies.findIndex((colony) => colony.id === colonyId);
    if (index < 0) return false;
    const removed = this.colonies[index];
    this.removedColonyFood += removed.foodStock
      + removed.consumedFood
      + removed.ants.reduce((sum, ant) => sum + ant.carryingFoodAmount + ant.raidCargo, 0);
    this.colonies.splice(index, 1);
    this.colonyConfigs.delete(colonyId);
    this.colonyPheromones.fields.delete(colonyId);
    this.broodSystems.delete(colonyId);
    this.nextAntIds.delete(colonyId);
    this.previousForeignContacts.clear();
    this.colony = this.colonies[0];
    this.pheromoneField = this.colonyPheromones.get(this.colony.id);
    this.broodSystem = this.broodSystems.get(this.colony.id);
    this.territoryMap.update(this.pheromoneFields, this.colonies.map(({ id }) => id), {
      minimumInfluence: this.config.territoryMinimumInfluence,
      contestThreshold: this.config.territoryContestThreshold,
    });
    this.emitEvent("COLONY_REMOVED", { colonyId });
    return true;
  }

  updateForeignContacts() {
    this.newForeignContactsThisTick = new Map();
    if (this.colonies.length < 2) {
      this.currentForeignContacts = [];
      return;
    }
    const contacts = this.foreignAntDetection.update(this.colonies, this.config.foreignDetectionRadius);
    this.currentForeignContacts = contacts;
    const current = new Set(contacts.map(({ key }) => key));
    for (const contact of contacts) {
      if (this.previousForeignContacts.has(contact.key)) continue;
      this.foreignContacts += 1;
      const firstColony = this.colonyForAnt(contact.first);
      const secondColony = this.colonyForAnt(contact.second);
      firstColony.foreignContacts += 1;
      secondColony.foreignContacts += 1;
      this.newForeignContactsThisTick.set(
        firstColony.id,
        (this.newForeignContactsThisTick.get(firstColony.id) ?? 0) + 1,
      );
      this.newForeignContactsThisTick.set(
        secondColony.id,
        (this.newForeignContactsThisTick.get(secondColony.id) ?? 0) + 1,
      );
      this.emitEvent("FOREIGN_CONTACT", {
        colonyId: firstColony.id,
        antId: contact.first.id,
        foreignColonyId: secondColony.id,
        foreignAntId: contact.second.id,
      });
      this.applyEncounterReaction(contact.first, firstColony);
      this.applyEncounterReaction(contact.second, secondColony);
    }
    this.previousForeignContacts = current;
  }

  applyEncounterReaction(ant, colony) {
    const colonyConfig = this.colonyConfigs.get(ant.colonyId);
    const threshold = ant.caste === Caste.SOLDIER
      ? colonyConfig.soldierEncounterAvoidanceThreshold
      : colonyConfig.encounterAvoidanceThreshold;
    const reaction = this.encounterReaction.evaluate(ant, threshold);
    if (reaction !== EncounterReaction.AVOID) return;
    const otherId = ant.nearbyForeignAnts[0];
    const other = this.colonies
      .flatMap((candidate) => candidate.ants)
      .find((candidate) => candidate.id === otherId);
    if (other) {
      const dx = ant.position.x - other.position.x;
      const dy = ant.position.y - other.position.y;
      ant.direction = (dx === 0 && dy === 0) ? ant.direction : Math.atan2(dy, dx);
    }
    this.avoidedContacts += 1;
    colony.avoidedContacts += 1;
    this.emitEvent("FOREIGN_AVOIDANCE", { colonyId: colony.id, antId: ant.id });
  }

  basalRateFor(ant, colonyConfig) {
    return colonyConfig.basalEnergyConsumptionRate
      * (ant.caste === Caste.SOLDIER ? colonyConfig.soldierBasalEnergyMultiplier : 1);
  }

  countNearbyAllies(ant, colony, radius) {
    const radiusSquared = radius * radius;
    let count = 0;
    for (const other of colony.ants) {
      if (other === ant || other.state === AntState.DEAD) continue;
      const dx = other.position.x - ant.position.x;
      const dy = other.position.y - ant.position.y;
      if (dx * dx + dy * dy <= radiusSquared) count += 1;
    }
    return count;
  }

  resolveCombat() {
    if (this.colonies.length < 2) return;
    const combatRadiusSquared = this.config.combatRadius * this.config.combatRadius;
    const nearby = this.currentForeignContacts.filter(({ first, second }) => {
      const dx = first.position.x - second.position.x;
      const dy = first.position.y - second.position.y;
      return dx * dx + dy * dy <= combatRadiusSquared;
    });
    if (nearby.length === 0) {
      this.updateCombatLifecycle([]);
      return;
    }

    const stances = new Map();
    const intents = [];
    const evaluated = new Set();
    for (const { first, second } of nearby) {
      for (const [ant, opponent] of [[first, second], [second, first]]) {
        if (evaluated.has(ant.id)) continue;
        evaluated.add(ant.id);
        const colonyConfig = this.colonyConfigs.get(ant.colonyId);
        if (!colonyConfig.combatEnabled) continue;
        const colony = this.colonyForAnt(ant);
        const opponentColony = this.colonyForAnt(opponent);
        const allyCount = this.countNearbyAllies(ant, colony, colonyConfig.foreignDetectionRadius);
        const ownField = this.colonyPheromones.get(ant.colonyId);
        const foreignField = this.colonyPheromones.get(opponent.colonyId);
        const ownInfluence = ownField.sample(PheromoneType.TERRITORY, ant.position) / ownField.maxIntensity;
        const foreignInfluence = foreignField.sample(PheromoneType.TERRITORY, ant.position)
          / foreignField.maxIntensity;
        const isSoldier = ant.caste === Caste.SOLDIER;
        const stance = this.encounterReaction.evaluateStance(ant, {
          allyCount,
          enemyCount: ant.nearbyForeignAnts.length,
          territorialAdvantage: ownInfluence - foreignInfluence,
          numbersWeight: colonyConfig.combatNumbersAdvantageWeight,
          territoryWeight: colonyConfig.combatTerritorialAdvantageWeight,
          threatenThreshold: isSoldier
            ? colonyConfig.soldierCombatThreatenThreshold
            : colonyConfig.combatThreatenThreshold,
          attackThreshold: isSoldier
            ? colonyConfig.soldierCombatAttackThreshold
            : colonyConfig.combatAttackThreshold,
          fleeHealthRatio: isSoldier
            ? colonyConfig.soldierCombatFleeHealthRatio
            : colonyConfig.combatFleeHealthRatio,
        });
        stances.set(ant.id, { stance, ant, opponent, colony, opponentColony });
        if (stance === EncounterReaction.ATTACK) {
          intents.push({ attacker: ant, defender: opponent, colony, opponentColony });
        }
      }
    }

    for (const { stance, ant, opponent, colony, opponentColony } of stances.values()) {
      if (stance === EncounterReaction.AVOID) {
        const dx = ant.position.x - opponent.position.x;
        const dy = ant.position.y - opponent.position.y;
        ant.direction = (dx === 0 && dy === 0) ? ant.direction : Math.atan2(dy, dx);
      } else if (stance === EncounterReaction.THREATEN) {
        this.applyThreaten(ant, opponent, colony, opponentColony);
      }
    }

    for (const { attacker, defender, colony, opponentColony } of intents) {
      this.resolveAttack(attacker, defender, colony, opponentColony);
    }

    const stillNearby = nearby.filter(({ first, second }) => (
      first.state !== AntState.DEAD && second.state !== AntState.DEAD
    ));
    this.updateCombatLifecycle(stillNearby);
  }

  applyThreaten(ant, opponent, colony, opponentColony) {
    const colonyConfig = this.colonyConfigs.get(ant.colonyId);
    const field = this.colonyPheromones.get(ant.colonyId);
    const dx = opponent.position.x - ant.position.x;
    const dy = opponent.position.y - ant.position.y;
    ant.direction = (dx === 0 && dy === 0) ? ant.direction : Math.atan2(dy, dx);
    field.deposit(PheromoneType.TERRITORY, ant.position, colonyConfig.combatThreatenTerritoryStrength);
    field.deposit(PheromoneType.ALARM, ant.position, colonyConfig.combatThreatenAlarmStrength);
    this.threats += 1;
    colony.threats += 1;
    this.emitEvent("FOREIGN_THREAT", {
      colonyId: colony.id,
      antId: ant.id,
      foreignColonyId: opponentColony.id,
      foreignAntId: opponent.id,
    });
  }

  resolveAttack(attacker, defender, colony, opponentColony) {
    const attackerConfig = this.colonyConfigs.get(attacker.colonyId);
    const key = pairKey(attacker, defender);
    if (!this.activeCombats.has(key)) {
      this.activeCombats.set(key, {
        firstId: attacker.id,
        firstColonyId: colony.id,
        secondId: defender.id,
        secondColonyId: opponentColony.id,
      });
      this.fights += 1;
      colony.fights += 1;
      opponentColony.fights += 1;
      this.emitEvent("COMBAT_STARTED", {
        colonyId: colony.id,
        antId: attacker.id,
        foreignColonyId: opponentColony.id,
        foreignAntId: defender.id,
        position: { ...attacker.position },
      });
    }
    const roll = deterministicEventRoll(this.config.seed, this.tickCount, attacker.id, defender.id);
    const randomFactor = attackerConfig.combatDamageRandomMin
      + roll * (attackerConfig.combatDamageRandomMax - attackerConfig.combatDamageRandomMin);
    const damage = attacker.attackPower * randomFactor;
    defender.health -= damage;
    attacker.energy = Math.max(0, attacker.energy - attackerConfig.combatAttackEnergyCost);
    attacker.combatCooldown = attackerConfig.combatAttackCooldownTicks;
    this.attacks += 1;
    colony.attacks += 1;
    this.damageDealt += damage;
    colony.damageDealt += damage;
    this.emitEvent("ANT_ATTACKED", {
      colonyId: colony.id,
      antId: attacker.id,
      foreignColonyId: opponentColony.id,
      foreignAntId: defender.id,
      damage,
      position: { ...attacker.position },
    });
    if (defender.health <= 0 && defender.state !== AntState.DEAD) {
      defender.state = AntState.DEAD;
      this.handleDeath(defender, "COMBAT", opponentColony, {
        killerId: attacker.id,
        killerColony: colony,
        killerCaste: attacker.caste,
        killerIsDefending: attacker.state === AntState.DEFENDING,
      });
    }
  }

  updateThreatPressure() {
    for (const colony of this.colonies) {
      const colonyConfig = this.colonyConfigs.get(colony.id);
      if (!colonyConfig.castesEnabled) continue;
      const field = this.colonyPheromones.get(colony.id);
      const alarmAtNest = field.sample(PheromoneType.ALARM, colony.nest.position) / field.maxIntensity;
      const newContacts = this.newForeignContactsThisTick.get(colony.id) ?? 0;
      const newDeaths = this.newCombatLossesThisTick.get(colony.id) ?? 0;
      const newNestContacts = this.newNestThreatContactsThisTick.get(colony.id) ?? 0;
      colony.threatPressure = colony.threatPressure * colonyConfig.threatPressureDecay
        + newContacts * colonyConfig.threatPressureContactWeight
        + newDeaths * colonyConfig.threatPressureDeathWeight
        + newNestContacts * colonyConfig.threatPressureNestProximityWeight
        + alarmAtNest * colonyConfig.threatPressureAlarmWeight;
    }
  }

  updateCombatLifecycle(stillNearbyPairs) {
    const currentKeys = new Set(stillNearbyPairs.map(({ first, second }) => pairKey(first, second)));
    for (const [key, info] of [...this.activeCombats]) {
      if (currentKeys.has(key)) continue;
      this.emitEvent("COMBAT_ENDED", {
        colonyId: info.firstColonyId,
        antId: info.firstId,
        foreignColonyId: info.secondColonyId,
        foreignAntId: info.secondId,
      });
      this.activeCombats.delete(key);
    }
  }

  spawnWorker(colony = this.colony, caste = Caste.WORKER) {
    const colonyConfig = this.colonyConfigs.get(colony.id);
    const isSoldier = caste === Caste.SOLDIER;
    const nest = colony.nest;
    const angle = this.birthRandom() * Math.PI * 2;
    const distance = this.birthRandom() * nest.radius * 0.55;
    const ant = new Ant({
      id: this.colonies.length === 1
        ? `ANT-${String(this.nextAntIds.get(colony.id)).padStart(3, "0")}`
        : `${colony.id}-ANT-${String(this.nextAntIds.get(colony.id)).padStart(3, "0")}`,
      position: {
        x: nest.position.x + Math.cos(angle) * distance,
        y: nest.position.y + Math.sin(angle) * distance,
      },
      direction: this.birthRandom() * Math.PI * 2,
      speed: colonyConfig.antSpeed * (0.75 + this.birthRandom() * 0.5)
        * (isSoldier ? colonyConfig.soldierSpeedMultiplier : 1),
      colonyId: colony.id,
      energy: colonyConfig.antMaxEnergy,
      maxEnergy: colonyConfig.antMaxEnergy,
      energyConsumptionRate: colonyConfig.energyConsumptionRate
        * (isSoldier ? colonyConfig.soldierEnergyConsumptionMultiplier : 1),
      lowEnergyThreshold: colonyConfig.lowEnergyThreshold,
      maxHealth: isSoldier ? colonyConfig.soldierMaxHealth : colonyConfig.combatMaxHealth,
      attackPower: isSoldier ? colonyConfig.soldierAttackPower : colonyConfig.combatAttackPower,
      caste,
      raidCarryCapacity: colonyConfig.raidCarryCapacity,
    });
    this.nextAntIds.set(colony.id, this.nextAntIds.get(colony.id) + 1);
    colony.ants.push(ant);
    this.rememberCell(ant);
    return ant;
  }

  senseTrail(ant, type) {
    const field = this.colonyPheromones.get(ant.colonyId);
    const config = this.colonyConfigs.get(ant.colonyId);
    return this.pheromoneSensing.suggestDirection(ant, field, type, {
      distance: config.pheromoneSenseDistance,
      arc: config.pheromoneSenseArc,
      samples: config.pheromoneSenseSamples,
      minimumSignal: config.pheromoneMinSignal,
      revisitPenalty: config.pheromoneRevisitPenalty,
    });
  }

  scoreDirection(ant, state) {
    const config = this.colonyConfigs.get(ant.colonyId);
    const field = this.colonyPheromones.get(ant.colonyId);
    if (!config.pheromonesEnabled) return null;
    const returning = state === AntState.RETURNING_HOME;
    const isSoldier = ant.caste === Caste.SOLDIER;
    const foreignFields = this.colonies.length > 1
      && (config.territoryPheromonesEnabled || isSoldier)
      ? this.colonies
        .filter((colony) => colony.id !== ant.colonyId)
        .map((colony) => this.colonyPheromones.get(colony.id))
      : [];
    return this.directionScoring.suggestDirection(ant, field, {
      distance: config.pheromoneSenseDistance,
      arc: config.pheromoneSenseArc,
      samples: config.pheromoneSenseSamples,
      minimumSignal: config.pheromoneMinSignal / field.maxIntensity,
      minimumAlarmSignal: config.alarmMinimumIntensity / field.maxIntensity,
      revisitPenalty: config.pheromoneRevisitPenalty,
      foodWeight: !returning && config.foodPheromonesEnabled && !isSoldier
        ? config.pheromoneInfluence
        : 0,
      homeWeight: returning && config.homePheromonesEnabled
        ? config.homeTrailInfluence
        : 0,
      // Un soldat est attiré par l'ALARM propre (rallie la perturbation) et le
      // TERRITORY étranger (intercepte les intruses) au lieu d'être repoussé :
      // même mécanisme de répulsion, poids négatif.
      alarmWeight: isSoldier
        ? (config.alarmPheromonesEnabled ? -config.soldierAlarmRallyWeight : 0)
        : (config.alarmPheromonesEnabled ? config.alarmInfluence : 0),
      foreignFields,
      territoryWeight: isSoldier
        ? -config.soldierTerritoryInterceptWeight
        : config.territoryAvoidanceInfluence,
      inertiaWeight: config.navigationInertia,
      noiseWeight: config.navigationNoise,
      baseInfluence: returning ? config.homeTrailInfluence : config.pheromoneInfluence,
    });
  }

  depositTrail(ant) {
    const config = this.colonyConfigs.get(ant.colonyId);
    return this.pheromoneDeposit.deposit(ant, this.colonyPheromones.get(ant.colonyId), {
      foodEnabled: config.foodPheromonesEnabled,
      homeEnabled: config.homePheromonesEnabled,
      foodStrength: config.foodDepositStrength,
      homeStrength: config.homeDepositStrength,
      homeFalloffDistance: config.homeFalloffDistance,
      territoryEnabled: config.territoryPheromonesEnabled,
      territoryStrength: config.territoryDepositStrength,
      territoryFalloffDistance: config.territoryFalloffDistance,
    });
  }

  rememberCell(ant) {
    const field = this.colonyPheromones.get(ant.colonyId);
    const config = this.colonyConfigs.get(ant.colonyId);
    const cell = field.indexAt(ant.position);
    if (cell < 0) return;
    this.exploredCells.add(cell);
    if (ant.recentCells.at(-1) === cell) return;
    ant.recentCells.push(cell);
    if (ant.recentCells.length > config.recentCellMemory) ant.recentCells.shift();
  }

  run(ticks, { stopWhen = () => false, onTick = () => {} } = {}) {
    if (!Number.isInteger(ticks) || ticks < 0) {
      throw new TypeError("ticks must be a non-negative integer");
    }
    const target = this.tickCount + ticks;
    while (this.tickCount < target && !stopWhen(this)) {
      this.tick();
      onTick(this);
    }
    return this;
  }

  getState() {
    const clone = (value) => JSON.parse(JSON.stringify(value));
    const colonyPheromones = Object.fromEntries(this.colonies.map((colony) => [
      colony.id,
      Object.fromEntries(Object.values(PheromoneType).map((type) => [
        type,
        Array.from(this.colonyPheromones.get(colony.id).layer(type)),
      ])),
    ]));
    return {
      schemaVersion: 1,
      tick: this.tickCount,
      elapsedMs: this.elapsedMs,
      config: toVersionedConfig(this.config),
      colony: clone(this.colony),
      colonies: clone(this.colonies),
      foodSources: clone(this.foodSources),
      dangerZones: clone(this.dangerZones),
      environment: clone(this.currentEnvironment),
      pheromones: colonyPheromones[this.colony.id],
      colonyPheromones,
      territory: {
        cells: [...this.territoryMap.cells],
        stats: this.territoryMap.getStats(),
      },
      foreignContacts: this.foreignContacts,
      metrics: this.getMetrics(),
    };
  }

  getColonyMetrics(colonyOrId) {
    const colony = typeof colonyOrId === "string"
      ? this.colonies.find((candidate) => candidate.id === colonyOrId)
      : colonyOrId;
    if (!colony) throw new Error(`Unknown colony: ${colonyOrId}`);
    const field = this.colonyPheromones.get(colony.id);
    const broodSystem = this.broodSystems.get(colony.id);
    const foodPheromones = field.getStats(PheromoneType.FOOD);
    const homePheromones = field.getStats(PheromoneType.HOME);
    const alarmPheromones = field.getStats(PheromoneType.ALARM);
    const territoryPheromones = field.getStats(PheromoneType.TERRITORY);
    const livingAnts = colony.ants.filter((ant) => ant.state !== AntState.DEAD);
    const energies = livingAnts.map((ant) => ant.energy);
    const broodCounts = {
      eggs: colony.brood.filter((brood) => brood.stage === BroodStage.EGG).length,
      larvae: colony.brood.filter((brood) => brood.stage === BroodStage.LARVA).length,
      pupae: colony.brood.filter((brood) => brood.stage === BroodStage.PUPA).length,
    };
    const averageWorkerAge = livingAnts.length === 0
      ? 0
      : livingAnts.reduce((total, ant) => total + ant.age, 0) / livingAnts.length;
    const averageEnergy = energies.length === 0
      ? 0
      : energies.reduce((total, energy) => total + energy, 0) / energies.length;
    const averageNestDistance = livingAnts.length === 0 ? 0 : livingAnts.reduce((sum, ant) => (
      sum + Math.hypot(
        ant.position.x - colony.nest.position.x,
        ant.position.y - colony.nest.position.y,
      )
    ), 0) / livingAnts.length;
    const totalCollected = this.colonies.reduce((sum, candidate) => sum + candidate.resources, 0);
    const deaths = colony.ants.length - livingAnts.length;
    return {
      id: colony.id,
      name: colony.name,
      color: colony.color,
      livingAnts: livingAnts.length,
      totalAnts: colony.ants.length,
      totalPopulation: livingAnts.length + colony.brood.length + 1,
      maxPopulation: colony.maxPopulation,
      deadAnts: deaths,
      restingAnts: livingAnts.filter((ant) => ant.state === AntState.RESTING).length,
      averageEnergy,
      minimumEnergy: energies.length === 0 ? 0 : Math.min(...energies),
      averageWorkerAge,
      averageNestDistance,
      births: colony.births,
      deaths,
      starvationDeaths: colony.starvationDeaths,
      environmentalDeaths: colony.environmentalDeaths,
      netGrowth: colony.births - deaths,
      eggs: broodCounts.eggs,
      larvae: broodCounts.larvae,
      pupae: broodCounts.pupae,
      broodSize: colony.brood.length,
      broodFoodCost: broodSystem.broodFoodConsumed,
      reproductionFoodCost: broodSystem.layingFoodConsumed,
      militaryFoodCost: broodSystem.militaryFoodConsumed,
      soldierCount: livingAnts.filter((ant) => ant.caste === Caste.SOLDIER).length,
      workerCount: livingAnts.filter((ant) => ant.caste === Caste.WORKER).length,
      soldierBirths: colony.soldierBirths,
      threatPressure: colony.threatPressure,
      workerKills: colony.workerKills,
      soldierKills: colony.soldierKills,
      workerLosses: colony.workerLosses,
      soldierLosses: colony.soldierLosses,
      resources: colony.resources,
      resourceShare: totalCollected === 0 ? 0 : colony.resources / totalCollected,
      foodStock: colony.foodStock,
      consumedFood: colony.consumedFood,
      foodBalance: colony.resources - colony.consumedFood,
      lostFood: colony.lostFood,
      carriedFood: colony.ants.reduce((sum, ant) => sum + ant.carryingFoodAmount, 0),
      carryingAnts: colony.ants.filter((ant) => ant.carryingFood).length,
      totalDistance: colony.totalDistance,
      totalPickups: colony.totalPickups,
      foreignContacts: colony.foreignContacts,
      avoidedContacts: colony.avoidedContacts,
      fights: colony.fights,
      attacks: colony.attacks,
      kills: colony.kills,
      combatLosses: colony.combatLosses,
      threats: colony.threats,
      damageDealt: colony.damageDealt,
      territoryCells: this.territoryMap.getStats().controlled[colony.id] ?? 0,
      enemyNestsDiscovered: colony.enemyNestsDiscovered,
      knownEnemyNests: colony.knownEnemyNests.size,
      raidsStarted: colony.raidsStarted,
      raidsCompleted: colony.raidsCompleted,
      raidsFailed: colony.raidsFailed,
      raidersSent: colony.raidersSent,
      raidersLost: colony.raidersLost,
      activeRaiders: colony.ants.filter((ant) => ant.raidId !== null).length,
      nestUnderThreat: colony.nestUnderThreat,
      raidersDetectedNearNest: colony.raidersDetectedNearNest,
      defenseActivations: colony.defenseActivations,
      defendersMobilized: colony.defendersMobilized,
      defendingNow: livingAnts.filter((ant) => ant.state === AntState.DEFENDING).length,
      defensiveKills: colony.defensiveKills,
      workersEvacuated: colony.workersEvacuated,
      nestAlarmIntensity: field.sample(PheromoneType.ALARM, colony.nest.position) / field.maxIntensity,
      foodStolen: colony.foodStolen,
      foodRecovered: colony.foodRecovered,
      foodDropped: colony.foodDropped,
      foodLostToRaids: colony.foodLostToRaids,
      raidersReturnedWithLoot: colony.raidersReturnedWithLoot,
      raidersKilledWithLoot: colony.raidersKilledWithLoot,
      raidCargoInTransit: colony.ants.reduce((sum, ant) => sum + ant.raidCargo, 0),
      antsOutside: livingAnts.filter((ant) => ant.locationType !== "NEST").length,
      antsInsideNest: livingAnts.filter((ant) => ant.locationType === "NEST").length,
      antsInStorage: livingAnts.filter((ant) => ant.nestChamberId === NestChamberType.STORAGE).length,
      antsInBroodChamber: livingAnts.filter((ant) => ant.nestChamberId === NestChamberType.BROOD).length,
      antsFeedingBrood: livingAnts.filter((ant) => ant.nestTask === NestTask.FEED_BROOD).length,
      antsTendingBrood: livingAnts.filter((ant) => ant.nestTask === NestTask.TEND_BROOD).length,
      antsBuilding: livingAnts.filter((ant) => ant.nestTask === NestTask.BUILD).length,
      broodFoodBuffer: colony.broodFoodBuffer,
      broodFoodDelivered: colony.broodFoodDelivered,
      chambersBuilt: colony.chambersBuilt,
      pendingConstructionSites: this.nestInteriors.get(colony.id)?.pendingSites.size ?? 0,
      antsRaidingInside: livingAnts.filter((ant) => ant.state === AntState.RAIDING_INSIDE).length,
      antsDefendingInside: livingAnts.filter((ant) => ant.state === AntState.DEFENDING_INSIDE).length,
      nestBreaches: colony.nestBreaches,
      foodPheromones,
      homePheromones,
      alarmPheromones,
      territoryPheromones,
    };
  }

  getMetrics() {
    const colonies = this.colonies.map((colony) => this.getColonyMetrics(colony));
    const livingCount = colonies.reduce((sum, colony) => sum + colony.livingAnts, 0);
    const allLivingAnts = this.colonies.flatMap((colony) => (
      colony.ants.filter((ant) => ant.state !== AntState.DEAD)
    ));
    const averageWorkerAge = livingCount === 0 ? 0 : colonies.reduce(
      (sum, colony) => sum + colony.averageWorkerAge * colony.livingAnts,
      0,
    ) / livingCount;
    const averageEnergy = livingCount === 0 ? 0 : colonies.reduce(
      (sum, colony) => sum + colony.averageEnergy * colony.livingAnts,
      0,
    ) / livingCount;
    const combinePheromones = (key) => ({
      total: colonies.reduce((sum, colony) => sum + colony[key].total, 0),
      activeCells: colonies.reduce((sum, colony) => sum + colony[key].activeCells, 0),
      maximum: Math.max(0, ...colonies.map((colony) => colony[key].maximum)),
    });
    const foodPheromones = combinePheromones("foodPheromones");
    const homePheromones = combinePheromones("homePheromones");
    const alarmPheromones = combinePheromones("alarmPheromones");
    const territoryPheromones = combinePheromones("territoryPheromones");
    const totals = (key) => colonies.reduce((sum, colony) => sum + colony[key], 0);
    const averageConsumptionPerTick = this.consumptionWindow.length === 0
      ? 0
      : this.consumptionWindowTotal / this.consumptionWindow.length;
    const foodStock = totals("foodStock");
    const resources = totals("resources");
    const consumedFood = totals("consumedFood");
    const deaths = totals("deaths");
    const territory = this.territoryMap.getStats();
    return {
      tick: this.tickCount,
      season: this.currentEnvironment.season,
      seasonLabel: SEASON_LABELS[this.currentEnvironment.season],
      seasonCycle: this.currentEnvironment.cycle,
      seasonCyclesCompleted: this.config.environmentEnabled
        ? Math.floor(this.tickCount / (Math.max(1, this.config.seasonDurationTicks) * 4))
        : 0,
      temperature: this.currentEnvironment.temperature,
      environmentalPressure: this.currentEnvironment.pressure,
      foodRegenerationMultiplier: this.currentEnvironment.foodRegenerationMultiplier,
      metabolismMultiplier: this.currentEnvironment.metabolismMultiplier,
      movementCostMultiplier: this.currentEnvironment.movementCostMultiplier,
      broodDevelopmentMultiplier: this.currentEnvironment.broodDevelopmentMultiplier,
      ants: livingCount,
      totalAnts: totals("totalAnts"),
      totalPopulation: totals("totalPopulation"),
      maxPopulation: this.maxPopulation,
      livingAnts: livingCount,
      deadAnts: deaths,
      restingAnts: totals("restingAnts"),
      averageEnergy,
      minimumEnergy: allLivingAnts.length === 0 ? 0 : Math.min(...allLivingAnts.map((ant) => ant.energy)),
      averageWorkerAge,
      births: this.births,
      deaths,
      starvationDeaths: this.starvationDeaths,
      environmentalDeaths: this.environmentalDeaths,
      dangerExposures: this.dangerExposures,
      dangerDistance: this.dangerDistance,
      damageAlarmDeposits: this.damageAlarmDeposits,
      deathAlarmDeposits: this.deathAlarmDeposits,
      netGrowth: this.births - deaths,
      birthRate: this.tickCount === 0 ? 0 : this.births / this.tickCount * 1000,
      deathRate: this.tickCount === 0
        ? 0
        : deaths / this.tickCount * 1000,
      eggs: totals("eggs"),
      larvae: totals("larvae"),
      pupae: totals("pupae"),
      broodSize: totals("broodSize"),
      broodFoodCost: totals("broodFoodCost"),
      reproductionFoodCost: totals("reproductionFoodCost"),
      foodSources: this.foodSources.filter((source) => source.active).length,
      foodRemaining: this.foodSources.reduce((total, source) => total + source.quantity, 0),
      resources,
      foodStock,
      consumedFood,
      averageConsumptionPerTick,
      autonomyTicks: averageConsumptionPerTick === 0
        ? null
        : foodStock / averageConsumptionPerTick,
      foodBalance: resources - consumedFood,
      collectionConsumptionRatio: consumedFood === 0
        ? null
        : resources / consumedFood,
      lostFood: this.lostFood,
      regeneratedFood: this.regeneratedFood,
      spawnedFood: this.spawnedFood,
      expiredFood: this.expiredFood,
      carriedFood: totals("carriedFood"),
      carryingAnts: totals("carryingAnts"),
      pheromoneTotal: foodPheromones.total + homePheromones.total + alarmPheromones.total
        + territoryPheromones.total,
      pheromoneCells: foodPheromones.activeCells
        + homePheromones.activeCells
        + alarmPheromones.activeCells
        + territoryPheromones.activeCells,
      pheromoneMaximum: Math.max(
        foodPheromones.maximum,
        homePheromones.maximum,
        alarmPheromones.maximum,
        territoryPheromones.maximum,
      ),
      foodPheromones,
      homePheromones,
      alarmPheromones,
      territoryPheromones,
      completionTick: this.completionTick,
      totalDistance: this.totalDistance,
      totalPickups: this.totalPickups,
      averageReturnTicks: this.completedReturns === 0
        ? 0
        : this.totalReturnTicks / this.completedReturns,
      averageDetourDistance: this.completedReturns === 0
        ? 0
        : this.totalDetourDistance / this.completedReturns,
      exploredCells: this.exploredCells.size,
      colonies,
      colonyCount: colonies.length,
      foreignContacts: this.foreignContacts,
      avoidedContacts: this.avoidedContacts,
      threats: this.threats,
      fights: this.fights,
      attacks: this.attacks,
      damageDealt: this.damageDealt,
      combatDeaths: this.combatDeaths,
      territory,
      contestedArea: territory.contested,
      elapsedMs: this.elapsedMs,
    };
  }
}
