import assert from "node:assert/strict";
import test from "node:test";
import { SearchFoodBehavior } from "../src/behaviors/SearchFoodBehavior.js";
import { ReturnHomeBehavior } from "../src/behaviors/ReturnHomeBehavior.js";
import { Ant, AntState } from "../src/entities/Ant.js";
import { Brood, BroodStage } from "../src/entities/Brood.js";
import { FoodSource, FoodSourceState } from "../src/entities/FoodSource.js";
import { DangerZone } from "../src/environment/DangerZone.js";
import { Season } from "../src/environment/Season.js";
import { PheromoneField, PheromoneType } from "../src/simulation/PheromoneField.js";
import { Renderer } from "../src/rendering/Renderer.js";
import { Simulation } from "../src/simulation/Simulation.js";
import { DEFAULT_CONFIG } from "../src/simulation/SimulationConfig.js";
import { World } from "../src/simulation/World.js";
import { FoodDetectionSystem } from "../src/systems/FoodDetectionSystem.js";
import { EnvironmentSystem } from "../src/systems/EnvironmentSystem.js";
import { FoodSpawnSystem } from "../src/systems/FoodSpawnSystem.js";
import { HazardSystem } from "../src/systems/HazardSystem.js";
import { HomeDetectionSystem } from "../src/systems/HomeDetectionSystem.js";
import { PheromoneDepositSystem } from "../src/systems/PheromoneDepositSystem.js";
import { PheromoneSensingSystem } from "../src/systems/PheromoneSensingSystem.js";
import { MetabolismSystem } from "../src/systems/MetabolismSystem.js";

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
  assert.equal(emerged, 1);
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
