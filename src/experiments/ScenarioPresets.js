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

export const SCENARIO_CATEGORIES = Object.freeze([
  { id: "competition", label: "Compétition & ressources" },
  { id: "reference-seasons", label: "Référence & saisons" },
  { id: "alarm", label: "Phéromones ALARM" },
  { id: "combat", label: "Combat (V1.2)" },
  { id: "castes", label: "Castes & soldats (V1.3)" },
]);

export const SCENARIO_PRESETS = Object.freeze([
  {
    id: "symmetric-competition",
    name: "Symétrique V1.1",
    description: "Deux colonies égales, nids opposés et ressources partagées.",
    category: "competition",
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
    category: "competition",
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
    category: "competition",
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
    category: "competition",
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
    category: "competition",
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
    category: "competition",
    seed: 53047,
    config: { colonies: colonies({ antsA: 65, antsB: 35, stockA: 6, stockB: 30 }) },
  },
  {
    id: "resource-scarcity",
    name: "Ressources rares",
    description: "Petites sources, peu de stock et forte compétition.",
    category: "competition",
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
    category: "competition",
    seed: 7919,
    config: {
      queenLayingCooldownTicks: 300,
      reproductionFoodThreshold: 8,
      maxBrood: 40,
      maxWorkers: 250,
      foodRegenerationRate: 0.008,
    },
  },
  {
    id: "reference-v1",
    name: "Référence V1.0",
    description: "Scénario officiel : 50 ouvrières, saisons modérées et ALARM équilibrée.",
    category: "reference-seasons",
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
    category: "reference-seasons",
    seed: 1847,
    config: { environmentEnabled: false, foodRegenerationRate: 0.004 },
  },
  {
    id: "moderate-seasons",
    name: "Saisons modérées",
    description: "Cycle écologique équilibré avec dangers ordinaires.",
    category: "reference-seasons",
    seed: 1847,
    config: { environmentEnabled: true, environmentSeverity: 1 },
  },
  {
    id: "hostile-winter",
    name: "Hiver hostile",
    description: "Régénération faible, coûts élevés et stock initial limité.",
    category: "reference-seasons",
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
    category: "alarm",
    seed: 1847,
    config: { alarmPheromonesEnabled: true, alarmInfluence: 1.2 },
  },
  {
    id: "persistent-alarm",
    name: "ALARM persistante",
    description: "Prudence excessive et barrières informationnelles.",
    category: "alarm",
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
    id: "balanced-combat-v1.2",
    name: "Combat équilibré V1.2",
    description: "Défensif contre Agressif, calibrage figé de référence pour le combat local.",
    category: "combat",
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
    id: "castes-v1.3",
    name: "Castes adaptatives V1.3",
    description: "Ambre (défensive, castes adaptatives) contre Azur (agressive figée) : les soldats apparaissent avec un délai après la montée de la menace, sans réglage manuel.",
    category: "castes",
    seed: 1847,
    duration: 15_000,
    config: {
      queenLayingCooldownTicks: 300,
      maxBrood: 20,
      colonies: [
        {
          ...colonies()[0],
          ...combatProfileOverrides("defensive"),
          castesEnabled: true,
          casteSoldierRatioCap: 0.35,
          threatPressureRatioScale: 150,
          casteStockThreshold: 30,
        },
        { ...colonies()[1], ...combatProfileOverrides("aggressive") },
      ],
      foodSources: [
        { id: "CENTER", x: 400, y: 260, quantity: 140, radius: 22 },
        { id: "WEST", x: 265, y: 120, quantity: 60, radius: 16 },
        { id: "EAST", x: 535, y: 400, quantity: 60, radius: 16 },
      ],
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
