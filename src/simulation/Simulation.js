import { RandomWalk } from "../behaviors/RandomWalk.js";
import { ReturnHomeBehavior } from "../behaviors/ReturnHomeBehavior.js";
import { SearchFoodBehavior } from "../behaviors/SearchFoodBehavior.js";
import { Ant, AntState } from "../entities/Ant.js";
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
    }
    const colonyOrder = this.tickCount % 2 === 0 ? this.colonies : [...this.colonies].reverse();
    for (const colony of colonyOrder) {
      const colonyConfig = this.colonyConfigs.get(colony.id);
      const field = this.colonyPheromones.get(colony.id);
      for (const ant of colony.ants) {
      if (ant.state === AntState.DEAD) continue;

      if (ant.state === AntState.RESTING) {
        ant.age += deltaSeconds;
        if (this.metabolism.consumeEnergy(
          ant,
          0,
          deltaSeconds,
          colonyConfig.carryingEnergyMultiplier,
          colonyConfig.basalEnergyConsumptionRate,
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
      } else {
        const food = this.foodDetection.findNearest(
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
        colonyConfig.basalEnergyConsumptionRate,
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
        if (this.foodCollection.deposit(ant, colony)) {
          this.completedReturns += 1;
          this.totalReturnTicks += this.tickCount - ant.returnStartedTick;
          this.totalDetourDistance += Math.max(0, ant.returnDistance - ant.directReturnDistance);
          ant.returnStartedTick = null;
          ant.returnDistance = 0;
          ant.directReturnDistance = 0;
        }
        if (this.homeDetection.isInside(ant, colony.nest)
          && this.metabolism.needsFood(ant)) {
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
    }
      const eggsBeforeUpdate = colony.queen.eggsLaid;
      const emergedWorkers = this.broodSystems.get(colony.id).update(
        colony,
        colonyConfig,
        this.currentEnvironment.broodDevelopmentMultiplier,
      );
      if (colony.queen.eggsLaid > eggsBeforeUpdate) {
        this.emitEvent("QUEEN_LAID_EGG", { queenId: colony.queen.id, colonyId: colony.id });
      }
      for (let index = 0; index < emergedWorkers; index += 1) this.spawnWorker(colony);
      if (emergedWorkers > 0) {
        this.emitEvent("WORKERS_EMERGED", { count: emergedWorkers, colonyId: colony.id });
      }
      colony.births += emergedWorkers;
      this.births += emergedWorkers;
      const colonyPopulation = colony.ants.filter((ant) => ant.state !== AntState.DEAD).length
        + colony.brood.length + 1;
      colony.maxPopulation = Math.max(colony.maxPopulation, colonyPopulation);
    }
    this.updateForeignContacts();
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

  handleDeath(ant, cause = "STARVATION", colony = this.colonyForAnt(ant)) {
    const colonyConfig = this.colonyConfigs.get(colony.id);
    const field = this.colonyPheromones.get(colony.id);
    if (cause === "ENVIRONMENT") {
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
      + removed.ants.reduce((sum, ant) => sum + ant.carryingFoodAmount, 0);
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
    if (this.colonies.length < 2) return;
    const contacts = this.foreignAntDetection.update(this.colonies, this.config.foreignDetectionRadius);
    const current = new Set(contacts.map(({ key }) => key));
    for (const contact of contacts) {
      if (this.previousForeignContacts.has(contact.key)) continue;
      this.foreignContacts += 1;
      const firstColony = this.colonyForAnt(contact.first);
      const secondColony = this.colonyForAnt(contact.second);
      firstColony.foreignContacts += 1;
      secondColony.foreignContacts += 1;
      this.emitEvent("FOREIGN_CONTACT", {
        colonyId: firstColony.id,
        antId: contact.first.id,
        foreignColonyId: secondColony.id,
        foreignAntId: contact.second.id,
      });
    }
    this.previousForeignContacts = current;
  }

  spawnWorker(colony = this.colony) {
    const colonyConfig = this.colonyConfigs.get(colony.id);
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
      speed: colonyConfig.antSpeed * (0.75 + this.birthRandom() * 0.5),
      colonyId: colony.id,
      energy: colonyConfig.antMaxEnergy,
      maxEnergy: colonyConfig.antMaxEnergy,
      energyConsumptionRate: colonyConfig.energyConsumptionRate,
      lowEnergyThreshold: colonyConfig.lowEnergyThreshold,
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
    return this.directionScoring.suggestDirection(ant, field, {
      distance: config.pheromoneSenseDistance,
      arc: config.pheromoneSenseArc,
      samples: config.pheromoneSenseSamples,
      minimumSignal: config.pheromoneMinSignal / field.maxIntensity,
      minimumAlarmSignal: config.alarmMinimumIntensity / field.maxIntensity,
      revisitPenalty: config.pheromoneRevisitPenalty,
      foodWeight: !returning && config.foodPheromonesEnabled
        ? config.pheromoneInfluence
        : 0,
      homeWeight: returning && config.homePheromonesEnabled
        ? config.homeTrailInfluence
        : 0,
      alarmWeight: config.alarmPheromonesEnabled ? config.alarmInfluence : 0,
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
      territoryCells: this.territoryMap.getStats().controlled[colony.id] ?? 0,
      foodPheromones,
      homePheromones,
      alarmPheromones,
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
      pheromoneTotal: foodPheromones.total + homePheromones.total + alarmPheromones.total,
      pheromoneCells: foodPheromones.activeCells
        + homePheromones.activeCells
        + alarmPheromones.activeCells,
      pheromoneMaximum: Math.max(
        foodPheromones.maximum,
        homePheromones.maximum,
        alarmPheromones.maximum,
      ),
      foodPheromones,
      homePheromones,
      alarmPheromones,
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
      territory,
      contestedArea: territory.contested,
      elapsedMs: this.elapsedMs,
    };
  }
}
