import { DEFAULT_CONFIG } from "../simulation/SimulationConfig.js";

export const CONFIG_SCHEMA_VERSION = 1;

export const CONFIG_SECTIONS = Object.freeze({
  simulation: Object.freeze([
    "width", "height", "tickDurationMs", "seed", "nest", "foodSources", "colonies",
  ]),
  ants: Object.freeze([
    "initialAnts", "antSpeed", "foodDetectionRadius", "foodPickupDistance",
    "foreignDetectionRadius",
  ]),
  metabolism: Object.freeze([
    "antEnergy", "antMaxEnergy", "energyConsumptionRate", "carryingEnergyMultiplier",
    "basalEnergyConsumptionRate", "lowEnergyThreshold", "resumeEnergyThreshold",
    "foodEnergyValue",
  ]),
  pheromones: Object.freeze([
    "pheromonesEnabled", "foodPheromonesEnabled", "homePheromonesEnabled",
    "alarmPheromonesEnabled", "directHomeNavigation", "homeDetectionRadius",
    "pheromoneCellSize", "pheromoneEvaporationRate", "pheromoneDiffusionRate",
    "pheromoneMinimumIntensity", "alarmEvaporationRate", "alarmDiffusionRate",
    "alarmMinimumIntensity", "alarmDamageDepositStrength", "alarmDeathDepositStrength",
    "alarmDamageThreshold", "alarmInfluence", "navigationInertia", "navigationNoise",
    "foodDepositStrength", "homeDepositStrength", "homeFalloffDistance",
    "pheromoneMaxIntensity", "pheromoneSenseDistance", "pheromoneSenseArc",
    "pheromoneSenseSamples", "pheromoneMinSignal", "pheromoneInfluence",
    "homeTrailInfluence", "pheromoneRevisitPenalty", "recentCellMemory",
    "explorationStrength", "territoryMinimumInfluence", "territoryContestThreshold",
    "territoryUpdateInterval",
  ]),
  demography: Object.freeze([
    "initialFoodStock", "reproductionEnabled", "queenLayingCooldownTicks",
    "reproductionFoodThreshold", "eggFoodCost", "maxBrood", "maxWorkers",
    "eggDurationTicks", "larvaDurationTicks", "pupaDurationTicks", "larvaFoodPerTick",
  ]),
  environment: Object.freeze([
    "environmentEnabled", "seasonDurationTicks", "environmentSeverity",
    "foodRegenerationRate", "foodSpawnProbability", "maxActiveSources",
    "foodMinQuantity", "foodMaxQuantity", "foodRespawnDelayTicks",
    "foodSourceLifetimeTicks", "foodSpawnMargin", "foodSourceRadius",
    "autonomyWindowTicks",
  ]),
  hazards: Object.freeze(["dangerZones"]),
});

export const DEFAULT_ANALYTICS_CONFIG = Object.freeze({
  sampleInterval: 50,
  maxSamples: 10_000,
  maxEvents: 5_000,
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function fail(path, message) {
  throw new TypeError(`Configuration invalide (${path}) : ${message}`);
}

function validatePosition(path, value, radiusRequired = true) {
  if (!value || typeof value !== "object") fail(path, "objet attendu");
  for (const key of radiusRequired ? ["x", "y", "radius"] : ["x", "y"]) {
    if (!Number.isFinite(value[key])) fail(`${path}.${key}`, "nombre fini attendu");
  }
  if (radiusRequired && value.radius <= 0) fail(`${path}.radius`, "doit être positif");
}

function validateAnalytics(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("analytics", "section obligatoire");
  }
  const analytics = { ...DEFAULT_ANALYTICS_CONFIG, ...value };
  for (const key of Object.keys(DEFAULT_ANALYTICS_CONFIG)) {
    if (!Number.isInteger(analytics[key]) || analytics[key] < 1) {
      fail(`analytics.${key}`, "entier positif attendu");
    }
  }
  return analytics;
}

export function validateFlatConfig(config) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    fail("simulation", "objet attendu");
  }
  for (const [key, defaultValue] of Object.entries(DEFAULT_CONFIG)) {
    const value = config[key];
    if (typeof defaultValue === "number" && !Number.isFinite(value)) {
      fail(key, "nombre fini attendu");
    }
    if (typeof defaultValue === "boolean" && typeof value !== "boolean") {
      fail(key, "booléen attendu");
    }
  }
  for (const key of [
    "width", "height", "tickDurationMs", "antMaxEnergy", "territoryUpdateInterval",
    "pheromoneCellSize", "pheromoneMaxIntensity", "seasonDurationTicks",
  ]) {
    if (config[key] <= 0) fail(key, "doit être positif");
  }
  for (const key of [
    "initialAnts", "antSpeed", "energyConsumptionRate", "basalEnergyConsumptionRate", "initialFoodStock",
    "eggFoodCost", "larvaFoodPerTick", "foodRegenerationRate", "foodSpawnProbability",
    "pheromoneMinimumIntensity", "alarmMinimumIntensity", "foreignDetectionRadius",
    "territoryMinimumInfluence", "territoryContestThreshold",
  ]) {
    if (config[key] < 0) fail(key, "ne peut pas être négatif");
  }
  for (const key of [
    "pheromoneEvaporationRate", "pheromoneDiffusionRate", "alarmEvaporationRate",
    "alarmDiffusionRate", "lowEnergyThreshold", "resumeEnergyThreshold",
  ]) {
    if (config[key] < 0 || config[key] > 1) fail(key, "doit être compris entre 0 et 1");
  }
  if (!Number.isInteger(config.seed)) fail("seed", "entier attendu");
  if (!Number.isInteger(config.territoryUpdateInterval)) {
    fail("territoryUpdateInterval", "entier positif attendu");
  }
  if (!Number.isInteger(config.initialAnts) || config.initialAnts < 0) {
    fail("initialAnts", "entier positif ou nul attendu");
  }
  if (!Array.isArray(config.foodSources)) fail("foodSources", "tableau attendu");
  if (!Array.isArray(config.dangerZones)) fail("dangerZones", "tableau attendu");
  if (config.colonies !== null && !Array.isArray(config.colonies)) {
    fail("colonies", "tableau ou null attendu");
  }
  if (Array.isArray(config.colonies) && config.colonies.length === 0) {
    fail("colonies", "doit contenir au moins une colonie ou valoir null");
  }
  validatePosition("nest", config.nest);
  config.foodSources.forEach((source, index) => {
    validatePosition(`foodSources[${index}]`, source);
    if (!Number.isFinite(source.quantity) || source.quantity < 0) {
      fail(`foodSources[${index}].quantity`, "quantité positive ou nulle attendue");
    }
  });
  config.dangerZones.forEach((zone, index) => validatePosition(`dangerZones[${index}]`, zone));
  if (config.colonies) {
    const ids = new Set();
    config.colonies.forEach((colony, index) => {
      if (!colony || typeof colony !== "object") fail(`colonies[${index}]`, "objet attendu");
      if (typeof colony.id !== "string" || colony.id.length === 0) {
        fail(`colonies[${index}].id`, "identifiant attendu");
      }
      if (ids.has(colony.id)) fail(`colonies[${index}].id`, "identifiant dupliqué");
      ids.add(colony.id);
      validatePosition(`colonies[${index}].nest`, colony.nest);
      if (colony.initialAnts !== undefined
        && (!Number.isInteger(colony.initialAnts) || colony.initialAnts < 0)) {
        fail(`colonies[${index}].initialAnts`, "entier positif ou nul attendu");
      }
      if (colony.initialFoodStock !== undefined
        && (!Number.isFinite(colony.initialFoodStock) || colony.initialFoodStock < 0)) {
        fail(`colonies[${index}].initialFoodStock`, "nombre positif ou nul attendu");
      }
    });
  }
  return config;
}

export function toVersionedConfig(flatConfig, analytics = DEFAULT_ANALYTICS_CONFIG) {
  const config = validateFlatConfig(clone({ ...DEFAULT_CONFIG, ...flatConfig }));
  const versioned = { schemaVersion: CONFIG_SCHEMA_VERSION };
  for (const [section, keys] of Object.entries(CONFIG_SECTIONS)) {
    versioned[section] = Object.fromEntries(keys.map((key) => [key, clone(config[key])]));
  }
  versioned.analytics = clone(validateAnalytics(analytics));
  return versioned;
}

export function normalizeConfig(input = DEFAULT_CONFIG, seedOverride) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    fail("root", "objet attendu");
  }
  let overrides;
  if (Object.hasOwn(input, "schemaVersion")) {
    if (input.schemaVersion !== CONFIG_SCHEMA_VERSION) {
      fail("schemaVersion", `version ${input.schemaVersion} non prise en charge`);
    }
    const allowedTopLevel = new Set(["schemaVersion", ...Object.keys(CONFIG_SECTIONS), "analytics"]);
    for (const key of Object.keys(input)) {
      if (!allowedTopLevel.has(key)) fail(key, "section inconnue");
    }
    validateAnalytics(input.analytics);
    overrides = {};
    for (const section of Object.keys(CONFIG_SECTIONS)) {
      if (!input[section] || typeof input[section] !== "object" || Array.isArray(input[section])) {
        fail(section, "section obligatoire");
      }
      const allowedKeys = new Set(CONFIG_SECTIONS[section]);
      for (const key of Object.keys(input[section])) {
        if (!allowedKeys.has(key)) fail(`${section}.${key}`, "paramètre inconnu");
      }
      Object.assign(overrides, input[section]);
    }
  } else {
    overrides = input;
  }
  const normalized = clone({ ...DEFAULT_CONFIG, ...overrides });
  if (seedOverride !== undefined) normalized.seed = seedOverride;
  return validateFlatConfig(normalized);
}

export function analyticsConfigFrom(input) {
  if (!input || input.schemaVersion === undefined) return clone(DEFAULT_ANALYTICS_CONFIG);
  return clone(validateAnalytics(input.analytics));
}
