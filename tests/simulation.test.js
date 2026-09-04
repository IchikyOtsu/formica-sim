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
import { RaidState } from "../src/entities/Raid.js";
import { RaidDecisionSystem } from "../src/systems/RaidDecisionSystem.js";
import { TacticalOverlaySystem, OverlayType, DEFAULT_OVERLAY_VISIBILITY } from "../src/systems/TacticalOverlaySystem.js";
import { Brood, BroodStage } from "../src/entities/Brood.js";
import { FoodSource, FoodSourceState } from "../src/entities/FoodSource.js";
import { DangerZone } from "../src/environment/DangerZone.js";
import { Season } from "../src/environment/Season.js";
import { ExperimentRunner } from "../src/experiments/ExperimentRunner.js";
import { SCENARIO_PRESETS, configForPreset } from "../src/experiments/ScenarioPresets.js";
import { PheromoneField, PheromoneType } from "../src/simulation/PheromoneField.js";
import { Renderer } from "../src/rendering/Renderer.js";
import { MapMarkerRenderer } from "../src/rendering/MapMarkerRenderer.js";
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

test("soldier production lags a real threat spike and tapers off via demographic dilution once it fades", () => {
  const config = casteConfig({
    colonies: multiColonyConfig().colonies.map((colony) => ({ ...colony, initialFoodStock: 300 })),
    environmentEnabled: false,
    queenLayingCooldownTicks: 40,
    eggDurationTicks: 30,
    larvaDurationTicks: 40,
    pupaDurationTicks: 30,
    larvaFoodPerTick: 0.05,
    foodSources: [
      { id: "NEAR_A", x: 30, y: 50, quantity: 300, radius: 8 },
      { id: "NEAR_B", x: 170, y: 50, quantity: 300, radius: 8 },
    ],
  });
  const simulation = new Simulation(config);
  const colonyA = simulation.colonies[0];
  const colonyB = simulation.colonies[1];
  const LEASH = 30;
  const raiderIds = new Set(colonyB.ants.slice(0, Math.ceil(colonyB.ants.length * 0.3)).map((ant) => ant.id));
  const leashTo = (ants, target) => {
    for (const ant of ants) {
      if (ant.state === AntState.DEAD) continue;
      const dx = ant.position.x - target.x;
      const dy = ant.position.y - target.y;
      if (dx * dx + dy * dy > LEASH * LEASH) {
        ant.position = { x: target.x + (Math.random() - 0.5) * 5, y: target.y + (Math.random() - 0.5) * 5 };
      }
    }
  };
  const PHASE_2_START = 500;
  const PHASE_3_START = 2000;
  const TOTAL_TICKS = 3000;

  let soldiersAtPhase2Lag = null;
  for (let tick = 0; tick < TOTAL_TICKS; tick += 1) {
    const inPressure = tick >= PHASE_2_START && tick < PHASE_3_START;
    const raiders = [];
    const homeGuard = [];
    for (const ant of colonyB.ants) (raiderIds.has(ant.id) ? raiders : homeGuard).push(ant);
    leashTo(colonyA.ants, colonyA.nest.position);
    leashTo(homeGuard, colonyB.nest.position);
    leashTo(raiders, inPressure ? colonyA.nest.position : colonyB.nest.position);
    simulation.tick();
    if (tick === PHASE_2_START + 100) {
      soldiersAtPhase2Lag = simulation.getColonyMetrics(colonyA).soldierCount;
    }
  }

  assert.equal(soldiersAtPhase2Lag, 0, "soldiers should not appear immediately — the brood cycle imposes a lag");

  const metricsAtPressureEnd = simulation.getColonyMetrics(colonyA);
  assert.ok(metricsAtPressureEnd.soldierCount > 0, "sustained pressure should eventually produce soldiers");
  const ratioAtPressureEnd = metricsAtPressureEnd.soldierCount / metricsAtPressureEnd.livingAnts;

  for (let tick = PHASE_3_START; tick < PHASE_3_START + 1000; tick += 1) {
    leashTo(colonyA.ants, colonyA.nest.position);
    leashTo(colonyB.ants, colonyB.nest.position);
    simulation.tick();
  }

  const metricsAfterCalm = simulation.getColonyMetrics(colonyA);
  assert.ok(
    metricsAfterCalm.soldierCount <= metricsAtPressureEnd.soldierCount,
    "no new soldiers should be produced once threat pressure has faded",
  );
  assert.ok(
    metricsAfterCalm.workerCount > metricsAtPressureEnd.workerCount,
    "the colony keeps growing its worker base during the calm that follows",
  );
  const ratioAfterCalm = metricsAfterCalm.soldierCount / metricsAfterCalm.livingAnts;
  assert.ok(
    ratioAfterCalm < ratioAtPressureEnd,
    "the soldier share should recede through demographic dilution, not just an explicit rule",
  );
});

function raidConfig(overrides = {}) {
  return multiColonyConfig({
    antSpeed: 40,
    combatEnabled: false,
    nestDiscoveryRadius: 40,
    raidArrivalRadius: 15,
    raidGroupSize: 5,
    ...overrides,
  });
}

function pushSoldier(colony, id, overrides = {}) {
  const soldier = new Ant({
    id,
    position: { ...colony.nest.position },
    direction: 0,
    speed: 40,
    colonyId: colony.id,
    energy: 100,
    maxEnergy: 100,
    energyConsumptionRate: 0,
    maxHealth: 100,
    attackPower: 10,
    caste: Caste.SOLDIER,
    raidCarryCapacity: 20,
    ...overrides,
  });
  colony.ants.push(soldier);
  return soldier;
}

test("a colony cannot raid a nest it has never discovered, nor without any soldier available", () => {
  const simulation = new Simulation(raidConfig());
  const colonyA = simulation.colonies[0];
  const colonyB = simulation.colonies[1];

  assert.equal(simulation.requestRaid("A", "B"), null, "B has not been discovered yet");

  colonyA.knownEnemyNests.set("B", {
    position: { ...colonyB.nest.position },
    discoveredTick: 0,
    lastSeenTick: 0,
  });
  assert.equal(
    simulation.requestRaid("A", "B"),
    null,
    "discovered but colony A only has a worker, no soldier to send",
  );

  pushSoldier(colonyA, "A-SOLDIER-1");
  const raid = simulation.requestRaid("A", "B");
  assert.ok(raid, "a soldier is now available against a known target");
  assert.equal(raid.targetColonyId, "B");
});

test("an enemy nest becomes known only once the discovering ant physically reports back home", () => {
  const simulation = new Simulation(raidConfig());
  const colonyA = simulation.colonies[0];
  const colonyB = simulation.colonies[1];
  const scout = colonyA.ants[0];

  scout.position = { ...colonyB.nest.position };
  simulation.tick();
  assert.ok(scout.pendingNestIntel, "the scout has sighted the enemy nest");
  assert.equal(colonyA.knownEnemyNests.size, 0, "not yet exploitable: the scout has not returned home");
  assert.equal(
    simulation.tickEvents.some((event) => event.type === "ENEMY_NEST_DISCOVERED"),
    false,
  );

  scout.position = { ...colonyA.nest.position };
  scout.state = AntState.RETURNING_HOME;
  simulation.tick();

  assert.equal(colonyA.knownEnemyNests.size, 1);
  const intel = colonyA.knownEnemyNests.get("B");
  assert.deepEqual(intel.position, colonyB.nest.position);
  assert.equal(colonyA.enemyNestsDiscovered, 1);
  const discovery = simulation.tickEvents.find((event) => event.type === "ENEMY_NEST_DISCOVERED");
  assert.ok(discovery);
  assert.equal(discovery.colonyId, "A");
  assert.equal(discovery.targetColonyId, "B");
});

test("a raid travels to the memorized enemy nest position and back without teleporting", () => {
  const simulation = new Simulation(raidConfig());
  const colonyA = simulation.colonies[0];
  const colonyB = simulation.colonies[1];
  const soldier = pushSoldier(colonyA, "A-SOLDIER-1");
  colonyA.knownEnemyNests.set("B", {
    position: { ...colonyB.nest.position },
    discoveredTick: 0,
    lastSeenTick: 0,
  });

  const raid = simulation.requestRaid("A", "B", 1);
  assert.equal(soldier.state, AntState.RAIDING);
  assert.equal(soldier.raidId, raid.id);

  const maxStepDistance = simulation.config.antSpeed * (simulation.config.tickDurationMs / 1000) + 1e-6;
  let reachedTarget = false;
  let previousPosition = { ...soldier.position };
  for (let tick = 0; tick < 500 && simulation.raids.size > 0; tick += 1) {
    simulation.tick();
    const stepDistance = Math.hypot(
      soldier.position.x - previousPosition.x,
      soldier.position.y - previousPosition.y,
    );
    assert.ok(stepDistance <= maxStepDistance, `no teleportation: moved ${stepDistance} in one tick`);
    previousPosition = { ...soldier.position };
    if (raid.state === RaidState.RETURNING || raid.state === RaidState.COMPLETE) reachedTarget = true;
  }

  assert.ok(reachedTarget, "the raider reached the target nest and turned back");
  assert.equal(raid.state, RaidState.COMPLETE);
  assert.equal(simulation.raids.size, 0, "the finished raid is cleared from the active list");
  assert.equal(soldier.raidId, null);
  assert.equal(soldier.state, AntState.SEARCHING_FOOD, "the raider resumes normal duty once home");
  assert.equal(colonyA.raidsStarted, 1);
  assert.equal(colonyA.raidsCompleted, 1);
  assert.equal(colonyA.raidsFailed, 0);
  assert.ok(
    simulation.tickEvents.some((event) => event.type === "RAID_RETURNED" && event.outcome === RaidState.COMPLETE),
  );
});

test("a raid is marked FAILED when every raider dies before returning home", () => {
  const simulation = new Simulation(raidConfig({ combatEnabled: true, combatRadius: 200 }));
  const colonyA = simulation.colonies[0];
  const colonyB = simulation.colonies[1];
  const raider = pushSoldier(colonyA, "A-SOLDIER-1");
  colonyA.knownEnemyNests.set("B", {
    position: { ...colonyB.nest.position },
    discoveredTick: 0,
    lastSeenTick: 0,
  });
  const raid = simulation.requestRaid("A", "B", 1);
  assert.ok(raid);

  raider.state = AntState.DEAD;
  simulation.handleDeath(raider, "COMBAT", colonyA, { killerColony: colonyB, killerCaste: Caste.SOLDIER });

  assert.equal(raid.state, RaidState.FAILED);
  assert.equal(simulation.raids.size, 0);
  assert.equal(colonyA.raidsFailed, 1);
  assert.equal(colonyA.raidsCompleted, 0);
  assert.equal(colonyA.raidersLost, 1);
  assert.equal(raider.raidId, null, "a dead raider is cleared from raid bookkeeping");
});

test("raiding requires the SOLDIER caste and is invisible when castesEnabled stays false", () => {
  const simulation = new Simulation(raidConfig());
  assertSimulationInvariants(simulation);
  for (let tick = 0; tick < 500; tick += 1) simulation.tick();
  assertSimulationInvariants(simulation);
  assert.equal(simulation.raids.size, 0, "nothing ever creates a raid on its own");
  for (const colony of simulation.colonies) {
    assert.equal(colony.raidsStarted, 0);
  }
});

function defenseConfig(overrides = {}) {
  return multiColonyConfig({
    combatEnabled: true,
    castesEnabled: true,
    nestDefenseRadius: 30,
    nestDefenseGraceTicks: 5,
    ...overrides,
  });
}

test("no defense trigger while an intruder stays outside nestDefenseRadius", () => {
  const simulation = new Simulation(defenseConfig());
  const colonyA = simulation.colonies[0];
  // colony B's only ant starts at its own nest, 160 units away — well outside the 30-unit radius.
  for (let tick = 0; tick < 50; tick += 1) simulation.tick();
  assert.equal(colonyA.nestUnderThreat, false);
  assert.equal(colonyA.raidersDetectedNearNest, 0);
  assert.equal(colonyA.defenseActivations, 0);
});

test("defense triggers exactly at radius entry, raising threatPressure and local ALARM", () => {
  const simulation = new Simulation(defenseConfig());
  const colonyA = simulation.colonies[0];
  const intruder = simulation.colonies[1].ants[0];
  const field = simulation.colonyPheromones.get("A");

  intruder.position = { x: colonyA.nest.position.x + 31, y: colonyA.nest.position.y };
  simulation.tick();
  assert.equal(colonyA.nestUnderThreat, false, "just outside the radius: no trigger");
  assert.equal(field.sample(PheromoneType.ALARM, colonyA.nest.position), 0);

  intruder.position = { x: colonyA.nest.position.x + 29, y: colonyA.nest.position.y };
  simulation.tick();
  assert.equal(colonyA.nestUnderThreat, true, "one unit inside the radius: triggers immediately");
  assert.equal(colonyA.raidersDetectedNearNest, 1);
  assert.ok(colonyA.threatPressure > 0, "threatPressure should rise from the nest-proximity contact");
  assert.ok(
    field.sample(PheromoneType.ALARM, colonyA.nest.position) > 0,
    "ALARM should be deposited locally around the threatened nest",
  );
  assert.ok(simulation.tickEvents.some((event) => event.type === "NEST_THREAT_DETECTED" && event.colonyId === "A"));
  assert.ok(simulation.tickEvents.some((event) => event.type === "DEFENSE_ACTIVATED" && event.colonyId === "A"));
});

test("an available soldier converges on its own nest once mobilized to DEFENDING", () => {
  const simulation = new Simulation(defenseConfig({ antSpeed: 20, directHomeNavigation: true }));
  const colonyA = simulation.colonies[0];
  const soldier = pushSoldier(colonyA, "A-SOLDIER-1", {
    position: { x: colonyA.nest.position.x + 60, y: colonyA.nest.position.y },
  });
  const intruder = simulation.colonies[1].ants[0];
  intruder.position = { x: colonyA.nest.position.x + 5, y: colonyA.nest.position.y };

  simulation.tick();
  assert.equal(soldier.state, AntState.DEFENDING);
  assert.equal(colonyA.defendersMobilized, 1);

  for (let tick = 0; tick < 30; tick += 1) simulation.tick();
  const distance = Math.hypot(
    soldier.position.x - colonyA.nest.position.x,
    soldier.position.y - colonyA.nest.position.y,
  );
  assert.ok(distance < 60, "the defender should have moved toward its own nest, not toward the intruder's id");
});

test("a raiding soldier is recalled to DEFENDING when its own nest comes under threat", () => {
  const simulation = new Simulation(defenseConfig({ antSpeed: 20 }));
  const colonyA = simulation.colonies[0];
  const colonyB = simulation.colonies[1];
  const soldier = pushSoldier(colonyA, "A-SOLDIER-1");
  colonyA.knownEnemyNests.set("B", {
    position: { ...colonyB.nest.position },
    discoveredTick: 0,
    lastSeenTick: 0,
  });
  const raid = simulation.requestRaid("A", "B", 1);
  assert.equal(soldier.state, AntState.RAIDING);

  const intruder = colonyB.ants[0];
  intruder.position = { x: colonyA.nest.position.x + 5, y: colonyA.nest.position.y };
  simulation.tick();

  assert.equal(soldier.state, AntState.DEFENDING, "DEFENDING outranks an in-progress RAIDING assignment");
  assert.equal(soldier.raidId, null, "the soldier is cleanly pulled out of the raid's bookkeeping");
  assert.ok(
    raid.returnedIds.has(soldier.id) || raid.state === RaidState.COMPLETE,
    "the recall counts as an accounted-for outcome for the abandoned raid",
  );
});

test("a dead soldier is never mobilized to defend", () => {
  const simulation = new Simulation(defenseConfig());
  const colonyA = simulation.colonies[0];
  const soldier = pushSoldier(colonyA, "A-SOLDIER-1");
  soldier.state = AntState.DEAD;
  const intruder = simulation.colonies[1].ants[0];
  intruder.position = { x: colonyA.nest.position.x + 5, y: colonyA.nest.position.y };

  simulation.tick();

  assert.equal(soldier.state, AntState.DEAD);
  assert.equal(colonyA.defendersMobilized, 0);
});

test("defense releases after the intruder leaves and the grace period elapses, crediting evacuated workers", () => {
  const simulation = new Simulation(defenseConfig({ nestDefenseGraceTicks: 3 }));
  const colonyA = simulation.colonies[0];
  const worker = colonyA.ants[0];
  const intruder = simulation.colonies[1].ants[0];

  worker.position = { x: colonyA.nest.position.x + 5, y: colonyA.nest.position.y };
  intruder.position = { x: colonyA.nest.position.x + 5, y: colonyA.nest.position.y };
  simulation.tick();
  assert.equal(colonyA.nestUnderThreat, true);

  // the worker manages to slip out of the defense zone while the threat is still active.
  worker.position = { x: colonyA.nest.position.x + 200, y: colonyA.nest.position.y };
  intruder.position = { x: 100_000, y: 100_000 };
  for (let tick = 0; tick < 10 && colonyA.nestUnderThreat; tick += 1) simulation.tick();

  assert.equal(colonyA.nestUnderThreat, false, "defense releases once the grace period elapses");
  assert.equal(colonyA.workersEvacuated, 1, "the worker that left the zone before release is credited");
  assert.ok(simulation.tickEvents.some((event) => event.type === "DEFENSE_RELEASED" && event.colonyId === "A"));
});

test("nest defense replay is exact for an identical seed and configuration", () => {
  const config = defenseConfig({ antSpeed: 12 });
  const runOnce = () => {
    const simulation = new Simulation(config);
    pushSoldier(simulation.colonies[0], "A-SOLDIER-1");
    const intruder = simulation.colonies[1].ants[0];
    for (let tick = 0; tick < 200; tick += 1) {
      if (tick > 20 && tick < 120) {
        intruder.position = { x: simulation.colonies[0].nest.position.x + 5, y: simulation.colonies[0].nest.position.y };
      }
      simulation.tick();
    }
    return simulation;
  };
  const first = runOnce();
  const second = runOnce();
  assert.deepEqual(
    first.colonies.map((colony) => ({
      nestUnderThreat: colony.nestUnderThreat,
      raidersDetectedNearNest: colony.raidersDetectedNearNest,
      defenseActivations: colony.defenseActivations,
      defendersMobilized: colony.defendersMobilized,
      threatPressure: colony.threatPressure,
    })),
    second.colonies.map((colony) => ({
      nestUnderThreat: colony.nestUnderThreat,
      raidersDetectedNearNest: colony.raidersDetectedNearNest,
      defenseActivations: colony.defenseActivations,
      defendersMobilized: colony.defendersMobilized,
      threatPressure: colony.threatPressure,
    })),
  );
});

test("nest defense stays fully inert when combatEnabled or nestDefenseEnabled is false", () => {
  for (const overrides of [{ combatEnabled: false }, { nestDefenseEnabled: false }]) {
    const simulation = new Simulation(defenseConfig(overrides));
    const colonyA = simulation.colonies[0];
    const intruder = simulation.colonies[1].ants[0];
    intruder.position = { x: colonyA.nest.position.x + 5, y: colonyA.nest.position.y };
    for (let tick = 0; tick < 50; tick += 1) simulation.tick();
    assert.equal(colonyA.nestUnderThreat, false);
    assert.equal(colonyA.raidersDetectedNearNest, 0);
    assert.equal(colonyA.defenseActivations, 0);
  }
});

test("nest defense runs without soldiers when castesEnabled is false, but never mobilizes a defender", () => {
  const simulation = new Simulation(defenseConfig({ castesEnabled: false }));
  const colonyA = simulation.colonies[0];
  const intruder = simulation.colonies[1].ants[0];
  intruder.position = { x: colonyA.nest.position.x + 5, y: colonyA.nest.position.y };
  for (let tick = 0; tick < 50; tick += 1) simulation.tick();
  assert.equal(colonyA.nestUnderThreat, true, "detection and ALARM do not depend on castes");
  assert.equal(colonyA.defendersMobilized, 0, "no SOLDIER caste exists to mobilize");
  assertSimulationInvariants(simulation);
});

function pillageConfig({ bFoodStock, aFoodStock, ...overrides } = {}) {
  const config = multiColonyConfig({
    antSpeed: 40,
    combatEnabled: false,
    directHomeNavigation: true,
    nestDiscoveryRadius: 40,
    raidArrivalRadius: 15,
    raidGroupSize: 5,
    raidCarryCapacity: 20,
    ...overrides,
  });
  config.colonies = config.colonies.map((colony) => {
    if (colony.id === "B" && bFoodStock !== undefined) return { ...colony, initialFoodStock: bFoodStock };
    if (colony.id === "A" && aFoodStock !== undefined) return { ...colony, initialFoodStock: aFoodStock };
    return colony;
  });
  return config;
}

function setupRaid(simulation, groupSize = 1) {
  const colonyA = simulation.colonies[0];
  const colonyB = simulation.colonies[1];
  // freeze both colonies' own foragers so their incidental movement/collection
  // of the shared food source never confounds the pillage-specific assertions.
  colonyA.ants[0].speed = 0;
  colonyB.ants[0].speed = 0;
  colonyA.knownEnemyNests.set("B", {
    position: { ...colonyB.nest.position },
    discoveredTick: 0,
    lastSeenTick: 0,
  });
  return simulation.requestRaid("A", "B", groupSize);
}

test("a raider steals nothing when the enemy stock is empty", () => {
  const simulation = new Simulation(pillageConfig());
  const colonyA = simulation.colonies[0];
  const colonyB = simulation.colonies[1];
  const soldier = pushSoldier(colonyA, "A-SOLDIER-1");
  setupRaid(simulation);

  let sawStolenEvent = false;
  for (let tick = 0; tick < 200 && soldier.raidId !== null; tick += 1) {
    simulation.tick();
    if (simulation.tickEvents.some((event) => event.type === "FOOD_STOLEN")) sawStolenEvent = true;
  }

  assert.equal(sawStolenEvent, false);
  assert.equal(soldier.raidCargo, 0);
  assert.equal(colonyA.foodStolen, 0);
  assert.equal(colonyB.foodStock, 0);
});

test("a raider never steals more than its raidCarryCapacity even against a much larger stock", () => {
  const simulation = new Simulation(pillageConfig({ bFoodStock: 500 }));
  const colonyA = simulation.colonies[0];
  const colonyB = simulation.colonies[1];
  const soldier = pushSoldier(colonyA, "A-SOLDIER-1", { raidCarryCapacity: 10 });
  setupRaid(simulation);

  let stolenEvent = null;
  for (let tick = 0; tick < 200 && !stolenEvent; tick += 1) {
    simulation.tick();
    stolenEvent = simulation.tickEvents.find((event) => event.type === "FOOD_STOLEN");
  }

  assert.ok(stolenEvent, "the raider should have reached the nest and looted once");
  assert.equal(stolenEvent.amount, 10, "capped at raidCarryCapacity, not the full stock");
  assert.equal(soldier.raidCargo, 10);
  assert.equal(colonyB.foodStock, 490, "the enemy stock drops by exactly the stolen amount");
});

test("simultaneous raiders share a limited enemy stock atomically, never exceeding it", () => {
  const simulation = new Simulation(pillageConfig({ bFoodStock: 30 }));
  const colonyA = simulation.colonies[0];
  const colonyB = simulation.colonies[1];
  const first = pushSoldier(colonyA, "A-SOLDIER-1");
  const second = pushSoldier(colonyA, "A-SOLDIER-2");
  setupRaid(simulation, 2);

  for (let tick = 0; tick < 200 && (first.raidId !== null || second.raidId !== null); tick += 1) {
    simulation.tick();
    if (first.state !== AntState.RAIDING && second.state !== AntState.RAIDING) break;
  }

  assert.equal(colonyB.foodStock, 0, "the shared stock is fully and exactly drained, never negative");
  assert.equal(
    first.raidCargo + second.raidCargo,
    30,
    "the 30 available units are split atomically between the two raiders, never double-counted",
  );
});

test("the raiding colony's stock only grows once the raider actually gets home with the loot", () => {
  const simulation = new Simulation(pillageConfig({ bFoodStock: 50 }));
  const colonyA = simulation.colonies[0];
  const soldier = pushSoldier(colonyA, "A-SOLDIER-1");
  setupRaid(simulation);
  const stockBeforeRaid = colonyA.foodStock;

  let checkedWhileCarrying = false;
  for (let tick = 0; tick < 600 && soldier.raidId !== null; tick += 1) {
    simulation.tick();
    if (soldier.raidCargo > 0 && !checkedWhileCarrying) {
      checkedWhileCarrying = true;
      assert.equal(
        colonyA.foodStock,
        stockBeforeRaid,
        "the home stock must not move the instant loot is taken — only on actual arrival",
      );
    }
  }

  assert.equal(checkedWhileCarrying, true, "the raider should have looted at some point in this run");
  assert.equal(colonyA.foodStock, stockBeforeRaid + 20, "own stock increases exactly once, on arrival");
  assert.equal(colonyA.raidersReturnedWithLoot, 1);
  assert.equal(colonyA.foodRecovered, 20);
  assert.equal(soldier.raidCargo, 0);
});

test("a raider killed while carrying loot drops it on the ground as a recoverable resource", () => {
  const simulation = new Simulation(pillageConfig({ bFoodStock: 40 }));
  const colonyA = simulation.colonies[0];
  const soldier = pushSoldier(colonyA, "A-SOLDIER-1", { raidCarryCapacity: 12 });
  const raid = setupRaid(simulation);
  simulation.attemptPillage(soldier, colonyA, raid);
  assert.equal(soldier.raidCargo, 12, "the loot must come from a real theft, to keep conservation exact");
  soldier.position = { x: 77, y: 33 };
  const initialSourceCount = simulation.foodSources.length;

  soldier.state = AntState.DEAD;
  simulation.handleDeath(soldier, "STARVATION", colonyA);

  assert.equal(soldier.raidCargo, 0);
  assert.equal(simulation.foodSources.length, initialSourceCount + 1);
  const drop = simulation.foodSources[simulation.foodSources.length - 1];
  assert.equal(drop.quantity, 12);
  assert.deepEqual(drop.position, soldier.position);
  assert.equal(drop.active, true, "the dropped loot is an ordinary, collectible food source");
  assert.equal(colonyA.foodDropped, 12);
  assert.equal(colonyA.raidersKilledWithLoot, 1);
  assertSimulationInvariants(simulation);
});

test("a raider never steals twice on the same outing", () => {
  const simulation = new Simulation(pillageConfig({ bFoodStock: 100 }));
  const colonyA = simulation.colonies[0];
  const colonyB = simulation.colonies[1];
  const soldier = pushSoldier(colonyA, "A-SOLDIER-1");
  const raid = setupRaid(simulation);

  simulation.attemptPillage(soldier, colonyA, raid);
  const stockAfterFirst = colonyB.foodStock;
  const cargoAfterFirst = soldier.raidCargo;
  assert.ok(cargoAfterFirst > 0);

  simulation.attemptPillage(soldier, colonyA, raid);
  assert.equal(colonyB.foodStock, stockAfterFirst, "a second attempt on the same outing takes nothing more");
  assert.equal(soldier.raidCargo, cargoAfterFirst);
});

test("nest defense combined with combat and pillage keeps food conservation exact", () => {
  const simulation = new Simulation(pillageConfig({ combatEnabled: true, castesEnabled: true, bFoodStock: 80 }));
  const colonyA = simulation.colonies[0];
  const colonyB = simulation.colonies[1];
  pushSoldier(colonyA, "A-SOLDIER-1");
  pushSoldier(colonyA, "A-SOLDIER-2");
  pushSoldier(colonyB, "B-SOLDIER-1");
  setupRaid(simulation, 2);

  for (let tick = 0; tick < 2000; tick += 1) {
    simulation.tick();
    assertSimulationInvariants(simulation);
  }
});

test("nest defense replay with pillage is exact for an identical seed and configuration", () => {
  const config = pillageConfig({ combatEnabled: true });
  const runOnce = () => {
    const simulation = new Simulation(config);
    pushSoldier(simulation.colonies[0], "A-SOLDIER-1");
    setupRaid(simulation);
    for (let tick = 0; tick < 400; tick += 1) simulation.tick();
    return simulation;
  };
  const first = runOnce();
  const second = runOnce();
  const snapshot = (simulation) => simulation.colonies.map((colony) => ({
    foodStock: colony.foodStock,
    foodStolen: colony.foodStolen,
    foodRecovered: colony.foodRecovered,
    foodDropped: colony.foodDropped,
    raidersReturnedWithLoot: colony.raidersReturnedWithLoot,
    raidersKilledWithLoot: colony.raidersKilledWithLoot,
  }));
  assert.deepEqual(snapshot(first), snapshot(second));
});

test("pillageEnabled = false reproduces V1.4.3 behavior: raids travel and return with empty hands", () => {
  const simulation = new Simulation(pillageConfig({ pillageEnabled: false, bFoodStock: 80 }));
  const colonyA = simulation.colonies[0];
  const colonyB = simulation.colonies[1];
  const soldier = pushSoldier(colonyA, "A-SOLDIER-1");
  setupRaid(simulation);

  let sawStolenEvent = false;
  for (let tick = 0; tick < 400 && soldier.raidId !== null; tick += 1) {
    simulation.tick();
    if (simulation.tickEvents.some((event) => event.type === "FOOD_STOLEN")) sawStolenEvent = true;
  }

  assert.equal(sawStolenEvent, false);
  assert.equal(colonyB.foodStock, 80, "untouched — pillage never engages");
  assert.equal(colonyA.foodStolen, 0);
  assert.equal(colonyA.foodRecovered, 0);
  assert.equal(colonyA.raidsCompleted, 1, "the raid itself still runs its full course");
});

function raidDecisionConfig(overrides = {}) {
  return {
    autoRaidEnabled: true,
    raidEvaluationIntervalTicks: 10,
    minRaidSize: 3,
    maxRaidSize: 6,
    minStockToRaid: 50,
    raidCooldownTicks: 200,
    ...overrides,
  };
}

function colonyWithSoldiers(count) {
  const colony = new Colony({ id: "A", nest: new Nest(0, 0, 5) });
  colony.foodStock = 100;
  for (let index = 0; index < count; index += 1) {
    pushSoldier(colony, `A-SOLDIER-${index}`);
  }
  colony.knownEnemyNests.set("B", { position: { x: 500, y: 0 }, discoveredTick: 10, lastSeenTick: 10 });
  return colony;
}

test("RaidDecisionSystem never triggers when autoRaidEnabled is false", () => {
  const system = new RaidDecisionSystem();
  const colony = colonyWithSoldiers(5);
  const decision = system.decide(colony, raidDecisionConfig({ autoRaidEnabled: false }), 100, new Set());
  assert.equal(decision, null);
});

test("RaidDecisionSystem only evaluates on the configured interval", () => {
  const system = new RaidDecisionSystem();
  const colony = colonyWithSoldiers(5);
  const config = raidDecisionConfig();
  assert.equal(system.decide(colony, config, 101, new Set()), null, "not a multiple of the interval");
  assert.ok(system.decide(colony, config, 100, new Set()));
});

test("RaidDecisionSystem refuses to raid below minStockToRaid", () => {
  const system = new RaidDecisionSystem();
  const colony = colonyWithSoldiers(5);
  colony.foodStock = 10;
  const decision = system.decide(colony, raidDecisionConfig({ minStockToRaid: 50 }), 100, new Set());
  assert.equal(decision, null);
});

test("RaidDecisionSystem refuses to raid without a known enemy nest", () => {
  const system = new RaidDecisionSystem();
  const colony = new Colony({ id: "A", nest: new Nest(0, 0, 5) });
  colony.foodStock = 200;
  for (let index = 0; index < 5; index += 1) pushSoldier(colony, `A-SOLDIER-${index}`);
  const decision = system.decide(colony, raidDecisionConfig(), 100, new Set());
  assert.equal(decision, null, "nothing to target");
});

test("RaidDecisionSystem refuses to raid below minRaidSize available soldiers", () => {
  const system = new RaidDecisionSystem();
  const colony = colonyWithSoldiers(2);
  const decision = system.decide(colony, raidDecisionConfig({ minRaidSize: 3 }), 100, new Set());
  assert.equal(decision, null);
});

test("RaidDecisionSystem caps the group size at maxRaidSize even with more soldiers available", () => {
  const system = new RaidDecisionSystem();
  const colony = colonyWithSoldiers(10);
  const decision = system.decide(colony, raidDecisionConfig({ maxRaidSize: 4 }), 100, new Set());
  assert.equal(decision.groupSize, 4);
});

test("RaidDecisionSystem never targets a colony already under an active raid from this colony", () => {
  const system = new RaidDecisionSystem();
  const colony = colonyWithSoldiers(5);
  const decision = system.decide(colony, raidDecisionConfig(), 100, new Set(["B"]));
  assert.equal(decision, null, "B is already being raided — no duplicate raid toward the same target");
});

test("RaidDecisionSystem excludes soldiers that are DEFENDING, RAIDING, or dead from availability", () => {
  const system = new RaidDecisionSystem();
  const colony = colonyWithSoldiers(5);
  colony.ants[0].state = AntState.DEFENDING;
  colony.ants[1].state = AntState.DEAD;
  colony.ants[2].raidId = "some-other-raid";
  const decision = system.decide(colony, raidDecisionConfig({ minRaidSize: 2 }), 100, new Set());
  assert.ok(decision);
  assert.equal(decision.groupSize, 2, "only the two untouched SEARCHING_FOOD soldiers are available");
});

function autoRaidConfig(overrides = {}) {
  return pillageConfig({
    combatEnabled: true,
    autoRaidEnabled: true,
    raidEvaluationIntervalTicks: 10,
    minRaidSize: 1,
    maxRaidSize: 2,
    minStockToRaid: 5,
    raidCooldownTicks: 100,
    ...overrides,
  });
}

test("an eligible colony launches raids on its own once autoRaidEnabled is set, with no manual requestRaid call", () => {
  const simulation = new Simulation(autoRaidConfig({ bFoodStock: 200, aFoodStock: 100 }));
  const colonyA = simulation.colonies[0];
  pushSoldier(colonyA, "A-SOLDIER-1");
  pushSoldier(colonyA, "A-SOLDIER-2");
  colonyA.knownEnemyNests.set("B", {
    position: { ...simulation.colonies[1].nest.position },
    discoveredTick: 0,
    lastSeenTick: 0,
  });
  simulation.colonies[1].ants[0].speed = 0;

  let sawRaidCreated = false;
  for (let tick = 0; tick < 500 && !sawRaidCreated; tick += 1) {
    simulation.tick();
    if (simulation.tickEvents.some((event) => event.type === "RAID_CREATED")) sawRaidCreated = true;
  }

  assert.equal(sawRaidCreated, true, "the colony should launch a raid entirely on its own");
  assert.equal(colonyA.raidsStarted, 1);
});

test("the raid cooldown prevents launching a second raid immediately after the first", () => {
  const simulation = new Simulation(autoRaidConfig({ bFoodStock: 500, aFoodStock: 100, raidCooldownTicks: 100_000 }));
  const colonyA = simulation.colonies[0];
  for (let index = 0; index < 4; index += 1) pushSoldier(colonyA, `A-SOLDIER-${index}`);
  colonyA.knownEnemyNests.set("B", {
    position: { ...simulation.colonies[1].nest.position },
    discoveredTick: 0,
    lastSeenTick: 0,
  });
  simulation.colonies[1].ants[0].speed = 0;

  let raidsStartedEvents = 0;
  for (let tick = 0; tick < 1000; tick += 1) {
    simulation.tick();
    raidsStartedEvents += simulation.tickEvents.filter((event) => event.type === "RAID_CREATED").length;
  }

  assert.equal(raidsStartedEvents, 1, "the cooldown blocks any further raid for the rest of the run");
});

test("autoRaidEnabled = false reproduces V1.4.4 behavior exactly: raids never trigger on their own", () => {
  const simulation = new Simulation(pillageConfig({ combatEnabled: true, bFoodStock: 500 }));
  const colonyA = simulation.colonies[0];
  for (let index = 0; index < 4; index += 1) pushSoldier(colonyA, `A-SOLDIER-${index}`);
  colonyA.knownEnemyNests.set("B", {
    position: { ...simulation.colonies[1].nest.position },
    discoveredTick: 0,
    lastSeenTick: 0,
  });

  for (let tick = 0; tick < 500; tick += 1) simulation.tick();

  assert.equal(colonyA.raidsStarted, 0);
  assert.equal(simulation.raids.size, 0);
});

test("auto-raid replay is exact for an identical seed and configuration", () => {
  const config = autoRaidConfig({ bFoodStock: 300, aFoodStock: 100 });
  const runOnce = () => {
    const simulation = new Simulation(config);
    const colonyA = simulation.colonies[0];
    for (let index = 0; index < 4; index += 1) pushSoldier(colonyA, `A-SOLDIER-${index}`);
    colonyA.knownEnemyNests.set("B", {
      position: { ...simulation.colonies[1].nest.position },
      discoveredTick: 0,
      lastSeenTick: 0,
    });
    simulation.colonies[1].ants[0].speed = 0;
    const raidTicks = [];
    for (let tick = 0; tick < 1500; tick += 1) {
      simulation.tick();
      if (simulation.tickEvents.some((event) => event.type === "RAID_CREATED")) raidTicks.push(tick);
    }
    return { raidTicks, colonyA };
  };
  const first = runOnce();
  const second = runOnce();
  assert.deepEqual(first.raidTicks, second.raidTicks);
  assert.equal(first.colonyA.foodStolen, second.colonyA.foodStolen);
  assert.equal(first.colonyA.raidsCompleted, second.colonyA.raidsCompleted);
});

test("TacticalOverlaySystem produces no overlay on a plain scenario with no raid activity", () => {
  const simulation = new Simulation(multiColonyConfig());
  const overlays = new TacticalOverlaySystem().collect(simulation);
  assert.deepEqual(overlays, []);
});

test("TacticalOverlaySystem exposes a known enemy nest as soon as it is discovered", () => {
  const simulation = new Simulation(pillageConfig());
  const colonyA = simulation.colonies[0];
  const colonyB = simulation.colonies[1];
  colonyA.knownEnemyNests.set("B", {
    position: { ...colonyB.nest.position },
    discoveredTick: 5,
    lastSeenTick: 5,
  });

  const overlays = new TacticalOverlaySystem().collect(simulation);
  const nestMarker = overlays.find((overlay) => overlay.type === OverlayType.ENEMY_NEST_KNOWN);
  assert.ok(nestMarker);
  assert.equal(nestMarker.colonyId, "A");
  assert.deepEqual({ x: nestMarker.x, y: nestMarker.y }, colonyB.nest.position);
});

test("TacticalOverlaySystem draws a raid route only once the target nest is actually known", () => {
  const simulation = new Simulation(pillageConfig());
  const colonyA = simulation.colonies[0];
  const soldier = pushSoldier(colonyA, "A-SOLDIER-1");
  const raid = setupRaid(simulation);

  let overlays = new TacticalOverlaySystem().collect(simulation);
  assert.ok(overlays.some((overlay) => overlay.type === OverlayType.RAID_ROUTE));
  const route = overlays.find((overlay) => overlay.type === OverlayType.RAID_ROUTE);
  assert.deepEqual({ x: route.x, y: route.y }, colonyA.nest.position);
  assert.equal(route.targetX, colonyA.knownEnemyNests.get("B").position.x);

  const group = overlays.find((overlay) => overlay.type === OverlayType.RAID_GROUP);
  assert.ok(group);
  assert.deepEqual({ x: group.x, y: group.y }, soldier.position);

  // once the raid resolves, no more route/group overlay for it
  colonyA.knownEnemyNests.delete("B");
  simulation.raids.delete(raid.id);
  soldier.raidId = null;
  overlays = new TacticalOverlaySystem().collect(simulation);
  assert.equal(overlays.some((overlay) => overlay.type === OverlayType.RAID_ROUTE), false);
});

test("TacticalOverlaySystem flags any ant currently carrying raid loot", () => {
  const simulation = new Simulation(pillageConfig());
  const colonyA = simulation.colonies[0];
  const soldier = pushSoldier(colonyA, "A-SOLDIER-1");
  soldier.raidCargo = 8;

  const overlays = new TacticalOverlaySystem().collect(simulation);
  const lootMarker = overlays.find((overlay) => overlay.type === OverlayType.LOOT_CARRIED);
  assert.ok(lootMarker);
  assert.equal(lootMarker.payload.amount, 8);
  assert.deepEqual({ x: lootMarker.x, y: lootMarker.y }, soldier.position);
});

test("MapMarkerRenderer draws every overlay type without throwing, given only a bare 2D-context surface", () => {
  const simulation = new Simulation(pillageConfig());
  const colonyA = simulation.colonies[0];
  const soldier = pushSoldier(colonyA, "A-SOLDIER-1");
  soldier.raidCargo = 5;
  setupRaid(simulation);

  const overlays = new TacticalOverlaySystem().collect(simulation);
  assert.ok(overlays.length >= 3, "route, group and loot should all be present in this setup");

  const noop = () => {};
  const ctx = new Proxy({}, { get: () => noop });
  const colonyColors = new Map(simulation.colonies.map((colony) => [colony.id, colony.color]));
  assert.doesNotThrow(() => new MapMarkerRenderer().render(ctx, overlays, colonyColors));
});

test("the renderer exposes a tactical overlay toggle independent from pheromone/territory modes", () => {
  const renderer = new Renderer({ getContext: () => ({}) });
  assert.equal(renderer.tacticalOverlaysEnabled, true, "on by default");
  renderer.setTacticalOverlaysEnabled(false);
  assert.equal(renderer.tacticalOverlaysEnabled, false);
});

test("the renderer exposes per-category overlay toggles and rejects unknown categories", () => {
  const renderer = new Renderer({ getContext: () => ({}) });
  assert.equal(renderer.overlayVisibility.combat, true);
  renderer.setOverlayCategoryVisible("combat", false);
  assert.equal(renderer.overlayVisibility.combat, false);
  assert.throws(() => renderer.setOverlayCategoryVisible("nonsense", true));
});

test("TacticalOverlaySystem flags a nest under threat and clears it once the threat lifts", () => {
  const simulation = new Simulation(defenseConfig());
  const colonyA = simulation.colonies[0];
  const intruder = simulation.colonies[1].ants[0];
  intruder.position = { x: colonyA.nest.position.x + 5, y: colonyA.nest.position.y };
  simulation.tick();

  let overlays = new TacticalOverlaySystem().collect(simulation);
  const threatMarker = overlays.find((overlay) => overlay.type === OverlayType.NEST_UNDER_THREAT);
  assert.ok(threatMarker);
  assert.equal(threatMarker.colonyId, "A");

  intruder.position = { x: -1000, y: -1000 };
  for (let tick = 0; tick < 20 && colonyA.nestUnderThreat; tick += 1) simulation.tick();
  overlays = new TacticalOverlaySystem().collect(simulation);
  assert.equal(overlays.some((overlay) => overlay.type === OverlayType.NEST_UNDER_THREAT), false);
});

test("TacticalOverlaySystem raises an ALARM_ALERT only once the nest signal crosses the threshold", () => {
  const simulation = new Simulation(defenseConfig());
  const colonyA = simulation.colonies[0];
  const overlaysBefore = new TacticalOverlaySystem().collect(simulation);
  assert.equal(overlaysBefore.some((overlay) => overlay.type === OverlayType.ALARM_ALERT), false);

  const intruder = simulation.colonies[1].ants[0];
  intruder.position = { x: colonyA.nest.position.x + 5, y: colonyA.nest.position.y };
  for (let tick = 0; tick < 30; tick += 1) simulation.tick();

  const overlaysAfter = new TacticalOverlaySystem().collect(simulation);
  const alert = overlaysAfter.find((overlay) => overlay.type === OverlayType.ALARM_ALERT && overlay.colonyId === "A");
  assert.ok(alert, "sustained nest-defense ALARM should eventually cross the alert threshold");
  assert.ok(alert.payload.intensity >= 0.45);
});

test("TacticalOverlaySystem turns a combat event into a short-lived flash marker, ingested once per tick", () => {
  const system = new TacticalOverlaySystem();
  system.ingestEvents([
    { type: "COMBAT_STARTED", colonyId: "A", antId: "A-1", position: { x: 10, y: 20 } },
  ], 100);
  let overlays = system.collect({ colonies: [], raids: new Map(), colonyPheromones: new Map(), tickCount: 100 });
  const marker = overlays.find((overlay) => overlay.type === OverlayType.COMBAT);
  assert.ok(marker);
  assert.deepEqual({ x: marker.x, y: marker.y }, { x: 10, y: 20 });

  overlays = system.collect({ colonies: [], raids: new Map(), colonyPheromones: new Map(), tickCount: 100 + 1000 });
  assert.equal(overlays.some((overlay) => overlay.type === OverlayType.COMBAT), false, "the flash must expire");
});

test("TacticalOverlaySystem turns a combat death into a distinct, longer-lived flash marker", () => {
  const system = new TacticalOverlaySystem();
  system.ingestEvents([
    { type: "COMBAT_DEATH", colonyId: "A", antId: "A-1", position: { x: 5, y: 5 } },
  ], 50);
  const overlays = system.collect({ colonies: [], raids: new Map(), colonyPheromones: new Map(), tickCount: 50 });
  const marker = overlays.find((overlay) => overlay.type === OverlayType.COMBAT_DEATH);
  assert.ok(marker);
});

test("overlay visibility categories independently filter what collect() returns", () => {
  const simulation = new Simulation(pillageConfig());
  const colonyA = simulation.colonies[0];
  const soldier = pushSoldier(colonyA, "A-SOLDIER-1");
  soldier.raidCargo = 4;
  setupRaid(simulation);

  const system = new TacticalOverlaySystem();
  const allOff = Object.fromEntries(Object.keys(DEFAULT_OVERLAY_VISIBILITY).map((key) => [key, false]));
  const withOnlyLoot = { ...allOff, loot: true };
  const overlays = system.collect(simulation, withOnlyLoot);
  assert.ok(overlays.every((overlay) => overlay.type === OverlayType.LOOT_CARRIED));
  assert.ok(overlays.length > 0);
});
