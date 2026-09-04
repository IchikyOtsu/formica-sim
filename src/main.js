import { EventLog } from "./observability/EventLog.js";
import { MetricsRecorder } from "./observability/MetricsRecorder.js";
import { ReplayController } from "./observability/ReplayController.js";
import { createRunExport, downloadText, seriesToCsv } from "./observability/RunExporter.js";
import { TimeSeriesRenderer } from "./observability/TimeSeriesRenderer.js";
import { evaluatePauseConditions } from "./observability/PauseConditions.js";
import { SCENARIO_PRESETS, configForPreset } from "./experiments/ScenarioPresets.js";
import { analyticsConfigFrom, toVersionedConfig, CONFIG_SECTIONS } from "./config/ConfigSchema.js";
import { Renderer } from "./rendering/Renderer.js";
import { Simulation } from "./simulation/Simulation.js";
import { DEFAULT_CONFIG } from "./simulation/SimulationConfig.js";

const simulation = new Simulation(configForPreset("symmetric-competition"));
const APP_VERSION = "1.1.0";
const renderer = new Renderer(document.querySelector("#world"));
const playPause = document.querySelector("#play-pause");
const buttonText = playPause.querySelector(".button-text");
const runtimeStatus = document.querySelector("#runtime-status");
const runtimeStatusText = document.querySelector("#runtime-status-text");
const speedButtons = [...document.querySelectorAll(".speed")];
let running = true;
let speed = 1;
let accumulator = 0;
let previousTime = performance.now();
let recorder;
let eventLog;
let replayController;
let lastAnalysisSignature = "";
let analyticsRenderingEnabled = true;
let worldRenderingEnabled = true;
let runtimeFailed = false;

function reportRuntimeError(scope, error) {
  runtimeFailed = true;
  runtimeStatus.classList.add("error");
  runtimeStatusText.textContent = `Erreur ${scope} — voir la console`;
  console.error(`[Formica Sim] Erreur ${scope}`, error);
}

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
  pauseDeath: document.querySelector("#pause-death"),
  pauseDepletion: document.querySelector("#pause-depletion"),
  pauseSeason: document.querySelector("#pause-season"),
  pauseExtinction: document.querySelector("#pause-extinction"),
  pausePopulation: document.querySelector("#pause-population"),
  pauseStock: document.querySelector("#pause-stock"),
  pauseReason: document.querySelector("#pause-reason"),
  colonyComparison: document.querySelector("#colony-comparison"),
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
  analyticsRenderingEnabled = true;
}

function observeTick() {
  recorder.record(simulation);
  eventLog.capture(simulation.tickEvents);
  if (running) inspectPauseConditions();
}

function inspectPauseConditions() {
  const metrics = simulation.getMetrics();
  const reason = evaluatePauseConditions(simulation.tickEvents, metrics, {
    death: elements.pauseDeath.checked,
    depletion: elements.pauseDepletion.checked,
    season: elements.pauseSeason.checked,
    extinction: elements.pauseExtinction.checked,
    population: elements.pausePopulation.value === ""
      ? null
      : Number(elements.pausePopulation.value),
    stock: elements.pauseStock.value === "" ? null : Number(elements.pauseStock.value),
  });
  if (reason) {
    setRunning(false);
    elements.pauseReason.textContent = `Pause au tick ${simulation.tickCount} : ${reason}`;
  }
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
  renderColonyMetrics(metrics.colonies);
}

function renderColonyMetrics(colonies) {
  const cards = colonies.map((colony) => {
    const card = document.createElement("article");
    card.className = "colony-card";
    card.style.setProperty("--colony-color", colony.color);
    const title = document.createElement("h3");
    title.textContent = colony.name;
    const list = document.createElement("dl");
    const rows = [
      ["Population", colony.totalPopulation],
      ["Stock", colony.foodStock.toFixed(1)],
      ["Collecte", colony.resources.toFixed(0)],
      ["Part ressources", `${(colony.resourceShare * 100).toFixed(1)} %`],
      ["Territoire", `${colony.territoryCells} cellules`],
      ["Contacts", colony.foreignContacts],
      ["Évitements", colony.avoidedContacts],
      ["Distance au nid", colony.averageNestDistance.toFixed(1)],
      ["Ouvrières / Soldats", `${colony.workerCount} / ${colony.soldierCount}`],
      ["Menace (threatPressure)", colony.threatPressure.toFixed(1)],
      ["Combats · attaques", `${colony.fights} · ${colony.attacks}`],
      ["Kills (ouvr. / sold.)", `${colony.workerKills} / ${colony.soldierKills}`],
      ["Pertes combat (ouvr. / sold.)", `${colony.workerLosses} / ${colony.soldierLosses}`],
      ["Coût militaire", colony.militaryFoodCost.toFixed(1)],
    ];
    for (const [label, value] of rows) {
      const term = document.createElement("dt");
      term.textContent = label;
      const detail = document.createElement("dd");
      detail.textContent = value;
      list.append(term, detail);
    }
    card.append(title, list);
    return card;
  });
  elements.colonyComparison.replaceChildren(...cards);
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
  // Planifier la prochaine frame en premier : une erreur d'affichage ponctuelle
  // ne doit jamais arrêter définitivement la simulation.
  requestAnimationFrame(frame);
  const frameDelta = Math.min(now - previousTime, 250);
  previousTime = now;
  try {
    if (running) {
      accumulator += frameDelta * speed;
      while (running && accumulator >= simulation.config.tickDurationMs) {
        simulation.tick();
        observeTick();
        accumulator -= simulation.config.tickDurationMs;
      }
    }
  } catch (error) {
    setRunning(false);
    reportRuntimeError("moteur", error);
    return;
  }
  if (worldRenderingEnabled) {
    try {
      renderer.render(simulation);
    } catch (error) {
      worldRenderingEnabled = false;
      reportRuntimeError("canvas", error);
    }
  }
  try {
    updateMetrics();
  } catch (error) {
    reportRuntimeError("métriques", error);
  }
  if (analyticsRenderingEnabled) {
    try {
      renderAnalytics();
    } catch (error) {
      analyticsRenderingEnabled = false;
      reportRuntimeError("graphiques", error);
    }
  }
  if (!runtimeFailed && simulation.tickCount > 0) {
    runtimeStatusText.textContent = `Simulation active · tick ${simulation.tickCount}`;
  }
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
  elements.pauseReason.textContent = "En attente d’un événement";
  updateMetrics();
});

document.querySelector("#pheromone-layer").addEventListener("change", (event) => {
  renderer.setPheromoneMode(event.target.value);
});

document.querySelector("#territory-layer").addEventListener("change", (event) => {
  renderer.setTerritoryMode(event.target.value);
});

// Un preset comme "Combat équilibré V1.2" fixe des seuils de combat/castes
// différents par colonie ; ces clés priment sur la config globale. Le
// formulaire ne propose que des réglages symétriques, donc on les retire des
// colonies au moment d'appliquer pour que les curseurs aient un effet visible.
const COLONY_OVERRIDE_KEYS_TO_RESET = [...CONFIG_SECTIONS.combat, ...CONFIG_SECTIONS.castes];

document.querySelector("#parameters-form").addEventListener("submit", (event) => {
  event.preventDefault();
  simulation.reconfigure({
    ...simulation.config,
    initialAnts: Number(document.querySelector("#param-ants").value),
    colonies: simulation.config.colonies?.map((colony) => {
      const stripped = { ...colony };
      for (const key of COLONY_OVERRIDE_KEYS_TO_RESET) delete stripped[key];
      return {
        ...stripped,
        initialAnts: Number(document.querySelector("#param-ants").value),
        initialFoodStock: Number(document.querySelector("#param-initial-stock").value),
      };
    }) ?? null,
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
    combatEnabled: document.querySelector("#param-combat-enabled").checked,
    combatRadius: Number(document.querySelector("#param-combat-radius").value),
    combatAttackPower: Number(document.querySelector("#param-combat-attack-power").value),
    combatAttackEnergyCost: Number(document.querySelector("#param-combat-attack-energy-cost").value),
    combatAttackCooldownTicks: Number(document.querySelector("#param-combat-attack-cooldown").value),
    combatAttackThreshold: Number(document.querySelector("#param-combat-attack-threshold").value),
    combatThreatenThreshold: Number(document.querySelector("#param-combat-threaten-threshold").value),
    combatFleeHealthRatio: Number(document.querySelector("#param-combat-flee-health-ratio").value),
    encounterAvoidanceThreshold: Number(document.querySelector("#param-encounter-avoidance-threshold").value),
    castesEnabled: document.querySelector("#param-castes-enabled").checked,
    casteSoldierRatioCap: Number(document.querySelector("#param-caste-ratio-cap").value),
    casteStockThreshold: Number(document.querySelector("#param-caste-stock-threshold").value),
    threatPressureRatioScale: Number(document.querySelector("#param-threat-pressure-scale").value),
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
    "#param-combat-radius": config.combatRadius,
    "#param-combat-attack-power": config.combatAttackPower,
    "#param-combat-attack-energy-cost": config.combatAttackEnergyCost,
    "#param-combat-attack-cooldown": config.combatAttackCooldownTicks,
    "#param-combat-attack-threshold": config.combatAttackThreshold,
    "#param-combat-threaten-threshold": config.combatThreatenThreshold,
    "#param-combat-flee-health-ratio": config.combatFleeHealthRatio,
    "#param-encounter-avoidance-threshold": config.encounterAvoidanceThreshold,
    "#param-caste-ratio-cap": config.casteSoldierRatioCap,
    "#param-caste-stock-threshold": config.casteStockThreshold,
    "#param-threat-pressure-scale": config.threatPressureRatioScale,
  };
  for (const [selector, value] of Object.entries(values)) {
    document.querySelector(selector).value = value;
  }
  document.querySelector("#param-reproduction").checked = config.reproductionEnabled;
  document.querySelector("#param-environment").checked = config.environmentEnabled;
  document.querySelector("#param-alarm").checked = config.alarmPheromonesEnabled;
  document.querySelector("#param-combat-enabled").checked = config.combatEnabled;
  document.querySelector("#param-castes-enabled").checked = config.castesEnabled;
}

function loadConfiguration(config) {
  const analytics = analyticsConfigFrom(config);
  simulation.reconfigure(config);
  applyConfigToForm(simulation.config);
  elements.sampleInterval.value = analytics.sampleInterval;
  resetAnalytics();
  accumulator = 0;
  elements.pauseReason.textContent = "En attente d’un événement";
  updateMetrics();
}

for (const preset of SCENARIO_PRESETS) {
  const option = document.createElement("option");
  option.value = preset.id;
  option.textContent = preset.name;
  option.title = preset.description;
  elements.preset.append(option);
}
elements.preset.value = "symmetric-competition";

document.querySelector("#apply-preset").addEventListener("click", () => {
  loadConfiguration(configForPreset(elements.preset.value));
  const preset = SCENARIO_PRESETS.find((candidate) => candidate.id === elements.preset.value);
  if (preset?.duration) elements.replayTick.value = preset.duration;
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
      config: toVersionedConfig(simulation.config, {
        sampleInterval: recorder.sampleInterval,
        maxSamples: recorder.series.maxSamples,
        maxEvents: eventLog.maxEvents,
      }),
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
