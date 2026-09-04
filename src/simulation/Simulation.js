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
import { PheromoneDepositSystem } from "../systems/PheromoneDepositSystem.js";
import { PheromoneSensingSystem } from "../systems/PheromoneSensingSystem.js";
import { DEFAULT_CONFIG } from "./SimulationConfig.js";
import { PheromoneField } from "./PheromoneField.js";
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
    this.returnHome = new ReturnHomeBehavior();
    this.reset();
  }

  reset() {
    this.tickCount = 0;
    this.elapsedMs = 0;
    this.completionTick = null;
    this.random = seededRandom(this.config.seed);
    this.sensingRandom = seededRandom(this.config.seed ^ 0x9e3779b9);
    this.randomWalk = new RandomWalk(this.random);
    this.searchFood = new SearchFoodBehavior(this.randomWalk, this.config.pheromoneInfluence);
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
  }

  tick() {
    const deltaSeconds = this.config.tickDurationMs / 1000;
    if (this.config.pheromonesEnabled) {
      this.pheromoneField.evaporate(
        this.config.pheromoneDecayFactor,
        this.config.pheromoneThreshold,
      );
    }
    for (const ant of this.colony.ants) {
      let targetDistance;
      if (ant.state === AntState.RETURNING_HOME) {
        targetDistance = this.returnHome.update(ant, this.colony.nest);
      } else {
        const food = this.foodDetection.findNearest(
          ant,
          this.foodSources,
          this.config.foodDetectionRadius,
        );
        const suggestedTrail = this.config.pheromonesEnabled && !food
          ? this.pheromoneSensing.suggestDirection(ant, this.pheromoneField, {
            distance: this.config.pheromoneSenseDistance,
            arc: this.config.pheromoneSenseArc,
            samples: this.config.pheromoneSenseSamples,
            minimumSignal: this.config.pheromoneMinSignal,
          })
          : null;
        targetDistance = this.searchFood.update(ant, food, suggestedTrail, deltaSeconds);
      }

      this.movement.update(ant, this.world, deltaSeconds, targetDistance);

      if (ant.state === AntState.RETURNING_HOME) {
        if (this.config.pheromonesEnabled) {
          this.pheromoneDeposit.deposit(
            ant,
            this.pheromoneField,
            this.colony.nest,
            this.world,
            this.config.pheromoneDepositAmount,
          );
        }
        this.foodCollection.deposit(ant, this.colony);
      } else {
        this.foodCollection.collect(ant, this.config.foodPickupDistance);
      }
    }
    this.tickCount += 1;
    this.elapsedMs += this.config.tickDurationMs;
    if (this.completionTick === null && this.colony.resources === this.initialFoodQuantity) {
      this.completionTick = this.tickCount;
    }
  }

  getMetrics() {
    const pheromones = this.pheromoneField.getStats();
    return {
      tick: this.tickCount,
      ants: this.colony.ants.length,
      foodSources: this.foodSources.filter((source) => source.active).length,
      foodRemaining: this.foodSources.reduce((total, source) => total + source.quantity, 0),
      resources: this.colony.resources,
      carryingAnts: this.colony.ants.filter((ant) => ant.carryingFood).length,
      pheromoneTotal: pheromones.total,
      pheromoneCells: pheromones.activeCells,
      pheromoneMaximum: pheromones.maximum,
      completionTick: this.completionTick,
      elapsedMs: this.elapsedMs,
    };
  }
}
