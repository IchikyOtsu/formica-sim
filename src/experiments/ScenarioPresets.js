import { DEFAULT_CONFIG } from "../simulation/SimulationConfig.js";

export const SCENARIO_PRESETS = Object.freeze([
  {
    id: "stable",
    name: "Stable",
    description: "Ressources fixes, pression environnementale neutralisée.",
    seed: 1847,
    config: { environmentEnabled: false, foodRegenerationRate: 0.004 },
  },
  {
    id: "moderate-seasons",
    name: "Saisons modérées",
    description: "Cycle écologique équilibré avec dangers ordinaires.",
    seed: 1847,
    config: { environmentEnabled: true, environmentSeverity: 1 },
  },
  {
    id: "hostile-winter",
    name: "Hiver hostile",
    description: "Régénération faible, coûts élevés et stock initial limité.",
    seed: 937421,
    config: {
      environmentEnabled: true,
      environmentSeverity: 1.9,
      foodRegenerationRate: 0.0003,
      foodSpawnProbability: 0.0004,
      initialFoodStock: 3,
    },
  },
  {
    id: "balanced-alarm",
    name: "ALARM équilibrée",
    description: "Évitement efficace avec une trace courte.",
    seed: 1847,
    config: { alarmPheromonesEnabled: true, alarmInfluence: 1.2 },
  },
  {
    id: "persistent-alarm",
    name: "ALARM persistante",
    description: "Prudence excessive et barrières informationnelles.",
    seed: 1847,
    config: {
      alarmPheromonesEnabled: true,
      alarmInfluence: 4,
      alarmEvaporationRate: 0.004,
      alarmDamageDepositStrength: 3,
      alarmDeathDepositStrength: 45,
    },
  },
  {
    id: "resource-scarcity",
    name: "Ressources rares",
    description: "Petites sources, peu de stock et forte compétition.",
    seed: 41017,
    config: {
      initialFoodStock: 1,
      foodMinQuantity: 5,
      foodMaxQuantity: 18,
      foodSpawnProbability: 0.0005,
    },
  },
  {
    id: "population-boom",
    name: "Boom démographique",
    description: "Ponte rapide et abondance propices à un overshoot.",
    seed: 7919,
    config: {
      queenLayingCooldownTicks: 300,
      reproductionFoodThreshold: 8,
      maxBrood: 40,
      maxWorkers: 250,
      foodRegenerationRate: 0.008,
    },
  },
]);

export function configForPreset(id) {
  const preset = SCENARIO_PRESETS.find((candidate) => candidate.id === id);
  if (!preset) throw new Error(`Unknown scenario preset: ${id}`);
  return structuredClone({ ...DEFAULT_CONFIG, ...preset.config, seed: preset.seed });
}
