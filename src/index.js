export { Simulation } from "./simulation/Simulation.js";
export { DEFAULT_CONFIG } from "./simulation/SimulationConfig.js";
export { ColonyPheromoneFields } from "./simulation/ColonyPheromoneFields.js";
export { TerritoryMap, TerritoryState } from "./simulation/TerritoryMap.js";
export {
  CONFIG_SCHEMA_VERSION,
  DEFAULT_ANALYTICS_CONFIG,
  analyticsConfigFrom,
  normalizeConfig,
  toVersionedConfig,
  validateFlatConfig,
} from "./config/ConfigSchema.js";
export {
  assertSimulationInvariants,
  inspectSimulationInvariants,
} from "./simulation/Invariants.js";
