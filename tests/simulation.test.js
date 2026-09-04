import assert from "node:assert/strict";
import test from "node:test";
import { Simulation } from "../src/simulation/Simulation.js";
import { World } from "../src/simulation/World.js";

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
