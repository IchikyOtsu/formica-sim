import { EventLog } from "./analytics/EventLog.js";
import { MetricsRecorder } from "./analytics/MetricsRecorder.js";
import { ReplayController } from "./analytics/ReplayController.js";
import { createRunExport, downloadText, seriesToCsv } from "./analytics/RunExporter.js";
import { TimeSeriesRenderer } from "./analytics/TimeSeriesRenderer.js";
import { SCENARIO_PRESETS, configForPreset } from "./experiments/ScenarioPresets.js";
import { Renderer } from "./rendering/Renderer.js";
import { Simulation } from "./simulation/Simulation.js";
import { DEFAULT_CONFIG } from "./simulation/SimulationConfig.js";

const simulation = new Simulation();
const APP_VERSION = "0.9.0";
const renderer = new Renderer(document.querySelector("#world"));
const playPause = document.querySelector("#play-pause");
const buttonText = playPause.querySelector(".button-text");
const speedButtons = [...document.querySelectorAll(".speed")];
let running = true;
let speed = 1;
let accumulator = 0;
let previousTime = performance.now();
let recorder;
let eventLog;
let replayController;
let lastAnalysisSignature = "";

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
  alarmTotal: document.querySelector("#alarm-total"),
  alarmCells: document.querySelector("#alarm-cells"),
  dangerExposures: document.querySelector("#danger-exposures"),
  dangerDistance: document.querySelector("#danger-distance"),
  averageDetour: document.querySelector("#average-detour"),
  completionTick: document.querySelector("#completion-tick"),
  time: document.querySelector("#sim-time"),
  sampleInterval: document.querySelector("#sample-interval"),
  sampleCount: document.querySelector("#sample-count"),
  eventLog: document.querySelector("#event-log"),
  replayTick: document.querySelector("#replay-tick"),
  replayStatus: document.querySelector("#replay-status"),
  preset: document.querySelector("#scenario-preset"),
};

const charts = [...document.querySelectorAll(".chart")].map((canvas) => (
  new TimeSeriesRenderer(canvas, canvas.dataset.series)
));

function resetAnalytics() {
  recorder = new MetricsRecorder({
    sampleInterval: Number(elements.sampleInterval.value),
    maxSamples: 10_000,
  });
  eventLog = new EventLog({ maxEvents: 5_000 });
  recorder.record(simulation, { force: true });
  replayController = new ReplayController(simulation, { onTick: observeTick });
  lastAnalysisSignature = "";
}

function observeTick() {
  recorder.record(simulation);
  eventLog.capture(simulation.tickEvents);
}

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
  elements.alarmTotal.textContent = metrics.alarmPheromones.total.toFixed(0);
  elements.alarmCells.textContent = metrics.alarmPheromones.activeCells;
  elements.dangerExposures.textContent = metrics.dangerExposures;
  elements.dangerDistance.textContent = metrics.dangerDistance.toFixed(0);
  elements.averageDetour.textContent = metrics.averageDetourDistance.toFixed(1);
  elements.completionTick.textContent = metrics.completionTick === null
    ? "—"
    : `${metrics.completionTick} ticks`;
  elements.time.textContent = formatTime(metrics.elapsedMs);
}

function describeEvent(event) {
  const details = Object.entries(event)
    .filter(([key]) => key !== "tick" && key !== "type")
    .map(([key, value]) => `${key}=${typeof value === "number" ? Number(value.toFixed(2)) : value}`)
    .join(" · ");
  return `T=${event.tick}  ${event.type}${details ? `  ${details}` : ""}`;
}

function renderAnalytics() {
  const samples = recorder.series.samples;
  const lastEvent = eventLog.events.at(-1);
  const signature = [
    samples.length,
    eventLog.events.length,
    samples.at(-1)?.tick ?? 0,
    lastEvent?.tick ?? 0,
    lastEvent?.type ?? "",
  ].join(":");
  if (signature === lastAnalysisSignature) return;
  lastAnalysisSignature = signature;
  for (const chart of charts) chart.render(samples);
  elements.sampleCount.textContent = `${samples.length} point${samples.length > 1 ? "s" : ""}`;
  const recentEvents = eventLog.events.slice(-12).reverse();
  elements.eventLog.replaceChildren(...(recentEvents.length > 0
    ? recentEvents.map((event) => {
      const item = document.createElement("li");
      item.textContent = describeEvent(event);
      return item;
    })
    : [Object.assign(document.createElement("li"), { textContent: "Aucun événement enregistré." })]));
}

function frame(now) {
  const frameDelta = Math.min(now - previousTime, 250);
  previousTime = now;
  if (running) {
    accumulator += frameDelta * speed;
    while (accumulator >= simulation.config.tickDurationMs) {
      simulation.tick();
      observeTick();
      accumulator -= simulation.config.tickDurationMs;
    }
  }
  renderer.render(simulation);
  updateMetrics();
  renderAnalytics();
  requestAnimationFrame(frame);
}

function setRunning(nextRunning) {
  running = nextRunning;
  buttonText.textContent = running ? "Pause" : "Lecture";
  playPause.classList.toggle("paused", !running);
  playPause.setAttribute("aria-pressed", String(!running));
}

playPause.addEventListener("click", () => {
  setRunning(!running);
});

document.querySelector("#reset").addEventListener("click", () => {
  simulation.reset();
  resetAnalytics();
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
    alarmPheromonesEnabled: document.querySelector("#param-alarm").checked,
    alarmInfluence: Number(document.querySelector("#param-alarm-influence").value),
    alarmEvaporationRate: Number(document.querySelector("#param-alarm-evaporation").value),
  });
  resetAnalytics();
  accumulator = 0;
  updateMetrics();
});

for (const button of speedButtons) {
  button.addEventListener("click", () => {
    speed = Number(button.dataset.speed);
    speedButtons.forEach((candidate) => candidate.classList.toggle("active", candidate === button));
  });
}

function applyConfigToForm(config) {
  const values = {
    "#param-ants": config.initialAnts,
    "#param-evaporation": config.pheromoneEvaporationRate,
    "#param-diffusion": config.pheromoneDiffusionRate,
    "#param-food-deposit": config.foodDepositStrength,
    "#param-home-deposit": config.homeDepositStrength,
    "#param-influence": config.pheromoneInfluence,
    "#param-exploration": config.explorationStrength,
    "#param-energy-cost": config.energyConsumptionRate,
    "#param-low-energy": config.lowEnergyThreshold,
    "#param-food-energy": config.foodEnergyValue,
    "#param-initial-stock": config.initialFoodStock,
    "#param-laying-cooldown": config.queenLayingCooldownTicks,
    "#param-reproduction-threshold": config.reproductionFoodThreshold,
    "#param-max-brood": config.maxBrood,
    "#param-egg-cost": config.eggFoodCost,
    "#param-larva-food": config.larvaFoodPerTick,
    "#param-food-regen": config.foodRegenerationRate,
    "#param-season-duration": config.seasonDurationTicks,
    "#param-environment-severity": config.environmentSeverity,
    "#param-spawn-probability": config.foodSpawnProbability,
    "#param-max-sources": config.maxActiveSources,
    "#param-respawn-delay": config.foodRespawnDelayTicks,
    "#param-alarm-influence": config.alarmInfluence,
    "#param-alarm-evaporation": config.alarmEvaporationRate,
  };
  for (const [selector, value] of Object.entries(values)) {
    document.querySelector(selector).value = value;
  }
  document.querySelector("#param-reproduction").checked = config.reproductionEnabled;
  document.querySelector("#param-environment").checked = config.environmentEnabled;
  document.querySelector("#param-alarm").checked = config.alarmPheromonesEnabled;
}

function loadConfiguration(config) {
  const normalized = structuredClone({ ...DEFAULT_CONFIG, ...config });
  if (!Number.isFinite(normalized.seed)
    || normalized.width <= 0
    || normalized.height <= 0
    || !Array.isArray(normalized.foodSources)
    || !Array.isArray(normalized.dangerZones)) {
    throw new Error("Configuration Formica invalide");
  }
  simulation.reconfigure(normalized);
  applyConfigToForm(normalized);
  resetAnalytics();
  accumulator = 0;
  updateMetrics();
}

for (const preset of SCENARIO_PRESETS) {
  const option = document.createElement("option");
  option.value = preset.id;
  option.textContent = preset.name;
  option.title = preset.description;
  elements.preset.append(option);
}
elements.preset.value = "balanced-alarm";

document.querySelector("#apply-preset").addEventListener("click", () => {
  loadConfiguration(configForPreset(elements.preset.value));
});

document.querySelector("#export-run-json").addEventListener("click", () => {
  const payload = createRunExport({ simulation, recorder, eventLog, version: APP_VERSION });
  downloadText(
    `formica-run-seed-${simulation.config.seed}-tick-${simulation.tickCount}.json`,
    JSON.stringify(payload, null, 2),
    "application/json",
  );
});

document.querySelector("#export-run-csv").addEventListener("click", () => {
  downloadText(
    `formica-series-seed-${simulation.config.seed}.csv`,
    seriesToCsv(recorder.series.samples),
    "text/csv;charset=utf-8",
  );
});

document.querySelector("#export-config").addEventListener("click", () => {
  downloadText(
    `formica-config-seed-${simulation.config.seed}.json`,
    JSON.stringify({
      format: "formica-config",
      version: APP_VERSION,
      seed: simulation.config.seed,
      config: simulation.config,
    }, null, 2),
    "application/json",
  );
});

const configFile = document.querySelector("#config-file");
document.querySelector("#import-config").addEventListener("click", () => configFile.click());
configFile.addEventListener("change", async () => {
  const [file] = configFile.files;
  if (!file) return;
  try {
    const payload = JSON.parse(await file.text());
    loadConfiguration(payload.config ?? payload);
    if (Number.isFinite(payload.duration)) elements.replayTick.value = payload.duration;
    elements.replayStatus.textContent = `Configuration ${file.name} chargée`;
  } catch (error) {
    elements.replayStatus.textContent = error.message;
  } finally {
    configFile.value = "";
  }
});

elements.sampleInterval.addEventListener("change", () => resetAnalytics());

document.querySelector("#replay-seek").addEventListener("click", async () => {
  setRunning(false);
  replayController.cancel();
  resetAnalytics();
  const controller = replayController;
  const target = Number(elements.replayTick.value);
  elements.replayStatus.textContent = "Recalcul…";
  const completed = await controller.seek(target, {
    onProgress(current, total) {
      elements.replayStatus.textContent = total === 0 ? "Tick 0" : `${current} / ${total}`;
    },
  });
  elements.replayStatus.textContent = completed ? `Replay au tick ${target}` : "Replay annulé";
  updateMetrics();
  renderAnalytics();
});

resetAnalytics();
updateMetrics();
requestAnimationFrame(frame);
