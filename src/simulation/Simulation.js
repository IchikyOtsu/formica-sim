import { RandomWalk } from "../behaviors/RandomWalk.js";
import { ReturnHomeBehavior } from "../behaviors/ReturnHomeBehavior.js";
import { SearchFoodBehavior } from "../behaviors/SearchFoodBehavior.js";
import { Ant, AntState } from "../entities/Ant.js";
import { Colony } from "../entities/Colony.js";
import { FoodSource } from "../entities/FoodSource.js";
import { Nest } from "../entities/Nest.js";
import { MovementSystem } from "../systems/MovementSystem.js";
import { FoodCollectionSystem } from "../systems/FoodCollectionSystem.js";
import { FoodDetectionSystem } from "../systems/FoodDetectionSystem.js";
import { HomeDetectionSystem } from "../systems/HomeDetectionSystem.js";
import { PheromoneDepositSystem } from "../systems/PheromoneDepositSystem.js";
import { PheromoneSensingSystem } from "../systems/PheromoneSensingSystem.js";
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

export class Simulation {
  constructor(config = DEFAULT_CONFIG) {
    this.config = config;
    this.movement = new MovementSystem();
    this.foodDetection = new FoodDetectionSystem();
    this.foodCollection = new FoodCollectionSystem();
    this.pheromoneDeposit = new PheromoneDepositSystem();
    this.homeDetection = new HomeDetectionSystem();
    this.reset();
  }

  reconfigure(config) {
    this.config = config;
    this.reset();
  }

  reset() {
    this.tickCount = 0;
    this.elapsedMs = 0;
    this.completionTick = null;
    this.random = seededRandom(this.config.seed);
    this.sensingRandom = seededRandom(this.config.seed ^ 0x9e3779b9);
    this.randomWalk = new RandomWalk(this.random, this.config.explorationStrength);
    this.searchFood = new SearchFoodBehavior(this.randomWalk, this.config.pheromoneInfluence);
    this.returnHome = new ReturnHomeBehavior(this.randomWalk, this.config.homeTrailInfluence);
    this.pheromoneSensing = new PheromoneSensingSystem(this.sensingRandom);
    this.world = new World(this.config.width, this.config.height);
    this.pheromoneField = new PheromoneField(
      this.config.width,
      this.config.height,
      this.config.pheromoneCellSize,
      this.config.pheromoneMaxIntensity,
    );
    const nestConfig = this.config.nest;
    const nest = new Nest(nestConfig.x, nestConfig.y, nestConfig.radius);
    this.colony = new Colony({ id: "C-01", nest });
    this.foodSources = this.config.foodSources.map((source) => new FoodSource(source));
    this.initialFoodQuantity = this.foodSources.reduce((total, source) => total + source.quantity, 0);
    this.totalDistance = 0;
    this.totalPickups = 0;
    this.totalReturnTicks = 0;
    this.completedReturns = 0;
    this.exploredCells = new Set();

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
      }));
    }
    for (const ant of this.colony.ants) this.rememberCell(ant);
  }

  tick() {
    const deltaSeconds = this.config.tickDurationMs / 1000;
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
    }
    for (const ant of this.colony.ants) {
      let targetDistance;
      if (ant.state === AntState.RETURNING_HOME) {
        const homeTrail = this.config.pheromonesEnabled && this.config.homePheromonesEnabled
          ? this.senseTrail(ant, PheromoneType.HOME)
          : null;
        const detectionRadius = this.config.directHomeNavigation
          ? Infinity
          : this.config.homeDetectionRadius;
        const localHome = this.homeDetection.suggestDirection(
          ant,
          this.colony.nest,
          detectionRadius,
        );
        targetDistance = this.returnHome.update(ant, homeTrail, localHome, deltaSeconds);
      } else {
        const food = this.foodDetection.findNearest(
          ant,
          this.foodSources,
          this.config.foodDetectionRadius,
        );
        const suggestedTrail = this.config.pheromonesEnabled
          && this.config.foodPheromonesEnabled
          && !food
          ? this.senseTrail(ant, PheromoneType.FOOD)
          : null;
        targetDistance = this.searchFood.update(ant, food, suggestedTrail, deltaSeconds);
      }

      this.totalDistance += this.movement.update(ant, this.world, deltaSeconds, targetDistance);
      this.rememberCell(ant);

      if (ant.state === AntState.RETURNING_HOME) {
        if (this.config.pheromonesEnabled) {
          this.depositTrail(ant);
        }
        if (this.foodCollection.deposit(ant, this.colony)) {
          this.completedReturns += 1;
          this.totalReturnTicks += this.tickCount - ant.returnStartedTick;
          ant.returnStartedTick = null;
        }
      } else {
        if (this.homeDetection.isInside(ant, this.colony.nest)) ant.distanceSinceNest = 0;
        if (this.config.pheromonesEnabled) this.depositTrail(ant);
        if (this.foodCollection.collect(ant, this.config.foodPickupDistance)) {
          ant.returnStartedTick = this.tickCount;
          this.totalPickups += 1;
          if (this.config.pheromonesEnabled) this.depositTrail(ant);
        }
      }
    }
    this.tickCount += 1;
    this.elapsedMs += this.config.tickDurationMs;
    if (this.completionTick === null && this.colony.resources === this.initialFoodQuantity) {
      this.completionTick = this.tickCount;
    }
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

  getMetrics() {
    const foodPheromones = this.pheromoneField.getStats(PheromoneType.FOOD);
    const homePheromones = this.pheromoneField.getStats(PheromoneType.HOME);
    return {
      tick: this.tickCount,
      ants: this.colony.ants.length,
      foodSources: this.foodSources.filter((source) => source.active).length,
      foodRemaining: this.foodSources.reduce((total, source) => total + source.quantity, 0),
      resources: this.colony.resources,
      carryingAnts: this.colony.ants.filter((ant) => ant.carryingFood).length,
      pheromoneTotal: foodPheromones.total + homePheromones.total,
      pheromoneCells: foodPheromones.activeCells + homePheromones.activeCells,
      pheromoneMaximum: Math.max(foodPheromones.maximum, homePheromones.maximum),
      foodPheromones,
      homePheromones,
      completionTick: this.completionTick,
      totalDistance: this.totalDistance,
      totalPickups: this.totalPickups,
      averageReturnTicks: this.completedReturns === 0
        ? 0
        : this.totalReturnTicks / this.completedReturns,
      exploredCells: this.exploredCells.size,
      elapsedMs: this.elapsedMs,
    };
  }
}
