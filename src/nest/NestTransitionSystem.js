import { AntState } from "../entities/Ant.js";
import { NestChamberType } from "./NestChamber.js";

// Gère strictement WORLD <-> NEST. Ne décide jamais d'une tâche intérieure —
// ça reste la responsabilité de Simulation.assignNestTask.
export class NestTransitionSystem {
  enter(ant, colony, interior) {
    interior.moveAntToChamber(ant, NestChamberType.ENTRANCE);
    ant.locationType = "NEST";
    ant.nestId = colony.id;
    ant.nestTask = "NONE";
    ant.state = AntState.IN_NEST;
  }

  exit(ant, colony, interior, colonyConfig, randomFn) {
    interior.removeAnt(ant);
    ant.locationType = "WORLD";
    ant.nestId = null;
    ant.nestPosition = null;
    ant.nestChamberId = null;
    ant.nestTask = "NONE";
    ant.nestTransitionCooldown = colonyConfig.nestTransitionCooldownTicks;
    const angle = randomFn() * Math.PI * 2;
    const offset = colony.nest.radius * 0.6;
    ant.position = {
      x: colony.nest.position.x + Math.cos(angle) * offset,
      y: colony.nest.position.y + Math.sin(angle) * offset,
    };
    ant.direction = angle;
    ant.distanceSinceNest = 0;
    ant.recentCells = [];
    ant.state = AntState.SEARCHING_FOOD;
  }
}
