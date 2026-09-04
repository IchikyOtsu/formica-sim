import { Caste } from "./Ant.js";

export const BroodStage = Object.freeze({
  EGG: "EGG",
  LARVA: "LARVA",
  PUPA: "PUPA",
});

export class Brood {
  constructor({ id, caste = Caste.WORKER }) {
    this.id = id;
    this.age = 0;
    this.stageAge = 0;
    this.stage = BroodStage.EGG;
    this.developmentProgress = 0;
    this.foodConsumed = 0;
    this.caste = caste;
  }
}
