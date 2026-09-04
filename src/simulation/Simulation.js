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
import { DEFAULT_CONFIG } from "./SimulationConfig.js";
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
    this.returnHome = new ReturnHomeBehavior();
    this.reset();
  }

  reset() {
    this.tickCount = 0;
    this.elapsedMs = 0;
    this.random = seededRandom(this.config.seed);
    this.randomWalk = new RandomWalk(this.random);
    this.searchFood = new SearchFoodBehavior(this.randomWalk);
    this.world = new World(this.config.width, this.config.height);
    const nestConfig = this.config.nest;
    const nest = new Nest(nestConfig.x, nestConfig.y, nestConfig.radius);
    this.colony = new Colony({ id: "C-01", nest });
    this.foodSources = this.config.foodSources.map((source) => new FoodSource(source));

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
        targetDistance = this.searchFood.update(ant, food, deltaSeconds);
      }

      this.movement.update(ant, this.world, deltaSeconds, targetDistance);

      if (ant.state === AntState.RETURNING_HOME) {
        this.foodCollection.deposit(ant, this.colony);
      } else {
        this.foodCollection.collect(ant, this.config.foodPickupDistance);
      }
    }
    this.tickCount += 1;
    this.elapsedMs += this.config.tickDurationMs;
  }

  getMetrics() {
    return {
      tick: this.tickCount,
      ants: this.colony.ants.length,
      foodSources: this.foodSources.filter((source) => source.active).length,
      foodRemaining: this.foodSources.reduce((total, source) => total + source.quantity, 0),
      resources: this.colony.resources,
      carryingAnts: this.colony.ants.filter((ant) => ant.carryingFood).length,
      elapsedMs: this.elapsedMs,
    };
  }
}
