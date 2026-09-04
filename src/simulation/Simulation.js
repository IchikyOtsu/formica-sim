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
import { normalizeConfig, toVersionedConfig } from "../config/ConfigSchema.js";
import { DEFAULT_CONFIG } from "./SimulationConfig.js";
import { PheromoneField, PheromoneType } from "./PheromoneField.js";
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
    this.pheromoneField = new PheromoneField(
      this.config.width,
      this.config.height,
      this.config.pheromoneCellSize,
      this.config.pheromoneMaxIntensity,
    );
    const nestConfig = this.config.nest;
    const nest = new Nest(nestConfig.x, nestConfig.y, nestConfig.radius);
    this.colony = new Colony({
      id: "C-01",
      nest,
      initialFoodStock: this.config.initialFoodStock,
    });
    this.colony.queen = new Queen({
      id: "QUEEN-01",
      colonyId: this.colony.id,
      position: nest.position,
      layingCooldownTicks: this.config.queenLayingCooldownTicks,
    });
    this.broodSystem = new BroodSystem();
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
    this.starvationDeaths = 0;
    this.environmentalDeaths = 0;
    this.consumptionWindow = [];
    this.consumptionWindowTotal = 0;
    this.births = 0;
    this.nextAntId = this.config.initialAnts + 1;
    this.maxPopulation = this.config.initialAnts + 1;
    this.tickEvents = [];

    for (let index = 0; index < this.config.initialAnts; index += 1) {
      const angle = this.random() * Math.PI * 2;
      const distance = this.random() * nest.radius * 0.72;
      this.colony.ants.push(new Ant({
        id: `ANT-${String(index + 1).padStart(3, "0")}`,
        position: {
          x: nest.position.x + Math.cos(angle) * distance,
          y: nest.position.y + Math.sin(angle) * distance,
        },
        direction: this.random() * Math.PI * 2,
        speed: this.config.antSpeed * (0.75 + this.random() * 0.5),
        colonyId: this.colony.id,
        energy: this.config.antEnergy,
        maxEnergy: this.config.antMaxEnergy,
        energyConsumptionRate: this.config.energyConsumptionRate,
        lowEnergyThreshold: this.config.lowEnergyThreshold,
      }));
    }
    for (const ant of this.colony.ants) this.rememberCell(ant);
  }

  tick() {
    this.tickEvents = [];
    const deltaSeconds = this.config.tickDurationMs / 1000;
    const consumedAtStart = this.colony.consumedFood;
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
      this.pheromoneField.update({
        evaporationRate: this.config.pheromoneEvaporationRate,
        diffusionRate: this.config.pheromoneDiffusionRate,
        minimumIntensity: this.config.pheromoneMinimumIntensity,
        types: [
          this.config.foodPheromonesEnabled && PheromoneType.FOOD,
          this.config.homePheromonesEnabled && PheromoneType.HOME,
        ].filter(Boolean),
      });
      if (this.config.alarmPheromonesEnabled) {
        this.pheromoneField.update({
          evaporationRate: this.config.alarmEvaporationRate,
          diffusionRate: this.config.alarmDiffusionRate,
          minimumIntensity: this.config.alarmMinimumIntensity,
          types: [PheromoneType.ALARM],
        });
      }
    }
    for (const ant of this.colony.ants) {
      if (ant.state === AntState.DEAD) continue;

      if (ant.state === AntState.RESTING) {
        ant.age += deltaSeconds;
        if (this.metabolism.consumeEnergy(
          ant,
          0,
          deltaSeconds,
          this.config.carryingEnergyMultiplier,
          this.config.basalEnergyConsumptionRate,
          1,
          this.currentEnvironment.metabolismMultiplier,
        )) {
          this.handleDeath(ant, "STARVATION");
          continue;
        }
        this.metabolism.feedAtNest(
          ant,
          this.colony,
          this.config.foodEnergyValue,
          this.config.resumeEnergyThreshold,
        );
        continue;
      }

      if (ant.state === AntState.SEARCHING_FOOD && this.metabolism.needsFood(ant)) {
        if (this.homeDetection.isInside(ant, this.colony.nest)) {
          this.metabolism.feedAtNest(
            ant,
            this.colony,
            this.config.foodEnergyValue,
            this.config.resumeEnergyThreshold,
          );
          if (ant.state === AntState.RESTING) continue;
        } else {
          this.metabolism.startEnergyReturn(ant);
        }
      }

      let targetDistance;
      if (ant.state === AntState.RETURNING_HOME) {
        const navigation = this.scoreDirection(ant, "RETURNING_HOME");
        const detectionRadius = this.config.directHomeNavigation
          ? Infinity
          : this.config.homeDetectionRadius;
        const localHome = this.homeDetection.suggestDirection(
          ant,
          this.colony.nest,
          detectionRadius,
        );
        targetDistance = this.returnHome.update(ant, navigation, localHome, deltaSeconds);
      } else {
        const food = this.foodDetection.findNearest(
          ant,
          this.foodSources,
          this.config.foodDetectionRadius,
        );
        const navigation = this.scoreDirection(ant, "SEARCHING_FOOD");
        targetDistance = this.searchFood.update(ant, food, navigation, deltaSeconds);
      }

      const distance = this.movement.update(ant, this.world, deltaSeconds, targetDistance);
      this.totalDistance += distance;
      if (ant.state === AntState.RETURNING_HOME && ant.returnStartedTick !== null) {
        ant.returnDistance += distance;
      }
      const exposure = this.hazard.exposure(ant.position, this.dangerZones);
      if (exposure.exposed) {
        this.dangerExposures += 1;
        this.dangerDistance += distance;
      }
      const carryingMultiplier = ant.carryingFood ? this.config.carryingEnergyMultiplier : 1;
      const baseMovementCost = distance * ant.energyConsumptionRate * carryingMultiplier
        * this.currentEnvironment.movementCostMultiplier;
      const hazardDamage = baseMovementCost * (exposure.movementMultiplier - 1);
      if (this.config.pheromonesEnabled
        && this.config.alarmPheromonesEnabled
        && hazardDamage >= this.config.alarmDamageThreshold) {
        this.alarmDeposit.depositDamage(
          ant.position,
          this.pheromoneField,
          this.config.alarmDamageDepositStrength,
        );
        this.damageAlarmDeposits += 1;
      }
      if (this.metabolism.consumeEnergy(
        ant,
        distance,
        deltaSeconds,
        this.config.carryingEnergyMultiplier,
        this.config.basalEnergyConsumptionRate,
        this.currentEnvironment.movementCostMultiplier * exposure.movementMultiplier,
        this.currentEnvironment.metabolismMultiplier,
      )) {
        this.handleDeath(ant, exposure.exposed ? "ENVIRONMENT" : "STARVATION");
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
        this.handleDeath(ant, "ENVIRONMENT");
        continue;
      }
      this.rememberCell(ant);

      if (ant.state === AntState.RETURNING_HOME) {
        if (this.config.pheromonesEnabled) {
          this.depositTrail(ant);
        }
        if (this.foodCollection.deposit(ant, this.colony)) {
          this.completedReturns += 1;
          this.totalReturnTicks += this.tickCount - ant.returnStartedTick;
          this.totalDetourDistance += Math.max(0, ant.returnDistance - ant.directReturnDistance);
          ant.returnStartedTick = null;
          ant.returnDistance = 0;
          ant.directReturnDistance = 0;
        }
        if (this.homeDetection.isInside(ant, this.colony.nest)
          && this.metabolism.needsFood(ant)) {
          this.metabolism.feedAtNest(
            ant,
            this.colony,
            this.config.foodEnergyValue,
            this.config.resumeEnergyThreshold,
          );
        }
      } else {
        if (this.homeDetection.isInside(ant, this.colony.nest)) ant.distanceSinceNest = 0;
        if (this.config.pheromonesEnabled) this.depositTrail(ant);
        const targetedSource = ant.target;
        if (this.foodCollection.collect(ant, this.config.foodPickupDistance)) {
          ant.returnStartedTick = this.tickCount;
          ant.returnDistance = 0;
          ant.directReturnDistance = Math.max(
            0,
            Math.hypot(
              ant.position.x - this.colony.nest.position.x,
              ant.position.y - this.colony.nest.position.y,
            ) - this.colony.nest.radius,
          );
          this.totalPickups += 1;
          if (targetedSource && !targetedSource.active) {
            this.emitEvent("FOOD_SOURCE_DEPLETED", { sourceId: targetedSource.id });
          }
          if (this.config.pheromonesEnabled) this.depositTrail(ant);
        }
      }
    }
    const eggsBeforeUpdate = this.colony.queen.eggsLaid;
    const emergedWorkers = this.broodSystem.update(
      this.colony,
      this.config,
      this.currentEnvironment.broodDevelopmentMultiplier,
    );
    if (this.colony.queen.eggsLaid > eggsBeforeUpdate) {
      this.emitEvent("QUEEN_LAID_EGG", { queenId: this.colony.queen.id });
    }
    for (let index = 0; index < emergedWorkers; index += 1) this.spawnWorker();
    if (emergedWorkers > 0) this.emitEvent("WORKERS_EMERGED", { count: emergedWorkers });
    this.births += emergedWorkers;
    const currentPopulation = this.colony.ants.filter((ant) => ant.state !== AntState.DEAD).length
      + this.colony.brood.length + 1;
    this.maxPopulation = Math.max(this.maxPopulation, currentPopulation);
    const consumedThisTick = this.colony.consumedFood - consumedAtStart;
    this.consumptionWindow.push(consumedThisTick);
    this.consumptionWindowTotal += consumedThisTick;
    if (this.consumptionWindow.length > this.config.autonomyWindowTicks) {
      this.consumptionWindowTotal -= this.consumptionWindow.shift();
    }
    this.tickCount += 1;
    this.elapsedMs += this.config.tickDurationMs;
    if (!this.config.environmentEnabled
      && this.completionTick === null
      && this.colony.resources === this.initialFoodQuantity) {
      this.completionTick = this.tickCount;
    }
  }

  handleDeath(ant, cause = "STARVATION") {
    if (cause === "ENVIRONMENT") {
      this.environmentalDeaths += 1;
      this.emitEvent("ENVIRONMENTAL_DEATH", { antId: ant.id });
      if (this.config.pheromonesEnabled && this.config.alarmPheromonesEnabled) {
        this.alarmDeposit.depositDeath(
          ant.position,
          this.pheromoneField,
          this.config.alarmDeathDepositStrength,
        );
        this.deathAlarmDeposits += 1;
      }
    } else {
      this.starvationDeaths += 1;
      this.emitEvent("WORKER_DIED", { antId: ant.id, cause: "STARVATION" });
    }
    if (ant.carryingFood) {
      this.lostFood += ant.carryingFoodAmount;
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

  spawnWorker() {
    const nest = this.colony.nest;
    const angle = this.birthRandom() * Math.PI * 2;
    const distance = this.birthRandom() * nest.radius * 0.55;
    const ant = new Ant({
      id: `ANT-${String(this.nextAntId).padStart(3, "0")}`,
      position: {
        x: nest.position.x + Math.cos(angle) * distance,
        y: nest.position.y + Math.sin(angle) * distance,
      },
      direction: this.birthRandom() * Math.PI * 2,
      speed: this.config.antSpeed * (0.75 + this.birthRandom() * 0.5),
      colonyId: this.colony.id,
      energy: this.config.antMaxEnergy,
      maxEnergy: this.config.antMaxEnergy,
      energyConsumptionRate: this.config.energyConsumptionRate,
      lowEnergyThreshold: this.config.lowEnergyThreshold,
    });
    this.nextAntId += 1;
    this.colony.ants.push(ant);
    this.rememberCell(ant);
    return ant;
  }

  senseTrail(ant, type) {
    return this.pheromoneSensing.suggestDirection(ant, this.pheromoneField, type, {
      distance: this.config.pheromoneSenseDistance,
      arc: this.config.pheromoneSenseArc,
      samples: this.config.pheromoneSenseSamples,
      minimumSignal: this.config.pheromoneMinSignal,
      revisitPenalty: this.config.pheromoneRevisitPenalty,
    });
  }

  scoreDirection(ant, state) {
    if (!this.config.pheromonesEnabled) return null;
    const returning = state === AntState.RETURNING_HOME;
    return this.directionScoring.suggestDirection(ant, this.pheromoneField, {
      distance: this.config.pheromoneSenseDistance,
      arc: this.config.pheromoneSenseArc,
      samples: this.config.pheromoneSenseSamples,
      minimumSignal: this.config.pheromoneMinSignal / this.pheromoneField.maxIntensity,
      minimumAlarmSignal: this.config.alarmMinimumIntensity / this.pheromoneField.maxIntensity,
      revisitPenalty: this.config.pheromoneRevisitPenalty,
      foodWeight: !returning && this.config.foodPheromonesEnabled
        ? this.config.pheromoneInfluence
        : 0,
      homeWeight: returning && this.config.homePheromonesEnabled
        ? this.config.homeTrailInfluence
        : 0,
      alarmWeight: this.config.alarmPheromonesEnabled ? this.config.alarmInfluence : 0,
      inertiaWeight: this.config.navigationInertia,
      noiseWeight: this.config.navigationNoise,
      baseInfluence: returning ? this.config.homeTrailInfluence : this.config.pheromoneInfluence,
    });
  }

  depositTrail(ant) {
    return this.pheromoneDeposit.deposit(ant, this.pheromoneField, {
      foodEnabled: this.config.foodPheromonesEnabled,
      homeEnabled: this.config.homePheromonesEnabled,
      foodStrength: this.config.foodDepositStrength,
      homeStrength: this.config.homeDepositStrength,
      homeFalloffDistance: this.config.homeFalloffDistance,
    });
  }

  rememberCell(ant) {
    const cell = this.pheromoneField.indexAt(ant.position);
    if (cell < 0) return;
    this.exploredCells.add(cell);
    if (ant.recentCells.at(-1) === cell) return;
    ant.recentCells.push(cell);
    if (ant.recentCells.length > this.config.recentCellMemory) ant.recentCells.shift();
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
    return {
      schemaVersion: 1,
      tick: this.tickCount,
      elapsedMs: this.elapsedMs,
      config: toVersionedConfig(this.config),
      colony: clone(this.colony),
      foodSources: clone(this.foodSources),
      dangerZones: clone(this.dangerZones),
      environment: clone(this.currentEnvironment),
      pheromones: Object.fromEntries(Object.values(PheromoneType).map((type) => [
        type,
        Array.from(this.pheromoneField.layer(type)),
      ])),
      metrics: this.getMetrics(),
    };
  }

  getMetrics() {
    const foodPheromones = this.pheromoneField.getStats(PheromoneType.FOOD);
    const homePheromones = this.pheromoneField.getStats(PheromoneType.HOME);
    const alarmPheromones = this.pheromoneField.getStats(PheromoneType.ALARM);
    const livingAnts = this.colony.ants.filter((ant) => ant.state !== AntState.DEAD);
    const energies = livingAnts.map((ant) => ant.energy);
    const broodCounts = {
      eggs: this.colony.brood.filter((brood) => brood.stage === BroodStage.EGG).length,
      larvae: this.colony.brood.filter((brood) => brood.stage === BroodStage.LARVA).length,
      pupae: this.colony.brood.filter((brood) => brood.stage === BroodStage.PUPA).length,
    };
    const averageWorkerAge = livingAnts.length === 0
      ? 0
      : livingAnts.reduce((total, ant) => total + ant.age, 0) / livingAnts.length;
    const averageEnergy = energies.length === 0
      ? 0
      : energies.reduce((total, energy) => total + energy, 0) / energies.length;
    const averageConsumptionPerTick = this.consumptionWindow.length === 0
      ? 0
      : this.consumptionWindowTotal / this.consumptionWindow.length;
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
      ants: livingAnts.length,
      totalAnts: this.colony.ants.length,
      totalPopulation: livingAnts.length + this.colony.brood.length + 1,
      maxPopulation: this.maxPopulation,
      livingAnts: livingAnts.length,
      deadAnts: this.colony.ants.length - livingAnts.length,
      restingAnts: livingAnts.filter((ant) => ant.state === AntState.RESTING).length,
      averageEnergy,
      minimumEnergy: energies.length === 0 ? 0 : Math.min(...energies),
      averageWorkerAge,
      births: this.births,
      deaths: this.colony.ants.length - livingAnts.length,
      starvationDeaths: this.starvationDeaths,
      environmentalDeaths: this.environmentalDeaths,
      dangerExposures: this.dangerExposures,
      dangerDistance: this.dangerDistance,
      damageAlarmDeposits: this.damageAlarmDeposits,
      deathAlarmDeposits: this.deathAlarmDeposits,
      netGrowth: this.births - (this.colony.ants.length - livingAnts.length),
      birthRate: this.tickCount === 0 ? 0 : this.births / this.tickCount * 1000,
      deathRate: this.tickCount === 0
        ? 0
        : (this.colony.ants.length - livingAnts.length) / this.tickCount * 1000,
      eggs: broodCounts.eggs,
      larvae: broodCounts.larvae,
      pupae: broodCounts.pupae,
      broodSize: this.colony.brood.length,
      broodFoodCost: this.broodSystem.broodFoodConsumed,
      reproductionFoodCost: this.broodSystem.layingFoodConsumed,
      foodSources: this.foodSources.filter((source) => source.active).length,
      foodRemaining: this.foodSources.reduce((total, source) => total + source.quantity, 0),
      resources: this.colony.resources,
      foodStock: this.colony.foodStock,
      consumedFood: this.colony.consumedFood,
      averageConsumptionPerTick,
      autonomyTicks: averageConsumptionPerTick === 0
        ? null
        : this.colony.foodStock / averageConsumptionPerTick,
      foodBalance: this.colony.resources - this.colony.consumedFood,
      collectionConsumptionRatio: this.colony.consumedFood === 0
        ? null
        : this.colony.resources / this.colony.consumedFood,
      lostFood: this.lostFood,
      regeneratedFood: this.regeneratedFood,
      spawnedFood: this.spawnedFood,
      expiredFood: this.expiredFood,
      carriedFood: this.colony.ants.reduce(
        (total, ant) => total + ant.carryingFoodAmount,
        0,
      ),
      carryingAnts: this.colony.ants.filter((ant) => ant.carryingFood).length,
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
      elapsedMs: this.elapsedMs,
    };
  }
}
