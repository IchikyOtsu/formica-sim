import assert from "node:assert/strict";
import test from "node:test";
import { SearchFoodBehavior } from "../src/behaviors/SearchFoodBehavior.js";
import { Ant, AntState } from "../src/entities/Ant.js";
import { FoodSource } from "../src/entities/FoodSource.js";
import { PheromoneField } from "../src/simulation/PheromoneField.js";
import { Renderer } from "../src/rendering/Renderer.js";
import { Simulation } from "../src/simulation/Simulation.js";
import { DEFAULT_CONFIG } from "../src/simulation/SimulationConfig.js";
import { World } from "../src/simulation/World.js";
import { FoodDetectionSystem } from "../src/systems/FoodDetectionSystem.js";
import { PheromoneDepositSystem } from "../src/systems/PheromoneDepositSystem.js";
import { PheromoneSensingSystem } from "../src/systems/PheromoneSensingSystem.js";

function foragingConfig(overrides = {}) {
  return {
    ...DEFAULT_CONFIG,
    width: 120,
    height: 80,
    tickDurationMs: 100,
    initialAnts: 1,
    antSpeed: 20,
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
  assert.equal(metrics.resources + metrics.foodRemaining + metrics.carryingAnts, 240);
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

test("pheromone deposits reinforce a cell and evaporate below the threshold", () => {
  const field = new PheromoneField(100, 80, 10, 50);
  const position = { x: 25, y: 25 };
  field.deposit(position, 8);
  const firstDeposit = field.sample(position);
  field.deposit(position, 8);
  assert.ok(field.sample(position) > firstDeposit);

  field.evaporate(0.5, 0.1);
  assert.equal(field.sample(position), 8);
  for (let index = 0; index < 7; index += 1) field.evaporate(0.5, 0.1);
  assert.equal(field.sample(position), 0);
  assert.deepEqual(field.getStats(), { total: 0, activeCells: 0, maximum: 0 });
});

test("only a loaded returning ant deposits a distance-weighted trail", () => {
  const simulation = new Simulation(foragingConfig());
  const ant = simulation.colony.ants[0];
  const system = new PheromoneDepositSystem();
  ant.position = { x: 70, y: 40 };

  assert.equal(system.deposit(
    ant,
    simulation.pheromoneField,
    simulation.colony.nest,
    simulation.world,
    1,
  ), 0);
  ant.carryingFood = true;
  ant.state = AntState.RETURNING_HOME;
  assert.ok(system.deposit(
    ant,
    simulation.pheromoneField,
    simulation.colony.nest,
    simulation.world,
    1,
  ) > 0);
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
  field.deposit({ x: 50, y: 70 }, 10);
  const sensing = new PheromoneSensingSystem(() => 0.5);
  const suggestion = sensing.suggestDirection(ant, field, {
    distance: 20,
    arc: Math.PI,
    samples: 3,
    minimumSignal: 0.1,
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
  assert.ok(simulation.pheromoneField.getStats().total > 0);

  for (let index = 0; index < 5_000; index += 1) simulation.tick();
  assert.deepEqual(
    simulation.pheromoneField.getStats(),
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

test("identical seeds reproduce ants, resources, and pheromone fields", () => {
  const first = new Simulation();
  const second = new Simulation();
  for (let index = 0; index < 1_000; index += 1) {
    first.tick();
    second.tick();
  }
  assert.equal(JSON.stringify(first.colony.ants), JSON.stringify(second.colony.ants));
  assert.equal(first.colony.resources, second.colony.resources);
  assert.deepEqual(first.pheromoneField.values, second.pheromoneField.values);
});

test("enabling an empty field does not change the baseline random walk", () => {
  const withoutPheromones = new Simulation({ ...DEFAULT_CONFIG, pheromonesEnabled: false });
  const withEmptyField = new Simulation({ ...DEFAULT_CONFIG, pheromonesEnabled: true });
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
  assert.equal(simulation.pheromoneField.getStats().activeCells, 0);
});

test("the renderer can hide pheromones without changing the field", () => {
  const renderer = new Renderer({ getContext: () => ({}) });
  const field = new PheromoneField(20, 20, 10);
  field.deposit({ x: 5, y: 5 }, 4);
  renderer.setPheromonesVisible(false);
  assert.equal(renderer.showPheromones, false);
  assert.equal(field.sample({ x: 5, y: 5 }), 4);
});

test("V0.3 exhausts every source faster than the V0.2 baseline", () => {
  function run(pheromonesEnabled) {
    const simulation = new Simulation({ ...DEFAULT_CONFIG, pheromonesEnabled });
    while (simulation.completionTick === null && simulation.tickCount < 30_000) {
      simulation.tick();
    }
    return simulation;
  }

  const baseline = run(false);
  const collective = run(true);
  assert.equal(baseline.colony.resources, 240);
  assert.equal(collective.colony.resources, 240);
  assert.ok(collective.completionTick < baseline.completionTick * 0.8);
});
