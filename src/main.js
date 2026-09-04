import { Renderer } from "./rendering/Renderer.js";
import { Simulation } from "./simulation/Simulation.js";

const simulation = new Simulation();
const renderer = new Renderer(document.querySelector("#world"));
const playPause = document.querySelector("#play-pause");
const buttonText = playPause.querySelector(".button-text");
const speedButtons = [...document.querySelectorAll(".speed")];
let running = true;
let speed = 1;
let accumulator = 0;
let previousTime = performance.now();

const elements = {
  tick: document.querySelector("#tick"),
  season: document.querySelector("#current-season"),
  temperature: document.querySelector("#temperature"),
  environmentPressure: document.querySelector("#environment-pressure"),
  seasonCycle: document.querySelector("#season-cycle"),
  autonomy: document.querySelector("#autonomy"),
  starvationDeaths: document.querySelector("#starvation-deaths"),
  environmentalDeaths: document.querySelector("#environmental-deaths"),
  ants: document.querySelector("#ant-count"),
  totalAnts: document.querySelector("#total-ant-count"),
  eggs: document.querySelector("#egg-count"),
  larvae: document.querySelector("#larva-count"),
  pupae: document.querySelector("#pupa-count"),
  births: document.querySelector("#birth-count"),
  netGrowth: document.querySelector("#net-growth"),
  maxPopulation: document.querySelector("#max-population"),
  broodCost: document.querySelector("#brood-cost"),
  birthRate: document.querySelector("#birth-rate"),
  deathRate: document.querySelector("#death-rate"),
  deadAnts: document.querySelector("#dead-ants"),
  restingAnts: document.querySelector("#resting-ants"),
  averageEnergy: document.querySelector("#average-energy"),
  minimumEnergy: document.querySelector("#minimum-energy"),
  foodStock: document.querySelector("#food-stock"),
  consumedFood: document.querySelector("#consumed-food"),
  foodBalance: document.querySelector("#food-balance"),
  foodRatio: document.querySelector("#food-ratio"),
  food: document.querySelector("#food-count"),
  foodRemaining: document.querySelector("#food-remaining"),
  resources: document.querySelector("#resources"),
  carryingAnts: document.querySelector("#carrying-ants"),
  pheromoneTotal: document.querySelector("#pheromone-total"),
  pheromoneCells: document.querySelector("#pheromone-cells"),
  pheromoneMaximum: document.querySelector("#pheromone-max"),
  completionTick: document.querySelector("#completion-tick"),
  time: document.querySelector("#sim-time"),
};

function formatTime(milliseconds) {
  const tenths = Math.floor(milliseconds / 100) % 10;
  const seconds = Math.floor(milliseconds / 1000) % 60;
  const minutes = Math.floor(milliseconds / 60000) % 60;
  const hours = Math.floor(milliseconds / 3600000);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${tenths}`;
}

function updateMetrics() {
  const metrics = simulation.getMetrics();
  elements.tick.textContent = String(metrics.tick).padStart(6, "0");
  elements.season.textContent = metrics.seasonLabel;
  elements.temperature.textContent = `${metrics.temperature} °C`;
  elements.environmentPressure.textContent = metrics.environmentalPressure.toFixed(2);
  elements.seasonCycle.textContent = metrics.seasonCyclesCompleted;
  elements.autonomy.textContent = metrics.autonomyTicks === null
    ? "—"
    : `${Math.round(metrics.autonomyTicks)} ticks`;
  elements.starvationDeaths.textContent = metrics.starvationDeaths;
  elements.environmentalDeaths.textContent = metrics.environmentalDeaths;
  elements.ants.textContent = metrics.ants;
  elements.totalAnts.textContent = metrics.totalPopulation;
  elements.eggs.textContent = metrics.eggs;
  elements.larvae.textContent = metrics.larvae;
  elements.pupae.textContent = metrics.pupae;
  elements.births.textContent = metrics.births;
  elements.netGrowth.textContent = metrics.netGrowth > 0
    ? `+${metrics.netGrowth}`
    : metrics.netGrowth;
  elements.maxPopulation.textContent = metrics.maxPopulation;
  elements.broodCost.textContent = (metrics.broodFoodCost + metrics.reproductionFoodCost).toFixed(1);
  elements.birthRate.textContent = metrics.birthRate.toFixed(2);
  elements.deathRate.textContent = metrics.deathRate.toFixed(2);
  elements.deadAnts.textContent = metrics.deadAnts;
  elements.restingAnts.textContent = metrics.restingAnts;
  elements.averageEnergy.textContent = metrics.averageEnergy.toFixed(1);
  elements.minimumEnergy.textContent = metrics.minimumEnergy.toFixed(1);
  elements.foodStock.textContent = metrics.foodStock.toFixed(1);
  elements.consumedFood.textContent = metrics.consumedFood.toFixed(1);
  elements.foodBalance.textContent = metrics.foodBalance.toFixed(1);
  elements.foodRatio.textContent = metrics.collectionConsumptionRatio === null
    ? "—"
    : metrics.collectionConsumptionRatio.toFixed(2);
  elements.food.textContent = metrics.foodSources;
  elements.foodRemaining.textContent = Number(metrics.foodRemaining.toFixed(1));
  elements.resources.textContent = metrics.resources;
  elements.carryingAnts.textContent = metrics.carryingAnts;
  elements.pheromoneTotal.textContent = metrics.pheromoneTotal.toFixed(0);
  elements.pheromoneCells.textContent = metrics.pheromoneCells;
  elements.pheromoneMaximum.textContent = metrics.pheromoneMaximum.toFixed(1);
  elements.completionTick.textContent = metrics.completionTick === null
    ? "—"
    : `${metrics.completionTick} ticks`;
  elements.time.textContent = formatTime(metrics.elapsedMs);
}

function frame(now) {
  const frameDelta = Math.min(now - previousTime, 250);
  previousTime = now;
  if (running) {
    accumulator += frameDelta * speed;
    while (accumulator >= simulation.config.tickDurationMs) {
      simulation.tick();
      accumulator -= simulation.config.tickDurationMs;
    }
  }
  renderer.render(simulation);
  updateMetrics();
  requestAnimationFrame(frame);
}

playPause.addEventListener("click", () => {
  running = !running;
  buttonText.textContent = running ? "Pause" : "Lecture";
  playPause.classList.toggle("paused", !running);
  playPause.setAttribute("aria-pressed", String(!running));
});

document.querySelector("#reset").addEventListener("click", () => {
  simulation.reset();
  accumulator = 0;
  updateMetrics();
});

document.querySelector("#pheromone-layer").addEventListener("change", (event) => {
  renderer.setPheromoneMode(event.target.value);
});

document.querySelector("#parameters-form").addEventListener("submit", (event) => {
  event.preventDefault();
  simulation.reconfigure({
    ...simulation.config,
    initialAnts: Number(document.querySelector("#param-ants").value),
    pheromoneEvaporationRate: Number(document.querySelector("#param-evaporation").value),
    pheromoneDiffusionRate: Number(document.querySelector("#param-diffusion").value),
    foodDepositStrength: Number(document.querySelector("#param-food-deposit").value),
    homeDepositStrength: Number(document.querySelector("#param-home-deposit").value),
    pheromoneInfluence: Number(document.querySelector("#param-influence").value),
    homeTrailInfluence: Number(document.querySelector("#param-influence").value),
    explorationStrength: Number(document.querySelector("#param-exploration").value),
    energyConsumptionRate: Number(document.querySelector("#param-energy-cost").value),
    lowEnergyThreshold: Number(document.querySelector("#param-low-energy").value),
    foodEnergyValue: Number(document.querySelector("#param-food-energy").value),
    initialFoodStock: Number(document.querySelector("#param-initial-stock").value),
    reproductionEnabled: document.querySelector("#param-reproduction").checked,
    queenLayingCooldownTicks: Number(document.querySelector("#param-laying-cooldown").value),
    reproductionFoodThreshold: Number(document.querySelector("#param-reproduction-threshold").value),
    maxBrood: Number(document.querySelector("#param-max-brood").value),
    eggFoodCost: Number(document.querySelector("#param-egg-cost").value),
    larvaFoodPerTick: Number(document.querySelector("#param-larva-food").value),
    foodRegenerationRate: Number(document.querySelector("#param-food-regen").value),
    environmentEnabled: document.querySelector("#param-environment").checked,
    seasonDurationTicks: Number(document.querySelector("#param-season-duration").value),
    environmentSeverity: Number(document.querySelector("#param-environment-severity").value),
    foodSpawnProbability: Number(document.querySelector("#param-spawn-probability").value),
    maxActiveSources: Number(document.querySelector("#param-max-sources").value),
    foodRespawnDelayTicks: Number(document.querySelector("#param-respawn-delay").value),
  });
  accumulator = 0;
  updateMetrics();
});

for (const button of speedButtons) {
  button.addEventListener("click", () => {
    speed = Number(button.dataset.speed);
    speedButtons.forEach((candidate) => candidate.classList.toggle("active", candidate === button));
  });
}

updateMetrics();
requestAnimationFrame(frame);
