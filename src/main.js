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
  ants: document.querySelector("#ant-count"),
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
  elements.ants.textContent = metrics.ants;
  elements.food.textContent = metrics.foodSources;
  elements.foodRemaining.textContent = metrics.foodRemaining;
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
