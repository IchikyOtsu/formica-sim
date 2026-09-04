import { Season } from "./Season.js";

export const SEASON_PROFILES = Object.freeze({
  [Season.SPRING]: Object.freeze({
    temperature: 18,
    foodRegenerationMultiplier: 1.6,
    metabolismMultiplier: 0.9,
    movementCostMultiplier: 0.9,
    broodDevelopmentMultiplier: 1.2,
    hazardMultiplier: 0.75,
    pressure: 0.25,
  }),
  [Season.SUMMER]: Object.freeze({
    temperature: 26,
    foodRegenerationMultiplier: 1.15,
    metabolismMultiplier: 0.95,
    movementCostMultiplier: 0.9,
    broodDevelopmentMultiplier: 1.1,
    hazardMultiplier: 1,
    pressure: 0.35,
  }),
  [Season.AUTUMN]: Object.freeze({
    temperature: 11,
    foodRegenerationMultiplier: 0.65,
    metabolismMultiplier: 1.05,
    movementCostMultiplier: 1.1,
    broodDevelopmentMultiplier: 0.8,
    hazardMultiplier: 1.1,
    pressure: 0.6,
  }),
  [Season.WINTER]: Object.freeze({
    temperature: 1,
    foodRegenerationMultiplier: 0.12,
    metabolismMultiplier: 1.45,
    movementCostMultiplier: 1.65,
    broodDevelopmentMultiplier: 0.4,
    hazardMultiplier: 1.35,
    pressure: 1,
  }),
});

export const STABLE_PROFILE = Object.freeze({
  temperature: 18,
  foodRegenerationMultiplier: 1,
  metabolismMultiplier: 1,
  movementCostMultiplier: 1,
  broodDevelopmentMultiplier: 1,
  hazardMultiplier: 1,
  pressure: 0,
});
