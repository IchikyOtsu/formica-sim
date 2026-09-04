import assert from "node:assert/strict";
import test from "node:test";
import { EventLog } from "../src/observability/EventLog.js";
import { MetricsRecorder } from "../src/observability/MetricsRecorder.js";
import { ReplayController } from "../src/observability/ReplayController.js";
import { createRunExport, seriesToCsv } from "../src/observability/RunExporter.js";
import { TimeSeries } from "../src/observability/TimeSeries.js";
import { evaluatePauseConditions } from "../src/observability/PauseConditions.js";
import { SearchFoodBehavior } from "../src/behaviors/SearchFoodBehavior.js";
import { ReturnHomeBehavior } from "../src/behaviors/ReturnHomeBehavior.js";
import { Ant, AntState, Caste } from "../src/entities/Ant.js";
import { Brood, BroodStage } from "../src/entities/Brood.js";
import { FoodSource, FoodSourceState } from "../src/entities/FoodSource.js";
import { DangerZone } from "../src/environment/DangerZone.js";
import { Season } from "../src/environment/Season.js";
import { ExperimentRunner } from "../src/experiments/ExperimentRunner.js";
import { SCENARIO_PRESETS, configForPreset } from "../src/experiments/ScenarioPresets.js";
import { PheromoneField, PheromoneType } from "../src/simulation/PheromoneField.js";
import { Renderer } from "../src/rendering/Renderer.js";
import { Simulation } from "../src/simulation/Simulation.js";
import { DEFAULT_CONFIG } from "../src/simulation/SimulationConfig.js";
import {
  CONFIG_SECTIONS,
  normalizeConfig,
  toVersionedConfig,
} from "../src/config/ConfigSchema.js";
import { assertSimulationInvariants, inspectSimulationInvariants } from "../src/simulation/Invariants.js";
import { World } from "../src/simulation/World.js";
import { FoodDetectionSystem } from "../src/systems/FoodDetectionSystem.js";
import { FoodCollectionSystem } from "../src/systems/FoodCollectionSystem.js";
import { EnvironmentSystem } from "../src/systems/EnvironmentSystem.js";
import { FoodSpawnSystem } from "../src/systems/FoodSpawnSystem.js";
import { HazardSystem } from "../src/systems/HazardSystem.js";
import { HomeDetectionSystem } from "../src/systems/HomeDetectionSystem.js";
import { PheromoneDepositSystem } from "../src/systems/PheromoneDepositSystem.js";
import { PheromoneSensingSystem } from "../src/systems/PheromoneSensingSystem.js";
import { MetabolismSystem } from "../src/systems/MetabolismSystem.js";
import { DirectionScoringSystem } from "../src/systems/DirectionScoringSystem.js";
import { EncounterReactionSystem, EncounterReaction } from "../src/systems/EncounterReactionSystem.js";
import { BroodSystem } from "../src/systems/BroodSystem.js";
import { Colony } from "../src/entities/Colony.js";
import { Nest } from "../src/entities/Nest.js";

function foragingConfig(overrides = {}) {
  return {
    ...DEFAULT_CONFIG,
    width: 120,
    height: 80,
    tickDurationMs: 100,
    initialAnts: 1,
    antSpeed: 20,
    environmentEnabled: false,
    foodRegenerationRate: 0,
    foodDetectionRadius: 30,
    nest: { x: 15, y: 40, radius: 6 },
    foodSources: [{ x: 70, y: 40, quantity: 2, radius: 5 }],
    ...overrides,
  };
}

function multiColonyConfig(overrides = {}) {
  return {
    ...DEFAULT_CONFIG,
    width: 200,
    height: 100,
    antSpeed: 0,
    environmentEnabled: false,
    reproductionEnabled: false,
    foodRegenerationRate: 0,
    dangerZones: [],
    foreignDetectionRadius: 12,
    territoryUpdateInterval: 1,
    colonies: [
      {
        id: "A",
        name: "Ambre",
        color: "#f0b45f",
        nest: { x: 20, y: 50, radius: 8 },
        initialAnts: 1,
        initialFoodStock: 0,
      },
      {
        id: "B",
        name: "Azur",
        color: "#65a9d8",
        nest: { x: 180, y: 50, radius: 8 },
        initialAnts: 1,
        initialFoodStock: 0,
      },
    ],
    foodSources: [{ id: "SHARED", x: 100, y: 50, quantity: 1, radius: 6 }],
    ...overrides,
  };
}

test("creates the configured colony and food sources", () => {
  const simulation = new Simulation();
  assert.equal(simulation.colony.ants.length, 50);
  assert.equal(simulation.foodSources.length, 3);
  assert.equal(simulation.colony.id, "C-01");
});

test("advances time and keeps every ant inside the world", () => {
  const simulation = new Simulation();
  for (let index = 0; index < 10_000; index += 1) simulation.tick();
  assert.equal(simulation.tickCount, 10_000);
  assert.equal(simulation.elapsedMs, 1_000_000);
  for (const ant of simulation.colony.ants) {
    assert.equal(simulation.world.contains(ant.position), true);
  }
  const metrics = simulation.getMetrics();
  assert.ok(metrics.resources > 0);
  assert.ok(metrics.foodSources <= simulation.config.maxActiveSources);
  assert.equal(metrics.season, "SUMMER");
});

test("reset restores a deterministic initial state", () => {
  const simulation = new Simulation();
  const initial = JSON.stringify(simulation.colony.ants[0]);
  simulation.tick();
  simulation.reset();
  assert.equal(JSON.stringify(simulation.colony.ants[0]), initial);
  assert.equal(simulation.tickCount, 0);
});

test("rejects invalid world dimensions", () => {
  assert.throws(() => new World(0, 100), /positive/);
});

test("local detection selects the nearest active source", () => {
  const simulation = new Simulation(foragingConfig());
  const ant = simulation.colony.ants[0];
  ant.position = { x: 50, y: 40 };
  const near = simulation.foodSources[0];
  const far = new FoodSource({ x: 10, y: 10, quantity: 5, radius: 2 });
  const detection = new FoodDetectionSystem();

  assert.equal(detection.findNearest(ant, [far, near], 20), near);
  near.take(near.quantity);
  assert.equal(detection.findNearest(ant, [far, near], 20), null);
});

test("an ant collects one unit and switches to RETURNING_HOME", () => {
  const simulation = new Simulation(foragingConfig());
  const ant = simulation.colony.ants[0];
  ant.position = { ...simulation.foodSources[0].position };

  simulation.tick();

  assert.equal(simulation.foodSources[0].quantity, 1);
  assert.equal(ant.carryingFood, true);
  assert.equal(ant.state, AntState.RETURNING_HOME);
});

test("a loaded ant returns, deposits, and resumes searching", () => {
  const simulation = new Simulation(foragingConfig());
  const ant = simulation.colony.ants[0];
  ant.position = { ...simulation.foodSources[0].position };
  simulation.tick();

  for (let index = 0; index < 100 && simulation.colony.resources === 0; index += 1) {
    simulation.tick();
  }

  assert.equal(simulation.colony.resources, 1);
  assert.equal(ant.carryingFood, false);
  assert.equal(ant.state, AntState.SEARCHING_FOOD);
});

test("a source is deactivated when its last unit is collected", () => {
  const simulation = new Simulation(foragingConfig({
    initialAnts: 2,
    foodSources: [{ x: 70, y: 40, quantity: 1, radius: 5 }],
  }));
  for (const ant of simulation.colony.ants) {
    ant.position = { ...simulation.foodSources[0].position };
  }

  simulation.tick();

  assert.equal(simulation.foodSources[0].quantity, 0);
  assert.equal(simulation.foodSources[0].active, false);
  assert.equal(simulation.getMetrics().foodSources, 0);
  assert.equal(simulation.getMetrics().carryingAnts, 1);
});

test("reset restores food, stock, carrying state, and deterministic ants", () => {
  const simulation = new Simulation(foragingConfig());
  const initialAnts = JSON.stringify(simulation.colony.ants);
  simulation.colony.ants[0].position = { ...simulation.foodSources[0].position };
  simulation.tick();
  assert.equal(simulation.getMetrics().carryingAnts, 1);

  simulation.reset();

  assert.equal(simulation.foodSources[0].quantity, 2);
  assert.equal(simulation.colony.resources, 0);
  assert.equal(simulation.getMetrics().carryingAnts, 0);
  assert.equal(JSON.stringify(simulation.colony.ants), initialAnts);
});

test("typed pheromone deposits stay independent and evaporate below the threshold", () => {
  const field = new PheromoneField(100, 80, 10, 50);
  const position = { x: 25, y: 25 };
  field.deposit(PheromoneType.FOOD, position, 8);
  const firstDeposit = field.sample(PheromoneType.FOOD, position);
  field.deposit(PheromoneType.FOOD, position, 8);
  assert.ok(field.sample(PheromoneType.FOOD, position) > firstDeposit);
  assert.equal(field.sample(PheromoneType.HOME, position), 0);

  field.update({ evaporationRate: 0.5, diffusionRate: 0, minimumIntensity: 0.1 });
  assert.equal(field.sample(PheromoneType.FOOD, position), 8);
  for (let index = 0; index < 7; index += 1) {
    field.update({ evaporationRate: 0.5, diffusionRate: 0, minimumIntensity: 0.1 });
  }
  assert.equal(field.sample(PheromoneType.FOOD, position), 0);
  assert.deepEqual(field.getStats(), { total: 0, activeCells: 0, maximum: 0 });
});

test("diffusion spreads a gradient and can be disabled", () => {
  const position = { x: 25, y: 25 };
  const neighbor = { x: 35, y: 25 };
  const staticField = new PheromoneField(60, 60, 10);
  staticField.deposit(PheromoneType.HOME, position, 20);
  staticField.update({ evaporationRate: 0, diffusionRate: 0, minimumIntensity: 0 });
  assert.equal(staticField.sample(PheromoneType.HOME, neighbor), 0);

  const diffusedField = new PheromoneField(60, 60, 10);
  diffusedField.deposit(PheromoneType.HOME, position, 20);
  diffusedField.update({ evaporationRate: 0, diffusionRate: 0.1, minimumIntensity: 0 });
  assert.ok(diffusedField.sample(PheromoneType.HOME, neighbor) > 0);
  assert.ok(diffusedField.sample(PheromoneType.HOME, position) < 20);
});

test("searchers deposit HOME and loaded returners deposit FOOD", () => {
  const simulation = new Simulation(foragingConfig());
  const ant = simulation.colony.ants[0];
  const system = new PheromoneDepositSystem();
  ant.position = { x: 70, y: 40 };

  const options = {
    homeEnabled: true,
    foodEnabled: true,
    homeStrength: 1,
    foodStrength: 2,
    homeFalloffDistance: 100,
  };
  assert.ok(system.deposit(ant, simulation.pheromoneField, options) > 0);
  assert.ok(simulation.pheromoneField.sample(PheromoneType.HOME, ant.position) > 0);
  assert.equal(simulation.pheromoneField.sample(PheromoneType.FOOD, ant.position), 0);
  ant.carryingFood = true;
  ant.state = AntState.RETURNING_HOME;
  assert.ok(system.deposit(ant, simulation.pheromoneField, options) > 0);
  assert.ok(simulation.pheromoneField.sample(PheromoneType.FOOD, ant.position) > 0);
});

test("a nearby trail biases a searcher without removing exploratory noise", () => {
  const field = new PheromoneField(100, 100, 5);
  const ant = new Ant({
    id: "TEST",
    position: { x: 50, y: 50 },
    direction: 0,
    speed: 10,
    colonyId: "C-01",
  });
  field.deposit(PheromoneType.FOOD, { x: 50, y: 70 }, 10);
  const sensing = new PheromoneSensingSystem(() => 0.5);
  const suggestion = sensing.suggestDirection(ant, field, PheromoneType.FOOD, {
    distance: 20,
    arc: Math.PI,
    samples: 3,
    minimumSignal: 0.1,
    revisitPenalty: 0.1,
  });
  assert.ok(Math.abs(suggestion.direction - Math.PI / 2) < 1e-10);

  const exploratoryTurn = 0.16;
  const behavior = new SearchFoodBehavior({
    update(candidate) { candidate.direction += exploratoryTurn; },
  }, 0.6);
  behavior.update(ant, null, suggestion, 0.1);
  assert.ok(ant.direction > exploratoryTurn);
  assert.ok(ant.direction < suggestion.direction);
  assert.equal(ant.target, null);
});

test("a trail to an exhausted source eventually disappears", () => {
  const simulation = new Simulation(foragingConfig({
    foodSources: [{ x: 70, y: 40, quantity: 1, radius: 5 }],
  }));
  const ant = simulation.colony.ants[0];
  ant.position = { ...simulation.foodSources[0].position };
  simulation.tick();
  while (simulation.colony.resources === 0) simulation.tick();
  assert.equal(simulation.foodSources[0].active, false);
  assert.ok(simulation.pheromoneField.getStats(PheromoneType.FOOD).total > 0);

  for (let index = 0; index < 5_000; index += 1) simulation.tick();
  assert.deepEqual(
    simulation.pheromoneField.getStats(PheromoneType.FOOD),
    { total: 0, activeCells: 0, maximum: 0 },
  );
});

test("reset clears the pheromone field", () => {
  const simulation = new Simulation(foragingConfig());
  const ant = simulation.colony.ants[0];
  ant.position = { ...simulation.foodSources[0].position };
  simulation.tick();
  simulation.tick();
  assert.ok(simulation.pheromoneField.getStats().activeCells > 0);

  simulation.reset();
  assert.deepEqual(
    simulation.pheromoneField.getStats(),
    { total: 0, activeCells: 0, maximum: 0 },
  );
});

test("reconfigure applies parameters through a deterministic reset", () => {
  const simulation = new Simulation();
  simulation.tick();
  simulation.reconfigure({
    ...simulation.config,
    initialAnts: 3,
    pheromoneDiffusionRate: 0,
  });
  assert.equal(simulation.colony.ants.length, 3);
  assert.equal(simulation.tickCount, 0);
  assert.equal(simulation.config.pheromoneDiffusionRate, 0);
  assert.deepEqual(simulation.pheromoneField.getStats(), {
    total: 0,
    activeCells: 0,
    maximum: 0,
  });
});

test("identical seeds reproduce ants, resources, and pheromone fields", () => {
  const first = new Simulation();
  const second = new Simulation();
  for (let index = 0; index < 1_000; index += 1) {
    first.tick();
    second.tick();
  }
  assert.equal(JSON.stringify(first.colony.ants), JSON.stringify(second.colony.ants));
  assert.equal(first.colony.resources, second.colony.resources);
  assert.deepEqual(
    first.pheromoneField.layer(PheromoneType.FOOD),
    second.pheromoneField.layer(PheromoneType.FOOD),
  );
  assert.deepEqual(
    first.pheromoneField.layer(PheromoneType.HOME),
    second.pheromoneField.layer(PheromoneType.HOME),
  );
  assert.deepEqual(
    first.pheromoneField.layer(PheromoneType.ALARM),
    second.pheromoneField.layer(PheromoneType.ALARM),
  );
  assert.equal(first.getMetrics().dangerExposures, second.getMetrics().dangerExposures);
  assert.equal(first.getMetrics().environmentalDeaths, second.getMetrics().environmentalDeaths);
});

test("enabling empty pheromone layers does not change the baseline random walk", () => {
  const baseline = { ...DEFAULT_CONFIG, directHomeNavigation: true };
  const withoutPheromones = new Simulation({ ...baseline, pheromonesEnabled: false });
  const withEmptyField = new Simulation({
    ...baseline,
    pheromonesEnabled: true,
    foodPheromonesEnabled: false,
    homePheromonesEnabled: false,
  });
  for (let index = 0; index < 100; index += 1) {
    withoutPheromones.tick();
    withEmptyField.tick();
  }
  assert.equal(
    JSON.stringify(withoutPheromones.colony.ants),
    JSON.stringify(withEmptyField.colony.ants),
  );
});

test("an empty field gives no privileged knowledge of distant food", () => {
  const simulation = new Simulation(foragingConfig({
    foodDetectionRadius: 3,
    foodSources: [{ x: 110, y: 70, quantity: 1, radius: 2 }],
  }));
  const ant = simulation.colony.ants[0];
  simulation.tick();
  assert.equal(ant.target, null);
  assert.equal(simulation.pheromoneField.getStats(PheromoneType.FOOD).activeCells, 0);
});

test("the renderer can hide pheromones without changing the field", () => {
  const renderer = new Renderer({ getContext: () => ({}) });
  const field = new PheromoneField(20, 20, 10);
  field.deposit(PheromoneType.FOOD, { x: 5, y: 5 }, 4);
  renderer.setPheromoneMode("HOME");
  assert.equal(renderer.pheromoneMode, "HOME");
  renderer.setPheromonesVisible(false);
  assert.equal(renderer.pheromoneMode, "OFF");
  assert.equal(field.sample(PheromoneType.FOOD, { x: 5, y: 5 }), 4);
});

test("a returning behavior has no nest reference and home detection stays local", () => {
  const behavior = new ReturnHomeBehavior({ update() {} });
  assert.equal(Object.hasOwn(behavior, "nest"), false);
  const simulation = new Simulation();
  const ant = simulation.colony.ants[0];
  ant.position = { x: 700, y: 100 };
  const detection = new HomeDetectionSystem();
  assert.equal(detection.suggestDirection(ant, simulation.colony.nest, 40), null);
});

test("recent-cell memory remains short", () => {
  const simulation = new Simulation();
  for (let index = 0; index < 500; index += 1) simulation.tick();
  for (const ant of simulation.colony.ants) {
    assert.ok(ant.recentCells.length <= simulation.config.recentCellMemory);
  }
});

test("all four benchmark modes complete and V0.4 returns without GPS", () => {
  function run(overrides) {
    const simulation = new Simulation({
      ...DEFAULT_CONFIG,
      reproductionEnabled: false,
      environmentEnabled: false,
      foodRegenerationRate: 0,
      ...overrides,
    });
    while (simulation.completionTick === null && simulation.tickCount < 30_000) {
      simulation.tick();
    }
    return simulation;
  }

  const modes = [
    run({ pheromonesEnabled: false, directHomeNavigation: true }),
    run({ homePheromonesEnabled: false, directHomeNavigation: true, pheromoneDiffusionRate: 0 }),
    run({ directHomeNavigation: false, pheromoneDiffusionRate: 0 }),
    run({ directHomeNavigation: false }),
  ];
  for (const simulation of modes) {
    const metrics = simulation.getMetrics();
    assert.equal(simulation.colony.resources, 240);
    assert.equal(metrics.totalPickups, 240);
    assert.ok(metrics.totalDistance > 0);
    assert.ok(metrics.averageReturnTicks > 0);
    assert.ok(metrics.exploredCells > 0);
  }
  assert.ok(modes[1].completionTick < modes[0].completionTick);
  assert.equal(modes[3].config.directHomeNavigation, false);
  assert.equal(modes[3].colony.ants.some((ant) => ant.target === modes[3].colony.nest), false);
});

test("energy consumption depends on actual distance and carrying cost", () => {
  const metabolism = new MetabolismSystem();
  const createAnt = () => new Ant({
    id: "ENERGY",
    position: { x: 0, y: 0 },
    direction: 0,
    speed: 1,
    colonyId: "C-01",
    energy: 100,
    maxEnergy: 100,
    energyConsumptionRate: 0.1,
  });
  const oneMove = createAnt();
  metabolism.consumeEnergy(oneMove, 10, 0, 1.5, 0);
  const twoMoves = createAnt();
  metabolism.consumeEnergy(twoMoves, 5, 0, 1.5, 0);
  metabolism.consumeEnergy(twoMoves, 5, 0, 1.5, 0);
  assert.equal(oneMove.energy, twoMoves.energy);
  assert.equal(oneMove.energy, 99);

  const carrier = createAnt();
  carrier.carryingFood = true;
  metabolism.consumeEnergy(carrier, 10, 0, 1.5, 0);
  assert.equal(carrier.energy, 98.5);
});

test("colony stock conserves fractional deposits and consumption", () => {
  const simulation = new Simulation(foragingConfig({ initialFoodStock: 2 }));
  simulation.colony.depositFood(1);
  assert.equal(simulation.colony.resources, 1);
  assert.equal(simulation.colony.foodStock, 3);
  assert.equal(simulation.colony.consumeFood(0.2), 0.2);
  assert.equal(simulation.colony.foodStock, 2.8);
  assert.equal(simulation.colony.consumedFood, 0.2);
});

test("low energy starts a HOME-guided return without carrying food", () => {
  const simulation = new Simulation(foragingConfig({
    energyConsumptionRate: 0,
    basalEnergyConsumptionRate: 0,
  }));
  const ant = simulation.colony.ants[0];
  ant.position = { x: 80, y: 70 };
  ant.energy = ant.maxEnergy * ant.lowEnergyThreshold;
  simulation.tick();
  assert.equal(ant.state, AntState.RETURNING_HOME);
  assert.equal(ant.returnReason, "ENERGY");
  assert.equal(ant.carryingFood, false);
  assert.equal(ant.target, null);
});

test("feeding consumes fractional stock and rests an underfed ant", () => {
  const simulation = new Simulation(foragingConfig({ initialFoodStock: 0.2 }));
  const ant = simulation.colony.ants[0];
  ant.energy = 50;
  const consumed = simulation.metabolism.feedAtNest(ant, simulation.colony, 100, 0.8);
  assert.equal(consumed, 0.2);
  assert.equal(ant.energy, 70);
  assert.equal(ant.state, AntState.RESTING);
  assert.equal(simulation.colony.foodStock, 0);
});

test("a resting ant resumes work when food becomes available", () => {
  const simulation = new Simulation(foragingConfig({ initialFoodStock: 0 }));
  const ant = simulation.colony.ants[0];
  ant.energy = 50;
  simulation.metabolism.feedAtNest(ant, simulation.colony, 30, 0.75);
  assert.equal(ant.state, AntState.RESTING);
  simulation.colony.depositFood(1);
  simulation.metabolism.feedAtNest(ant, simulation.colony, 30, 0.75);
  assert.equal(ant.state, AntState.SEARCHING_FOOD);
  assert.equal(ant.energy, 80);
});

test("a dead ant stops moving and depositing pheromones", () => {
  const simulation = new Simulation(foragingConfig({
    antEnergy: 0.1,
    antMaxEnergy: 1,
    energyConsumptionRate: 1,
    basalEnergyConsumptionRate: 0,
    lowEnergyThreshold: 0,
  }));
  const ant = simulation.colony.ants[0];
  simulation.tick();
  assert.equal(ant.state, AntState.DEAD);
  const position = { ...ant.position };
  const pheromones = simulation.pheromoneField.getStats().total;
  simulation.tick();
  assert.deepEqual(ant.position, position);
  assert.ok(simulation.pheromoneField.getStats().total <= pheromones);
  assert.equal(simulation.getMetrics().livingAnts, 0);
  assert.equal(simulation.getMetrics().deadAnts, 1);
});

test("food carried by a dead ant is tracked rather than duplicated", () => {
  const simulation = new Simulation(foragingConfig({
    foodSources: [{ x: 70, y: 40, quantity: 1, radius: 5 }],
    energyConsumptionRate: 0,
    basalEnergyConsumptionRate: 0,
    initialFoodStock: 0,
  }));
  const ant = simulation.colony.ants[0];
  ant.position = { ...simulation.foodSources[0].position };
  simulation.tick();
  assert.equal(ant.carryingFood, true);
  ant.energyConsumptionRate = 100;
  simulation.tick();
  const metrics = simulation.getMetrics();
  assert.equal(ant.state, AntState.DEAD);
  assert.equal(metrics.lostFood, 1);
  assert.equal(
    metrics.foodRemaining + metrics.foodStock + metrics.consumedFood
      + metrics.carryingAnts + metrics.lostFood,
    1,
  );
});

test("metabolic parameters produce durable and extinct colonies", () => {
  const durable = new Simulation(foragingConfig({
    initialAnts: 5,
    antEnergy: 10,
    antMaxEnergy: 10,
    initialFoodStock: 10,
    energyConsumptionRate: 0.001,
    basalEnergyConsumptionRate: 0,
  }));
  const extinct = new Simulation(foragingConfig({
    initialAnts: 5,
    antEnergy: 0.1,
    antMaxEnergy: 1,
    initialFoodStock: 0,
    foodSources: [],
    energyConsumptionRate: 1,
    basalEnergyConsumptionRate: 0.1,
    lowEnergyThreshold: 0,
  }));
  for (let index = 0; index < 500; index += 1) {
    durable.tick();
    extinct.tick();
  }
  assert.equal(durable.getMetrics().livingAnts, 5);
  assert.equal(extinct.getMetrics().livingAnts, 0);
});

test("reset restores energy, mortality, stock, and consumption", () => {
  const simulation = new Simulation(foragingConfig({ initialFoodStock: 4 }));
  const ant = simulation.colony.ants[0];
  ant.energy = 0;
  ant.state = AntState.DEAD;
  simulation.colony.consumeFood(1.25);
  simulation.lostFood = 1;
  simulation.reset();
  const metrics = simulation.getMetrics();
  assert.equal(metrics.livingAnts, 1);
  assert.equal(metrics.deadAnts, 0);
  assert.equal(simulation.colony.ants[0].energy, simulation.config.antEnergy);
  assert.equal(metrics.foodStock, 4);
  assert.equal(metrics.consumedFood, 0);
  assert.equal(metrics.lostFood, 0);
});

test("brood develops EGG to LARVA to PUPA and consumes only as a larva", () => {
  const simulation = new Simulation(foragingConfig({
    initialFoodStock: 100,
    queenLayingCooldownTicks: 100,
    reproductionFoodThreshold: 0,
    eggFoodCost: 1,
    maxBrood: 1,
    eggDurationTicks: 2,
    larvaDurationTicks: 2,
    pupaDurationTicks: 2,
    larvaFoodPerTick: 0.5,
  }));
  const system = simulation.broodSystem;
  system.update(simulation.colony, simulation.config);
  assert.equal(simulation.colony.brood[0].stage, BroodStage.EGG);
  system.update(simulation.colony, simulation.config);
  system.update(simulation.colony, simulation.config);
  assert.equal(simulation.colony.brood[0].stage, BroodStage.LARVA);
  system.update(simulation.colony, simulation.config);
  system.update(simulation.colony, simulation.config);
  assert.equal(simulation.colony.brood[0].stage, BroodStage.PUPA);
  system.update(simulation.colony, simulation.config);
  const emerged = system.update(simulation.colony, simulation.config);
  assert.equal(emerged.length, 1);
  assert.equal(simulation.colony.brood.length, 0);
  assert.equal(system.broodFoodConsumed, 1);
  assert.equal(system.layingFoodConsumed, 1);
});

test("an emerged pupa becomes a normal uniquely identified worker", () => {
  const simulation = new Simulation(foragingConfig({
    initialAnts: 0,
    initialFoodStock: 10,
    reproductionFoodThreshold: 0,
    queenLayingCooldownTicks: 100,
    eggFoodCost: 0,
    maxBrood: 1,
    eggDurationTicks: 1,
    larvaDurationTicks: 1,
    pupaDurationTicks: 1,
    larvaFoodPerTick: 0,
  }));
  for (let index = 0; index < 4; index += 1) simulation.tick();
  assert.equal(simulation.births, 1);
  assert.equal(simulation.colony.ants.length, 1);
  assert.equal(simulation.colony.ants[0].id, "ANT-001");
  assert.equal(simulation.colony.ants[0].state, AntState.SEARCHING_FOOD);
});

test("worker survival is funded before brood and new eggs", () => {
  const simulation = new Simulation(foragingConfig({
    initialFoodStock: 1,
    reproductionFoodThreshold: 0,
    eggFoodCost: 0.5,
    maxBrood: 2,
    foodEnergyValue: 100,
  }));
  const ant = simulation.colony.ants[0];
  ant.energy = 0.1;
  ant.state = AntState.RESTING;
  simulation.tick();
  assert.equal(ant.state, AntState.SEARCHING_FOOD);
  assert.equal(simulation.colony.brood.length, 0);
  assert.ok(simulation.colony.foodStock < 0.01);
});

test("larval maintenance is funded before a new egg", () => {
  const simulation = new Simulation(foragingConfig({
    initialFoodStock: 0.5,
    reproductionFoodThreshold: 0,
    eggFoodCost: 0.5,
    larvaFoodPerTick: 0.5,
    larvaDurationTicks: 10,
  }));
  const larva = new Brood({ id: "LARVA-TEST" });
  larva.stage = BroodStage.LARVA;
  simulation.colony.brood.push(larva);
  simulation.broodSystem.update(simulation.colony, simulation.config);
  assert.equal(larva.foodConsumed, 0.5);
  assert.equal(simulation.colony.brood.length, 1);
  assert.equal(simulation.colony.queen.eggsLaid, 0);
});

test("queen respects stock threshold, cooldown, and maximum brood", () => {
  const simulation = new Simulation(foragingConfig({
    initialFoodStock: 20,
    reproductionFoodThreshold: 10,
    queenLayingCooldownTicks: 5,
    eggFoodCost: 1,
    maxBrood: 1,
  }));
  simulation.broodSystem.update(simulation.colony, simulation.config);
  assert.equal(simulation.colony.brood.length, 1);
  assert.equal(simulation.colony.queen.cooldownRemaining, 5);
  simulation.broodSystem.update(simulation.colony, simulation.config);
  assert.equal(simulation.colony.brood.length, 1);
  simulation.colony.brood = [];
  simulation.colony.foodStock = 5;
  for (let index = 0; index < 5; index += 1) {
    simulation.broodSystem.update(simulation.colony, simulation.config);
  }
  assert.equal(simulation.colony.brood.length, 0);
});

test("food regeneration is bounded and waits for a collectable unit", () => {
  const simulation = new Simulation(foragingConfig({
    foodSources: [{ x: 70, y: 40, quantity: 2, radius: 5 }],
  }));
  const source = simulation.foodSources[0];
  source.take(2);
  assert.equal(source.active, false);
  assert.equal(source.regenerate(0.4), 0.4);
  assert.equal(source.active, false);
  source.regenerate(0.6);
  assert.equal(source.active, true);
  assert.equal(source.regenerate(10), 1);
  assert.equal(source.quantity, source.initialQuantity);
});

test("demographic metrics and reset include queen, brood, births, and deaths", () => {
  const simulation = new Simulation(foragingConfig({
    initialAnts: 2,
    initialFoodStock: 20,
    reproductionFoodThreshold: 0,
  }));
  simulation.colony.ants[0].state = AntState.DEAD;
  simulation.births = 3;
  simulation.colony.brood.push(new Brood({ id: "METRIC-EGG" }));
  simulation.maxPopulation = 8;
  let metrics = simulation.getMetrics();
  assert.equal(metrics.totalPopulation, 3);
  assert.equal(metrics.births, 3);
  assert.equal(metrics.deaths, 1);
  assert.equal(metrics.netGrowth, 2);
  assert.equal(metrics.eggs, 1);
  assert.equal(metrics.maxPopulation, 8);
  simulation.reset();
  metrics = simulation.getMetrics();
  assert.equal(metrics.totalPopulation, 3);
  assert.equal(metrics.births, 0);
  assert.equal(metrics.deaths, 0);
  assert.equal(metrics.broodSize, 0);
  assert.equal(simulation.colony.queen.eggsLaid, 0);
});

test("regenerated food remains conserved across environment and colony", () => {
  const simulation = new Simulation(foragingConfig({
    initialFoodStock: 3,
    foodRegenerationRate: 0.01,
  }));
  for (let index = 0; index < 500; index += 1) simulation.tick();
  const metrics = simulation.getMetrics();
  const initialFood = simulation.initialFoodQuantity + simulation.config.initialFoodStock;
  const accounted = metrics.foodRemaining + metrics.foodStock + metrics.consumedFood
    + metrics.carriedFood + metrics.lostFood;
  assert.ok(Math.abs(initialFood + metrics.regeneratedFood - accounted) < 1e-8);
});

test("aggressive reproduction can cause a boom followed by famine and contraction", () => {
  const simulation = new Simulation(foragingConfig({
    initialAnts: 5,
    initialFoodStock: 30,
    foodSources: [{ x: 60, y: 40, quantity: 20, radius: 6 }],
    directHomeNavigation: true,
    queenLayingCooldownTicks: 5,
    reproductionFoodThreshold: 1,
    eggFoodCost: 0.1,
    maxBrood: 20,
    eggDurationTicks: 10,
    larvaDurationTicks: 10,
    pupaDurationTicks: 10,
    larvaFoodPerTick: 0.1,
    energyConsumptionRate: 0.05,
    basalEnergyConsumptionRate: 0.1,
    foodEnergyValue: 10,
  }));
  for (let index = 0; index < 5_000; index += 1) simulation.tick();
  const metrics = simulation.getMetrics();
  assert.ok(metrics.births > 0);
  assert.ok(metrics.deaths > 0);
  assert.ok(metrics.maxPopulation > metrics.totalPopulation);
  assert.equal(metrics.foodStock, 0);
  assert.ok(metrics.netGrowth < metrics.births);
});

test("environment cycles deterministically through four seasons", () => {
  const system = new EnvironmentSystem();
  const config = { environmentEnabled: true, seasonDurationTicks: 10, environmentSeverity: 1 };
  assert.equal(system.getState(0, config).season, Season.SPRING);
  assert.equal(system.getState(10, config).season, Season.SUMMER);
  assert.equal(system.getState(20, config).season, Season.AUTUMN);
  assert.equal(system.getState(30, config).season, Season.WINTER);
  assert.equal(system.getState(40, config).season, Season.SPRING);
  assert.equal(system.getState(40, config).cycle, 1);
  assert.ok(system.getState(30, config).metabolismMultiplier > 1);
  assert.ok(system.getState(30, config).foodRegenerationMultiplier < 1);
});

test("a depleted food source cools down and respawns elsewhere", () => {
  const source = new FoodSource({ id: "F", x: 5, y: 5, quantity: 1, radius: 2 });
  source.take(1);
  assert.equal(source.state, FoodSourceState.DEPLETED);
  const system = new FoodSpawnSystem(() => 0.5);
  const config = {
    foodRegenerationRate: 0,
    foodSourceLifetimeTicks: 100,
    foodRespawnDelayTicks: 2,
    foodSpawnProbability: 1,
    maxActiveSources: 1,
    foodSpawnMargin: 10,
    foodMinQuantity: 4,
    foodMaxQuantity: 8,
    foodSourceRadius: 3,
  };
  const world = new World(100, 80);
  system.update([source], world, config, 1);
  assert.equal(source.state, FoodSourceState.COOLDOWN);
  system.update([source], world, config, 1);
  system.update([source], world, config, 1);
  assert.equal(source.state, FoodSourceState.SPAWN);
  assert.deepEqual(source.position, { x: 50, y: 40 });
  assert.equal(source.quantity, 6);
  system.update([source], world, config, 1);
  assert.equal(source.state, FoodSourceState.ACTIVE);
});

test("dynamic worlds enforce the active source ceiling from reset", () => {
  const simulation = new Simulation({
    ...DEFAULT_CONFIG,
    maxActiveSources: 2,
    dangerZones: [],
  });
  assert.equal(simulation.foodSources.length, 2);
  for (let index = 0; index < 100; index += 1) simulation.tick();
  assert.ok(simulation.getMetrics().foodSources <= 2);
});

test("danger zones increase movement cost and can cause environmental death", () => {
  const zone = new DangerZone({
    id: "D",
    x: 10,
    y: 10,
    radius: 5,
    energyMultiplier: 3,
    mortalityProbability: 0.5,
  });
  const hazard = new HazardSystem();
  const ant = new Ant({
    id: "AT-RISK",
    position: { x: 10, y: 10 },
    direction: 0,
    speed: 1,
    colonyId: "C-01",
  });
  assert.equal(hazard.movementMultiplier(ant.position, [zone]), 3);
  assert.equal(hazard.movementMultiplier({ x: 30, y: 30 }, [zone]), 1);
  assert.equal(hazard.applyMortality(ant, [zone], 1, () => 0.25), true);
  assert.equal(ant.state, AntState.DEAD);
});

test("winter slows brood development without seasonal queen decisions", () => {
  const simulation = new Simulation(foragingConfig({
    initialFoodStock: 10,
    maxBrood: 1,
    reproductionFoodThreshold: 100,
    eggDurationTicks: 10,
  }));
  const brood = new Brood({ id: "WINTER-EGG" });
  simulation.colony.brood.push(brood);
  simulation.broodSystem.update(simulation.colony, simulation.config, 0.4);
  assert.equal(brood.stageAge, 0.4);
  assert.equal(brood.stage, BroodStage.EGG);
});

test("environment metrics and dynamic source positions reset reproducibly", () => {
  const simulation = new Simulation({
    ...foragingConfig(),
    environmentEnabled: true,
    seasonDurationTicks: 3,
    foodSpawnProbability: 1,
    maxActiveSources: 2,
    dangerZones: [],
  });
  for (let index = 0; index < 13; index += 1) simulation.tick();
  const firstWorld = JSON.stringify(simulation.foodSources);
  const metrics = simulation.getMetrics();
  assert.equal(metrics.season, Season.SPRING);
  assert.equal(metrics.seasonCycle, 1);
  assert.equal(metrics.seasonCyclesCompleted, 1);
  assert.ok(metrics.foodSources <= 2);
  simulation.reset();
  for (let index = 0; index < 13; index += 1) simulation.tick();
  assert.equal(JSON.stringify(simulation.foodSources), firstWorld);
});

test("autonomy estimates how long the current stock funds recent consumption", () => {
  const simulation = new Simulation(foragingConfig({ initialFoodStock: 10 }));
  simulation.consumptionWindow = [0.5, 1.5];
  simulation.consumptionWindowTotal = 2;
  assert.equal(simulation.getMetrics().averageConsumptionPerTick, 1);
  assert.equal(simulation.getMetrics().autonomyTicks, 10);
});

test("stored food improves survival through repeated seasonal pressure", () => {
  const run = (initialFoodStock) => {
    const simulation = new Simulation({
      ...foragingConfig(),
      initialAnts: 5,
      antSpeed: 0,
      antEnergy: 1,
      antMaxEnergy: 1,
      initialFoodStock,
      foodSources: [],
      environmentEnabled: true,
      seasonDurationTicks: 20,
      foodSpawnProbability: 0,
      maxActiveSources: 0,
      dangerZones: [],
      reproductionEnabled: false,
      basalEnergyConsumptionRate: 0.5,
      foodEnergyValue: 10,
      nest: { x: 60, y: 40, radius: 10 },
    });
    for (let index = 0; index < 200; index += 1) simulation.tick();
    return simulation.getMetrics().livingAnts;
  };
  assert.equal(run(0), 0);
  assert.ok(run(10) > 0);
});

test("ALARM is an independent pheromone layer with faster configurable decay", () => {
  const field = new PheromoneField(60, 60, 10, 100);
  const position = { x: 25, y: 25 };
  field.deposit(PheromoneType.FOOD, position, 10);
  field.deposit(PheromoneType.ALARM, position, 10);
  field.update({
    evaporationRate: 0.01,
    diffusionRate: 0,
    minimumIntensity: 0,
    types: [PheromoneType.FOOD],
  });
  field.update({
    evaporationRate: 0.2,
    diffusionRate: 0,
    minimumIntensity: 0,
    types: [PheromoneType.ALARM],
  });
  assert.ok(Math.abs(field.sample(PheromoneType.FOOD, position) - 9.9) < 1e-6);
  assert.equal(field.sample(PheromoneType.ALARM, position), 8);
  assert.equal(field.sample(PheromoneType.HOME, position), 0);
});

test("direction scoring avoids ALARM while retaining directional alternatives", () => {
  const field = new PheromoneField(100, 100, 5, 100);
  const ant = new Ant({
    id: "SCOUT",
    position: { x: 50, y: 50 },
    direction: 0,
    speed: 1,
    colonyId: "C-01",
  });
  field.deposit(PheromoneType.ALARM, { x: 70, y: 50 }, 80);
  const scoring = new DirectionScoringSystem(() => 0.5);
  const suggestion = scoring.suggestDirection(ant, field, {
    distance: 20,
    arc: Math.PI,
    samples: 3,
    minimumSignal: 0.001,
    minimumAlarmSignal: 0.001,
    revisitPenalty: 1,
    foodWeight: 1,
    homeWeight: 0,
    alarmWeight: 2,
    inertiaWeight: 0.1,
    noiseWeight: 0.02,
    baseInfluence: 0.6,
  });
  assert.ok(Math.abs(suggestion.direction) > 1);
  assert.ok(suggestion.alarm > 1);
  assert.equal(Object.hasOwn(scoring, "dangerZones"), false);
});

test("hazard damage and environmental death create different ALARM deposits", () => {
  const damage = new Simulation({
    ...foragingConfig(),
    environmentEnabled: true,
    reproductionEnabled: false,
    foodSpawnProbability: 0,
    dangerZones: [{
      id: "SAFE-DAMAGE",
      x: 15,
      y: 40,
      radius: 30,
      energyMultiplier: 3,
      mortalityProbability: 0,
    }],
    energyConsumptionRate: 0.1,
    alarmDamageThreshold: 0,
  });
  damage.tick();
  assert.ok(damage.getMetrics().damageAlarmDeposits > 0);
  const damageAlarm = damage.getMetrics().alarmPheromones.total;

  const lethal = new Simulation({
    ...foragingConfig(),
    environmentEnabled: true,
    reproductionEnabled: false,
    foodSpawnProbability: 0,
    dangerZones: [{
      id: "LETHAL",
      x: 15,
      y: 40,
      radius: 30,
      energyMultiplier: 1,
      mortalityProbability: 2,
    }],
  });
  lethal.tick();
  assert.equal(lethal.getMetrics().environmentalDeaths, 1);
  assert.equal(lethal.getMetrics().deathAlarmDeposits, 1);
  assert.ok(lethal.getMetrics().alarmPheromones.total > damageAlarm);

  const disabled = new Simulation({
    ...lethal.config,
    alarmPheromonesEnabled: false,
  });
  disabled.tick();
  assert.equal(disabled.getMetrics().environmentalDeaths, 1);
  assert.equal(disabled.getMetrics().alarmPheromones.total, 0);
});

test("safe passage creates no ALARM and reset clears learned danger", () => {
  const simulation = new Simulation({
    ...foragingConfig(),
    environmentEnabled: true,
    reproductionEnabled: false,
    foodSpawnProbability: 0,
    dangerZones: [],
  });
  for (let index = 0; index < 20; index += 1) simulation.tick();
  assert.deepEqual(simulation.getMetrics().alarmPheromones, {
    total: 0,
    activeCells: 0,
    maximum: 0,
  });
  simulation.pheromoneField.deposit(PheromoneType.ALARM, { x: 20, y: 20 }, 10);
  simulation.reset();
  assert.equal(simulation.getMetrics().alarmPheromones.total, 0);
});

test("ant behaviors receive signals but never danger-zone geometry", () => {
  const simulation = new Simulation();
  assert.equal(Object.hasOwn(simulation.searchFood, "dangerZones"), false);
  assert.equal(Object.hasOwn(simulation.returnHome, "dangerZones"), false);
  assert.equal(Object.hasOwn(simulation.directionScoring, "dangerZones"), false);
  assert.ok(simulation.hazard.exposure(
    simulation.dangerZones[0].position,
    simulation.dangerZones,
  ).exposed);
});

test("metrics recording samples at a fixed interval with bounded memory", () => {
  const simulation = new Simulation(foragingConfig());
  const recorder = new MetricsRecorder({ sampleInterval: 2, maxSamples: 3 });
  recorder.record(simulation, { force: true });
  for (let index = 0; index < 8; index += 1) {
    simulation.tick();
    recorder.record(simulation);
  }
  assert.deepEqual(recorder.series.samples.map((sample) => sample.tick), [4, 6, 8]);
  assert.equal(recorder.series.samples[2].population, 1);
  assert.ok(Object.isFrozen(recorder.series.samples[2]));
});

test("time series and event logs discard their oldest entries", () => {
  const series = new TimeSeries({ maxSamples: 2 });
  series.append({ tick: 1 });
  series.append({ tick: 2 });
  series.append({ tick: 3 });
  assert.deepEqual(series.toJSON().map((sample) => sample.tick), [2, 3]);
  const log = new EventLog({ maxEvents: 2 });
  log.capture([{ tick: 1, type: "A" }, { tick: 2, type: "B" }, { tick: 3, type: "C" }]);
  assert.deepEqual(log.toJSON().map((event) => event.type), ["B", "C"]);
});

test("structured simulation events explain seasons, laying, depletion, and deaths", () => {
  const simulation = new Simulation({
    ...foragingConfig(),
    environmentEnabled: true,
    seasonDurationTicks: 1,
    foodSpawnProbability: 0,
    initialFoodStock: 100,
    reproductionFoodThreshold: 0,
    queenLayingCooldownTicks: 100,
    dangerZones: [],
  });
  simulation.colony.ants[0].position = { ...simulation.foodSources[0].position };
  simulation.foodSources[0].quantity = 1;
  simulation.tick();
  assert.ok(simulation.tickEvents.some((event) => event.type === "FOOD_SOURCE_DEPLETED"));
  assert.ok(simulation.tickEvents.some((event) => event.type === "QUEEN_LAID_EGG"));
  simulation.tick();
  assert.ok(simulation.tickEvents.some((event) => (
    event.type === "SEASON_CHANGED" && event.from === Season.SPRING
  )));
});

test("JSON and CSV exports contain reproducible configuration and sampled series", () => {
  const simulation = new Simulation(foragingConfig());
  const recorder = new MetricsRecorder({ sampleInterval: 1 });
  const eventLog = new EventLog();
  recorder.record(simulation, { force: true });
  simulation.tick();
  recorder.record(simulation);
  eventLog.capture(simulation.tickEvents);
  const exported = createRunExport({ simulation, recorder, eventLog, version: "0.9.0" });
  assert.equal(exported.format, "formica-run");
  assert.match(exported.runId, /^[0-9A-F]{8}$/);
  assert.equal(exported.seed, simulation.config.seed);
  assert.equal(exported.duration, 1);
  assert.equal(exported.series.length, 2);
  assert.equal(exported.config.schemaVersion, 1);
  assert.deepEqual(normalizeConfig(exported.config), simulation.config);
  const csv = seriesToCsv(exported.series);
  assert.match(csv, /^tick,population,foodStock/);
  assert.equal(csv.trim().split("\n").length, 3);
});

test("scenario presets produce independent complete configurations", () => {
  assert.ok(SCENARIO_PRESETS.length >= 7);
  const first = configForPreset("persistent-alarm");
  const second = configForPreset("persistent-alarm");
  assert.equal(first.alarmInfluence, 4);
  assert.equal(first.width, DEFAULT_CONFIG.width);
  first.dangerZones[0].radius = 1;
  assert.notEqual(first.dangerZones[0].radius, second.dangerZones[0].radius);
});

test("the common experiment runner returns standard summaries, series, and events", () => {
  const runner = new ExperimentRunner();
  const result = runner.run({
    config: { ...foragingConfig(), seasonDurationTicks: 2, environmentEnabled: true },
    ticks: 5,
    sampleInterval: 2,
  });
  assert.equal(result.metrics.tick, 5);
  assert.equal(result.summary.duration, 5);
  assert.deepEqual(result.series.map((sample) => sample.tick), [0, 2, 4]);
  assert.ok(result.events.some((event) => event.type === "SEASON_CHANGED"));
});

test("observability does not alter deterministic simulation results", () => {
  const observed = new Simulation();
  const control = new Simulation();
  const recorder = new MetricsRecorder({ sampleInterval: 5 });
  const log = new EventLog();
  for (let index = 0; index < 500; index += 1) {
    observed.tick();
    recorder.record(observed);
    log.capture(observed.tickEvents);
    control.tick();
  }
  assert.equal(JSON.stringify(observed.colony), JSON.stringify(control.colony));
  assert.deepEqual(
    observed.pheromoneField.layer(PheromoneType.ALARM),
    control.pheromoneField.layer(PheromoneType.ALARM),
  );
});

test("versioned configuration round-trips every engine setting", () => {
  const versioned = toVersionedConfig(foragingConfig(), { sampleInterval: 25 });
  assert.equal(versioned.schemaVersion, 1);
  assert.equal(versioned.analytics.sampleInterval, 25);
  assert.deepEqual(normalizeConfig(versioned), new Simulation(foragingConfig()).config);
  const mappedKeys = Object.values(CONFIG_SECTIONS).flat().sort();
  assert.deepEqual(mappedKeys, Object.keys(DEFAULT_CONFIG).sort());
});

test("configuration validation rejects unknown schemas and invalid values", () => {
  const versioned = toVersionedConfig(DEFAULT_CONFIG);
  assert.throws(() => normalizeConfig({ ...versioned, schemaVersion: 2 }), /non prise en charge/);
  assert.throws(() => normalizeConfig({ ...versioned, surprise: {} }), /section inconnue/);
  assert.throws(() => normalizeConfig({ ...versioned, analytics: null }), /analytics/);
  assert.throws(() => normalizeConfig({ ...DEFAULT_CONFIG, width: 0 }), /width/);
  assert.throws(() => normalizeConfig({ ...DEFAULT_CONFIG, dangerZones: "danger" }), /dangerZones/);
});

test("public engine API runs headlessly with an explicit seed and immutable snapshots", () => {
  const simulation = new Simulation(foragingConfig(), 991);
  assert.equal(simulation.config.seed, 991);
  assert.equal(simulation.run(12), simulation);
  assert.equal(simulation.tickCount, 12);
  const state = simulation.getState();
  assert.equal(state.tick, 12);
  assert.equal(state.config.schemaVersion, 1);
  state.colony.foodStock = -100;
  state.pheromones.FOOD[0] = -100;
  assert.notEqual(simulation.colony.foodStock, -100);
  assert.notEqual(simulation.pheromoneField.layer(PheromoneType.FOOD)[0], -100);
  assert.throws(() => simulation.run(-1), /non-negative integer/);
});

test("engine invariants hold through a dynamic run and report corruption", () => {
  const simulation = new Simulation();
  simulation.run(2_000);
  assert.equal(assertSimulationInvariants(simulation).valid, true);
  simulation.colony.foodStock = -1;
  const report = inspectSimulationInvariants(simulation);
  assert.equal(report.valid, false);
  assert.ok(report.violations.some(({ name }) => name === "non-negative-food-stock"));
});

test("pause conditions identify events and numeric thresholds deterministically", () => {
  const metrics = { livingAnts: 8, broodSize: 2, totalPopulation: 11, foodStock: 3 };
  assert.equal(evaluatePauseConditions(
    [{ type: "SEASON_CHANGED" }],
    metrics,
    { season: true, stock: null },
  ), "changement de saison");
  assert.equal(evaluatePauseConditions([], metrics, { population: 10, stock: null }), "population ≥ 10");
  assert.equal(evaluatePauseConditions([], metrics, { stock: 4 }), "stock ≤ 4");
  assert.equal(evaluatePauseConditions([], metrics, { stock: null }), null);
});

test("multi-colony simulation creates independent nests, queens, workers, and stocks", () => {
  const simulation = new Simulation(multiColonyConfig());
  assert.equal(simulation.colonies.length, 2);
  assert.equal(simulation.colony, simulation.colonies[0]);
  assert.deepEqual(simulation.colonies.map(({ id }) => id), ["A", "B"]);
  for (const colony of simulation.colonies) {
    assert.equal(colony.queen.colonyId, colony.id);
    assert.ok(colony.ants.every((ant) => ant.colonyId === colony.id));
  }
  assert.notEqual(simulation.colonies[0].nest.position.x, simulation.colonies[1].nest.position.x);
});

test("an ant deposits and senses pheromones only in its own colony field", () => {
  const simulation = new Simulation(multiColonyConfig());
  const [a, b] = simulation.colonies;
  const antA = a.ants[0];
  antA.position = { x: 70, y: 50 };
  simulation.depositTrail(antA);
  assert.ok(simulation.colonyPheromones.get("A").getStats(PheromoneType.HOME).total > 0);
  assert.equal(simulation.colonyPheromones.get("B").getStats(PheromoneType.HOME).total, 0);

  simulation.colonyPheromones.clear();
  simulation.colonyPheromones.get("B").deposit(
    PheromoneType.FOOD,
    { x: antA.position.x + 10, y: antA.position.y },
    50,
  );
  assert.equal(simulation.senseTrail(antA, PheromoneType.FOOD), null);
  assert.equal(simulation.senseTrail(b.ants[0], PheromoneType.FOOD), null);
});

test("shared food pickup is atomic and alternating order removes a fixed first-colony advantage", () => {
  const winnerAtTick = (tick) => {
    const simulation = new Simulation(multiColonyConfig());
    simulation.tickCount = tick;
    for (const colony of simulation.colonies) {
      colony.ants[0].position = { ...simulation.foodSources[0].position };
    }
    simulation.tick();
    assert.equal(simulation.foodSources[0].quantity, 0);
    assert.equal(simulation.colonies.flatMap((colony) => colony.ants)
      .filter((ant) => ant.carryingFood).length, 1);
    return simulation.colonies.find((colony) => colony.ants[0].carryingFood).id;
  };
  assert.equal(winnerAtTick(0), "A");
  assert.equal(winnerAtTick(1), "B");
});

test("both colonies can collect distinct units from the same shared source", () => {
  const simulation = new Simulation(multiColonyConfig({
    foodSources: [{ id: "SHARED", x: 100, y: 50, quantity: 2, radius: 6 }],
  }));
  for (const colony of simulation.colonies) {
    colony.ants[0].position = { ...simulation.foodSources[0].position };
  }
  simulation.tick();
  assert.equal(simulation.foodSources[0].quantity, 0);
  assert.ok(simulation.colonies.every((colony) => colony.ants[0].carryingFood));
});

test("a foreign nest cannot receive another colony's carried food", () => {
  const simulation = new Simulation(multiColonyConfig());
  const [a, b] = simulation.colonies;
  const ant = a.ants[0];
  ant.carryingFood = true;
  ant.carryingFoodAmount = 1;
  ant.state = AntState.RETURNING_HOME;
  ant.position = { ...b.nest.position };
  const collection = new FoodCollectionSystem();
  assert.equal(collection.deposit(ant, b), false);
  assert.equal(b.foodStock, 0);
  assert.equal(ant.carryingFood, true);
});

test("reproduction remains isolated per colony", () => {
  const config = multiColonyConfig({
    colonies: multiColonyConfig().colonies.map((colony, index) => ({
      ...colony,
      initialFoodStock: 100,
      reproductionEnabled: index === 0,
      reproductionFoodThreshold: 0,
      queenLayingCooldownTicks: 1,
    })),
  });
  const simulation = new Simulation(config);
  simulation.tick();
  assert.equal(simulation.colonies[0].brood.length, 1);
  assert.equal(simulation.colonies[1].brood.length, 0);
});

test("mortality and death ALARM remain isolated per colony", () => {
  const simulation = new Simulation(multiColonyConfig());
  const [a, b] = simulation.colonies;
  const ant = a.ants[0];
  ant.state = AntState.DEAD;
  ant.energy = 0;
  simulation.handleDeath(ant, "ENVIRONMENT", a);
  assert.equal(simulation.getColonyMetrics("A").environmentalDeaths, 1);
  assert.equal(simulation.getColonyMetrics("B").environmentalDeaths, 0);
  assert.ok(simulation.colonyPheromones.get("A").getStats(PheromoneType.ALARM).total > 0);
  assert.equal(simulation.colonyPheromones.get("B").getStats(PheromoneType.ALARM).total, 0);
  assert.equal(b.ants[0].state, AntState.SEARCHING_FOOD);
});

test("foreign proximity produces local observations, metrics, and colony-tagged events", () => {
  const simulation = new Simulation(multiColonyConfig());
  const [antA, antB] = simulation.colonies.map((colony) => colony.ants[0]);
  antA.position = { x: 100, y: 50 };
  antB.position = { x: 105, y: 50 };
  simulation.tick();
  assert.deepEqual(antA.nearbyForeignAnts, [antB.id]);
  assert.deepEqual(antB.nearbyForeignAnts, [antA.id]);
  assert.equal(simulation.getMetrics().foreignContacts, 1);
  assert.ok(simulation.tickEvents.some((event) => (
    event.type === "FOREIGN_CONTACT" && event.colonyId === "A" && event.foreignColonyId === "B"
  )));
});

test("territory map exposes controlled and contested cells without affecting behavior", () => {
  const simulation = new Simulation(multiColonyConfig());
  const position = { x: 100, y: 50 };
  simulation.colonyPheromones.get("A").deposit(PheromoneType.HOME, position, 5);
  simulation.colonyPheromones.get("B").deposit(PheromoneType.FOOD, position, 5);
  simulation.territoryMap.update(simulation.pheromoneFields, ["A", "B"], {
    minimumInfluence: 0.1,
    contestThreshold: 0.5,
  });
  assert.ok(simulation.territoryMap.getStats().contested > 0);
  assert.equal(simulation.colonies[0].ants[0].nearbyForeignAnts.length, 0);
});

test("TERRITORY is deposited near the nest and decays independently per colony", () => {
  const simulation = new Simulation(multiColonyConfig());
  for (let index = 0; index < 20; index += 1) simulation.tick();
  const territoryA = simulation.colonyPheromones.get("A").getStats(PheromoneType.TERRITORY);
  const territoryB = simulation.colonyPheromones.get("B").getStats(PheromoneType.TERRITORY);
  assert.ok(territoryA.total > 0);
  assert.ok(territoryB.total > 0);
  const positionNearB = { x: 178, y: 50 };
  assert.equal(simulation.colonyPheromones.get("A").sample(PheromoneType.TERRITORY, positionNearB), 0);
});

test("direction scoring avoids a foreign colony's TERRITORY signal before any contact", () => {
  const ownField = new PheromoneField(100, 100, 5, 100);
  const foreignField = new PheromoneField(100, 100, 5, 100);
  const ant = new Ant({
    id: "SCOUT", position: { x: 50, y: 50 }, direction: 0, speed: 1, colonyId: "A",
  });
  foreignField.deposit(PheromoneType.TERRITORY, { x: 70, y: 50 }, 80);
  const scoring = new DirectionScoringSystem(() => 0.5);
  const suggestion = scoring.suggestDirection(ant, ownField, {
    distance: 20,
    arc: Math.PI,
    samples: 3,
    minimumSignal: 0.001,
    minimumAlarmSignal: 0.001,
    revisitPenalty: 1,
    foodWeight: 1,
    homeWeight: 0,
    alarmWeight: 0,
    foreignFields: [foreignField],
    territoryWeight: 2,
    inertiaWeight: 0.1,
    noiseWeight: 0.02,
    baseInfluence: 0.6,
  });
  assert.ok(Math.abs(suggestion.direction) > 1);
});

test("encounter reaction avoids contact for a low-energy ant and ignores it for a healthy one", () => {
  const system = new EncounterReactionSystem();
  const weary = new Ant({ id: "WEARY", position: { x: 0, y: 0 }, direction: 0, speed: 0, colonyId: "A" });
  weary.energy = weary.maxEnergy * 0.1;
  weary.nearbyForeignAnts = ["OTHER"];
  const fresh = new Ant({ id: "FRESH", position: { x: 0, y: 0 }, direction: 0, speed: 0, colonyId: "A" });
  fresh.nearbyForeignAnts = ["OTHER"];
  assert.equal(system.evaluate(weary, 0.35), EncounterReaction.AVOID);
  assert.equal(system.evaluate(fresh, 0.35), EncounterReaction.IGNORE);
});

test("a low-energy foreign encounter turns the ant away, counts avoidance, and emits an event", () => {
  const simulation = new Simulation(multiColonyConfig());
  const [antA, antB] = simulation.colonies.map((colony) => colony.ants[0]);
  antA.position = { x: 100, y: 50 };
  antB.position = { x: 105, y: 50 };
  antA.energy = antA.maxEnergy * 0.1;
  antB.energy = antB.maxEnergy * 0.1;
  const directionBefore = antA.direction;
  simulation.tick();
  assert.equal(simulation.getMetrics().avoidedContacts, 2);
  assert.equal(simulation.getColonyMetrics("A").avoidedContacts, 1);
  assert.equal(simulation.getColonyMetrics("B").avoidedContacts, 1);
  assert.notEqual(antA.direction, directionBefore);
  assert.ok(simulation.tickEvents.some((event) => (
    event.type === "FOREIGN_AVOIDANCE" && event.colonyId === "A"
  )));
  assert.ok(simulation.tickEvents.some((event) => (
    event.type === "FOREIGN_AVOIDANCE" && event.colonyId === "B"
  )));
});

test("a full-energy single foreign contact is ignored and not counted as avoidance", () => {
  const simulation = new Simulation(multiColonyConfig());
  const [antA, antB] = simulation.colonies.map((colony) => colony.ants[0]);
  antA.position = { x: 100, y: 50 };
  antB.position = { x: 105, y: 50 };
  simulation.tick();
  assert.equal(simulation.getMetrics().avoidedContacts, 0);
});

function combatConfig(overrides = {}) {
  return multiColonyConfig({
    combatRadius: 10,
    combatAttackThreshold: 0,
    combatThreatenThreshold: 0,
    combatFleeHealthRatio: 0,
    lowEnergyThreshold: 0,
    ...overrides,
  });
}

test("no attack ever occurs between allies of the same colony", () => {
  const simulation = new Simulation(combatConfig());
  const colonyA = simulation.colonies[0];
  const ally = new Ant({
    id: "A-ANT-002", position: { x: 100, y: 50 }, direction: 0, speed: 0, colonyId: "A",
  });
  ally.maxHealth = colonyA.ants[0].maxHealth;
  ally.health = ally.maxHealth;
  ally.attackPower = colonyA.ants[0].attackPower;
  colonyA.ants.push(ally);
  colonyA.ants[0].position = { x: 101, y: 50 };
  simulation.tick();
  assert.equal(simulation.tickEvents.some((event) => event.type === "ANT_ATTACKED"), false);
  assert.equal(ally.health, ally.maxHealth);
});

test("a dead ant cannot attack and is never targeted as an active combatant", () => {
  const simulation = new Simulation(combatConfig());
  const [antA, antB] = simulation.colonies.map((colony) => colony.ants[0]);
  antA.position = { x: 100, y: 50 };
  antB.position = { x: 102, y: 50 };
  antB.state = AntState.DEAD;
  const healthBefore = antB.health;
  simulation.tick();
  assert.equal(simulation.tickEvents.some((event) => (
    event.type === "ANT_ATTACKED" || event.type === "COMBAT_STARTED"
  )), false);
  assert.equal(antB.health, healthBefore);
});

test("combat damage is deterministic for an identical seed, config, and tick", () => {
  const config = combatConfig();
  const runOnce = () => {
    const simulation = new Simulation(config);
    const [antA, antB] = simulation.colonies.map((colony) => colony.ants[0]);
    antA.position = { x: 100, y: 50 };
    antB.position = { x: 102, y: 50 };
    simulation.tick();
    return antB.health;
  };
  assert.equal(runOnce(), runOnce());
});

test("mutual attacks resolve fairly: both ants land their hit even if one dies", () => {
  const simulation = new Simulation(combatConfig({
    combatAttackPower: 1000,
    combatDamageRandomMin: 1,
    combatDamageRandomMax: 1,
  }));
  const [antA, antB] = simulation.colonies.map((colony) => colony.ants[0]);
  antA.position = { x: 100, y: 50 };
  antB.position = { x: 102, y: 50 };
  simulation.tick();
  assert.ok(antA.health <= 0);
  assert.ok(antB.health <= 0);
  assert.equal(simulation.getMetrics().attacks, 2);
  assert.equal(simulation.getMetrics().fights, 1);
});

test("combat outcome totals are independent of colony declaration order", () => {
  const forward = combatConfig();
  const backward = combatConfig({ colonies: [...combatConfig().colonies].reverse() });
  const run = (config) => {
    const simulation = new Simulation(config);
    const [first, second] = simulation.colonies.map((colony) => colony.ants[0]);
    first.position = { x: 100, y: 50 };
    second.position = { x: 102, y: 50 };
    simulation.tick();
    return { attacks: simulation.getMetrics().attacks, deaths: simulation.getMetrics().combatDeaths };
  };
  assert.deepEqual(run(forward), run(backward));
});

test("a combat death is tagged with cause COMBAT and credits the killer's colony", () => {
  const simulation = new Simulation(combatConfig({ combatAttackPower: 1000 }));
  const [antA, antB] = simulation.colonies.map((colony) => colony.ants[0]);
  antA.position = { x: 100, y: 50 };
  antB.position = { x: 102, y: 50 };
  antB.attackPower = 0;
  simulation.tick();
  assert.equal(antB.state, AntState.DEAD);
  const deathEvent = simulation.tickEvents.find((event) => event.type === "COMBAT_DEATH");
  assert.ok(deathEvent);
  assert.equal(deathEvent.colonyId, "B");
  assert.equal(deathEvent.killerColonyId, "A");
  assert.equal(simulation.getColonyMetrics("B").combatLosses, 1);
  assert.equal(simulation.getColonyMetrics("A").kills, 1);
  assert.equal(simulation.tickEvents.some((event) => event.type === "WORKER_DIED"), false);
  assert.equal(simulation.tickEvents.some((event) => event.type === "ENVIRONMENTAL_DEATH"), false);
});

test("a combat death deposits ALARM distinctly from an environmental death", () => {
  const simulation = new Simulation(combatConfig({ combatAttackPower: 1000 }));
  const [antA, antB] = simulation.colonies.map((colony) => colony.ants[0]);
  antA.position = { x: 100, y: 50 };
  antB.position = { x: 102, y: 50 };
  antB.attackPower = 0;
  simulation.tick();
  assert.ok(simulation.colonyPheromones.get("B").getStats(PheromoneType.ALARM).total > 0);
});

test("the energy cost of an attack is applied exactly once per attack action", () => {
  const simulation = new Simulation(combatConfig({ basalEnergyConsumptionRate: 0 }));
  const [antA, antB] = simulation.colonies.map((colony) => colony.ants[0]);
  antA.position = { x: 100, y: 50 };
  antB.position = { x: 102, y: 50 };
  antB.attackPower = 0;
  const energyBefore = antA.energy;
  simulation.tick();
  assert.equal(antA.energy, energyBefore - simulation.config.combatAttackEnergyCost);
  assert.equal(antA.combatCooldown, simulation.config.combatAttackCooldownTicks);
  const energyAfterFirstAttack = antA.energy;
  simulation.tick();
  assert.equal(antA.energy, energyAfterFirstAttack);
});

test("THREATEN produces no damage while still emitting a dedicated event", () => {
  const simulation = new Simulation(combatConfig({
    combatAttackThreshold: 1,
    combatThreatenThreshold: 0,
  }));
  const [antA, antB] = simulation.colonies.map((colony) => colony.ants[0]);
  antA.position = { x: 100, y: 50 };
  antB.position = { x: 102, y: 50 };
  const healthBefore = antA.health;
  simulation.tick();
  assert.equal(antA.health, healthBefore);
  assert.equal(antB.health, antB.maxHealth);
  assert.equal(simulation.tickEvents.some((event) => event.type === "ANT_ATTACKED"), false);
  assert.ok(simulation.tickEvents.some((event) => event.type === "FOREIGN_THREAT"));
});

test("combat.enabled = false reproduces the V1.2-step-1 behavior exactly", () => {
  const simulation = new Simulation(combatConfig({
    combatEnabled: false,
    combatAttackThreshold: 0,
    combatThreatenThreshold: 0,
  }));
  const [antA, antB] = simulation.colonies.map((colony) => colony.ants[0]);
  antA.position = { x: 100, y: 50 };
  antB.position = { x: 102, y: 50 };
  for (let index = 0; index < 5; index += 1) simulation.tick();
  const combatEventTypes = new Set([
    "FOREIGN_THREAT", "COMBAT_STARTED", "ANT_ATTACKED", "COMBAT_DEATH", "COMBAT_ENDED",
  ]);
  assert.equal(simulation.tickEvents.some((event) => combatEventTypes.has(event.type)), false);
  assert.equal(antA.health, antA.maxHealth);
  assert.equal(antB.health, antB.maxHealth);
  assert.equal(simulation.getMetrics().attacks, 0);
  assert.equal(simulation.getMetrics().combatDeaths, 0);
});

test("combat runs preserve exact replay and food conservation", async () => {
  const config = combatConfig({
    combatAttackPower: 1000,
    colonies: multiColonyConfig().colonies.map((colony) => ({
      ...colony,
      nest: { ...colony.nest, x: colony.id === "A" ? 95 : 105 },
    })),
  });
  const direct = new Simulation(config);
  direct.run(20);
  assert.equal(assertSimulationInvariants(direct).valid, true);
  const replayed = new Simulation(config);
  const previousAnimationFrame = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = (callback) => setImmediate(callback);
  try {
    assert.equal(await new ReplayController(replayed).seek(20, { chunkSize: 6 }), true);
  } finally {
    globalThis.requestAnimationFrame = previousAnimationFrame;
  }
});

test("multi-colony replay and global food conservation are exact", async () => {
  const direct = new Simulation(multiColonyConfig());
  direct.run(40);
  assert.equal(assertSimulationInvariants(direct).valid, true);
  const replayed = new Simulation(multiColonyConfig());
  const previousAnimationFrame = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = (callback) => setImmediate(callback);
  try {
    assert.equal(await new ReplayController(replayed).seek(40, { chunkSize: 7 }), true);
  } finally {
    globalThis.requestAnimationFrame = previousAnimationFrame;
  }
  assert.equal(JSON.stringify(replayed.getState()), JSON.stringify(direct.getState()));
});

test("removing one colony preserves the other colony and conservation ledger", () => {
  const simulation = new Simulation(multiColonyConfig());
  const survivorBefore = JSON.stringify(simulation.colonies[1]);
  assert.equal(simulation.removeColony("A"), true);
  assert.equal(simulation.colonies.length, 1);
  assert.equal(simulation.colonies[0].id, "B");
  assert.equal(JSON.stringify(simulation.colonies[0]), survivorBefore);
  simulation.tick();
  assert.equal(assertSimulationInvariants(simulation).valid, true);
  assert.equal(simulation.removeColony("B"), false);
});

test("replay reconstructs an exact tick from seed and configuration", async () => {
  const reference = new Simulation(foragingConfig());
  for (let index = 0; index < 25; index += 1) reference.tick();
  const replayed = new Simulation(foragingConfig());
  const previousAnimationFrame = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = (callback) => setImmediate(callback);
  try {
    const replay = new ReplayController(replayed);
    assert.equal(await replay.seek(25, { chunkSize: 7 }), true);
  } finally {
    globalThis.requestAnimationFrame = previousAnimationFrame;
  }
  assert.equal(JSON.stringify(replayed.colony), JSON.stringify(reference.colony));
  assert.deepEqual(
    replayed.pheromoneField.layer(PheromoneType.FOOD),
    reference.pheromoneField.layer(PheromoneType.FOOD),
  );
});

function casteConfig(overrides = {}) {
  return multiColonyConfig({
    reproductionEnabled: true,
    castesEnabled: true,
    casteStockThreshold: 5,
    casteSoldierRatioCap: 0.4,
    threatPressureRatioScale: 10,
    threatPressureDecay: 0.9,
    queenLayingCooldownTicks: 1,
    reproductionFoodThreshold: 0,
    eggFoodCost: 1,
    eggDurationTicks: 1,
    larvaDurationTicks: 1,
    pupaDurationTicks: 1,
    larvaFoodPerTick: 0,
    maxBrood: 10,
    maxWorkers: 200,
    colonies: multiColonyConfig().colonies.map((colony) => ({ ...colony, initialFoodStock: 200 })),
    ...overrides,
  });
}

test("decideCaste requires stock and threat pressure, and respects the ratio cap", () => {
  const system = new BroodSystem();
  const colony = new Colony({ id: "A", nest: new Nest(0, 0, 5) });
  const config = { castesEnabled: true, casteStockThreshold: 10, casteSoldierRatioCap: 0.3, threatPressureRatioScale: 10 };

  colony.foodStock = 0;
  colony.threatPressure = 100;
  assert.equal(system.decideCaste(colony, config), Caste.WORKER, "stock too low");

  colony.foodStock = 20;
  colony.threatPressure = 0;
  assert.equal(system.decideCaste(colony, config), Caste.WORKER, "no threat pressure");

  colony.threatPressure = 100;
  assert.equal(system.decideCaste(colony, config), Caste.SOLDIER, "stock ok, pressure high, under ratio cap");

  for (let index = 0; index < 7; index += 1) {
    colony.ants.push(new Ant({
      id: `W${index}`, position: { x: 0, y: 0 }, direction: 0, speed: 0, colonyId: "A", caste: Caste.WORKER,
    }));
  }
  for (let index = 0; index < 3; index += 1) {
    colony.ants.push(new Ant({
      id: `S${index}`, position: { x: 0, y: 0 }, direction: 0, speed: 0, colonyId: "A", caste: Caste.SOLDIER,
    }));
  }
  assert.equal(system.decideCaste(colony, config), Caste.WORKER, "ratio cap reached (3/10 = 0.3)");
});

test("castesEnabled = false never produces a SOLDIER even under reproduction and combat", () => {
  const simulation = new Simulation(casteConfig({ castesEnabled: false }));
  const [antA, antB] = simulation.colonies.map((colony) => colony.ants[0]);
  antA.position = { x: 100, y: 50 };
  antB.position = { x: 102, y: 50 };
  for (let index = 0; index < 300; index += 1) simulation.tick();
  const allAnts = simulation.colonies.flatMap((colony) => colony.ants);
  assert.ok(allAnts.length > 2);
  assert.ok(allAnts.every((ant) => ant.caste === Caste.WORKER));
  for (const colony of simulation.colonies) {
    assert.equal(colony.soldierBirths, 0);
    assert.equal(simulation.getColonyMetrics(colony).soldierCount, 0);
  }
});

test("a produced soldier has distinct combat stats and never forages", () => {
  const simulation = new Simulation(casteConfig());
  const colonyA = simulation.colonies[0];
  colonyA.threatPressure = 100;
  for (let index = 0; index < 20; index += 1) simulation.tick();
  const soldier = colonyA.ants.find((ant) => ant.caste === Caste.SOLDIER);
  assert.ok(soldier, "a soldier should have been produced under sustained threat pressure");
  const worker = colonyA.ants.find((ant) => ant.caste === Caste.WORKER && ant.id !== soldier.id);
  assert.equal(soldier.maxHealth, simulation.config.soldierMaxHealth);
  assert.equal(soldier.attackPower, simulation.config.soldierAttackPower);
  assert.notEqual(soldier.maxHealth, worker.maxHealth);
  assert.notEqual(soldier.attackPower, worker.attackPower);
  for (let index = 0; index < 200; index += 1) {
    simulation.tick();
    assert.equal(soldier.carryingFood, false);
    assert.equal(soldier.target, null);
  }
});

test("soldiers use a distinct, more aggressive combat threshold than workers", () => {
  const simulation = new Simulation(casteConfig({ combatRadius: 10 }));
  const [antA, antB] = simulation.colonies.map((colony) => colony.ants[0]);
  antA.caste = Caste.SOLDIER;
  antA.maxHealth = simulation.config.soldierMaxHealth;
  antA.health = antA.maxHealth;
  antA.attackPower = simulation.config.soldierAttackPower;
  antA.position = { x: 100, y: 50 };
  antB.position = { x: 102, y: 50 };
  simulation.tick();
  assert.ok(simulation.tickEvents.some((event) => (
    event.type === "ANT_ATTACKED" && event.antId === antA.id
  )), "a soldier at full health/energy should attack given its low soldierCombatAttackThreshold");
});

test("threatPressure accumulates with combat deaths and decays without renewed contact", () => {
  const simulation = new Simulation(casteConfig({
    combatAttackPower: 1000,
    threatPressureDecay: 0.5,
  }));
  const [antA, antB] = simulation.colonies.map((colony) => colony.ants[0]);
  const colonyB = simulation.colonies[1];
  antA.position = { x: 100, y: 50 };
  antB.position = { x: 102, y: 50 };
  antB.attackPower = 0;
  simulation.tick();
  const pressureAfterDeath = colonyB.threatPressure;
  assert.ok(pressureAfterDeath > 0);
  for (let index = 0; index < 20; index += 1) simulation.tick();
  assert.ok(colonyB.threatPressure < pressureAfterDeath);
});

test("military metrics expose caste composition, births, and food cost", () => {
  const simulation = new Simulation(casteConfig());
  const colonyA = simulation.colonies[0];
  colonyA.threatPressure = 100;
  for (let index = 0; index < 20; index += 1) simulation.tick();
  const metrics = simulation.getColonyMetrics(colonyA);
  assert.ok(metrics.soldierCount >= 1);
  assert.ok(metrics.soldierBirths >= 1);
  assert.equal(metrics.soldierCount + metrics.workerCount, metrics.livingAnts);
  assert.ok(metrics.militaryFoodCost > 0);
});

test("a combat death always clears the dying ant's food target", () => {
  const simulation = new Simulation(multiColonyConfig({
    combatAttackPower: 1000, combatRadius: 10, combatAttackThreshold: 0,
  }));
  const [antA, antB] = simulation.colonies.map((colony) => colony.ants[0]);
  antA.position = { x: 100, y: 50 };
  antB.position = { x: 102, y: 50 };
  antB.attackPower = 0;
  antB.target = new FoodSource({ x: 500, y: 500, quantity: 1, radius: 5 });
  simulation.tick();
  assert.equal(antB.state, AntState.DEAD);
  assert.equal(antB.target, null);
});
