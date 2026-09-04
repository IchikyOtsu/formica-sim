import { DEFAULT_CONFIG } from "../simulation/SimulationConfig.js";
import { combatProfileOverrides } from "./CombatProfiles.js";

function colonies({ antsA = 50, antsB = 50, stockA = 10, stockB = 10 } = {}) {
  return [
    {
      id: "A",
      name: "Colonie Ambre",
      color: "#f0b45f",
      nest: { x: 105, y: 260, radius: 28 },
      initialAnts: antsA,
      initialFoodStock: stockA,
    },
    {
      id: "B",
      name: "Colonie Azur",
      color: "#65a9d8",
      nest: { x: 695, y: 260, radius: 28 },
      initialAnts: antsB,
      initialFoodStock: stockB,
    },
  ];
}

function combatColonies(profileA, profileB) {
  const [colonyA, colonyB] = colonies();
  return [
    { ...colonyA, ...combatProfileOverrides(profileA) },
    { ...colonyB, ...combatProfileOverrides(profileB) },
  ];
}

export const SCENARIO_PRESETS = Object.freeze([
  {
    id: "symmetric-competition",
    name: "Symétrique V1.1",
    description: "Deux colonies égales, nids opposés et ressources partagées.",
    seed: 1847,
    duration: 50_000,
    config: {
      colonies: colonies(),
      foodSources: [
        { id: "CENTER", x: 400, y: 260, quantity: 140, radius: 22 },
        { id: "WEST", x: 265, y: 120, quantity: 60, radius: 16 },
        { id: "EAST", x: 535, y: 400, quantity: 60, radius: 16 },
      ],
      dangerZones: [],
    },
  },
  {
    id: "near-resources",
    name: "Ressources proches",
    description: "Chaque colonie dispose d'une source proche et partage le centre.",
    seed: 12011,
    config: {
      colonies: colonies(),
      environmentEnabled: false,
      foodSources: [
        { x: 205, y: 260, quantity: 70, radius: 18 },
        { x: 595, y: 260, quantity: 70, radius: 18 },
        { x: 400, y: 260, quantity: 120, radius: 22 },
      ],
    },
  },
  {
    id: "far-resources",
    name: "Ressources lointaines",
    description: "Les ressources se trouvent loin des deux nids.",
    seed: 23819,
    config: {
      colonies: colonies(),
      environmentEnabled: false,
      foodSources: [
        { x: 400, y: 80, quantity: 100, radius: 20 },
        { x: 400, y: 440, quantity: 100, radius: 20 },
      ],
    },
  },
  {
    id: "central-rich-source",
    name: "Source centrale riche",
    description: "Une source centrale concentre la compétition spatiale.",
    seed: 31013,
    config: {
      colonies: colonies(),
      environmentEnabled: false,
      foodSources: [{ x: 400, y: 260, quantity: 500, radius: 28 }],
    },
  },
  {
    id: "competition-scarcity",
    name: "Rareté compétitive",
    description: "Peu de nourriture et deux populations identiques.",
    seed: 41017,
    config: {
      colonies: colonies({ stockA: 3, stockB: 3 }),
      foodMinQuantity: 8,
      foodMaxQuantity: 22,
      foodSpawnProbability: 0.0007,
      initialFoodStock: 3,
    },
  },
  {
    id: "asymmetric-colonies",
    name: "Colonies asymétriques",
    description: "Ambre commence plus nombreuse, Azur avec davantage de réserves.",
    seed: 53047,
    config: { colonies: colonies({ antsA: 65, antsB: 35, stockA: 6, stockB: 30 }) },
  },
  {
    id: "balanced-combat-v1.2",
    name: "Combat équilibré V1.2",
    description: "Défensif contre Agressif, calibrage figé de référence pour le combat local.",
    seed: 1847,
    duration: 20_000,
    config: {
      colonies: combatColonies("defensive", "aggressive"),
      foodSources: [
        { id: "CENTER", x: 400, y: 260, quantity: 140, radius: 22 },
        { id: "WEST", x: 265, y: 120, quantity: 60, radius: 16 },
        { id: "EAST", x: 535, y: 400, quantity: 60, radius: 16 },
      ],
    },
  },
  {
    id: "reference-v1",
    name: "Référence V1.0",
    description: "Scénario officiel : 50 ouvrières, saisons modérées et ALARM équilibrée.",
    seed: 1847,
    duration: 50_000,
    config: {
      initialAnts: 50,
      reproductionEnabled: true,
      environmentEnabled: true,
      environmentSeverity: 1,
      alarmPheromonesEnabled: true,
      alarmInfluence: 1.2,
    },
  },
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

export function presetById(id) {
  return SCENARIO_PRESETS.find((candidate) => candidate.id === id) ?? null;
}
