import { Simulation } from "../src/simulation/Simulation.js";
import { DEFAULT_CONFIG } from "../src/simulation/SimulationConfig.js";

const tickLimit = 100_000;

function run(pheromonesEnabled) {
  const simulation = new Simulation({ ...DEFAULT_CONFIG, pheromonesEnabled });
  while (simulation.completionTick === null && simulation.tickCount < tickLimit) {
    simulation.tick();
  }
  return simulation.completionTick;
}

const baseline = run(false);
const collective = run(true);
const improvement = baseline && collective
  ? ((baseline - collective) / baseline) * 100
  : null;

console.table([
  { mode: "V0.2 — sans phéromones", ticks: baseline ?? `>${tickLimit}` },
  { mode: "V0.3 — avec phéromones", ticks: collective ?? `>${tickLimit}` },
]);
if (improvement !== null) {
  console.log(`Réduction du temps de collecte : ${improvement.toFixed(1)} %`);
}
