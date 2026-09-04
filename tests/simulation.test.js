import assert from "node:assert/strict";
import test from "node:test";
import { AntState } from "../src/entities/Ant.js";
import { FoodSource } from "../src/entities/FoodSource.js";
import { Simulation } from "../src/simulation/Simulation.js";
import { DEFAULT_CONFIG } from "../src/simulation/SimulationConfig.js";
import { World } from "../src/simulation/World.js";
import { FoodDetectionSystem } from "../src/systems/FoodDetectionSystem.js";

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

test("the deterministic default scenario exhausts and delivers every source", () => {
  const simulation = new Simulation();
  for (let index = 0; index < 25_000; index += 1) simulation.tick();

  const metrics = simulation.getMetrics();
  assert.equal(metrics.foodSources, 0);
  assert.equal(metrics.foodRemaining, 0);
  assert.equal(metrics.carryingAnts, 0);
  assert.equal(metrics.resources, 240);
});
