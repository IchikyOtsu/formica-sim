import { AntState } from "../entities/Ant.js";
import { NestChamberType } from "./NestChamber.js";

// Gère strictement WORLD <-> NEST. Ne décide jamais d'une tâche intérieure —
// ça reste la responsabilité de Simulation.assignNestTask.
export class NestTransitionSystem {
  // Choisit l'entrée la moins chargée (V1.5.4 : plusieurs ENTRANCE possibles
  // une fois creusées ; une seule au départ, donc comportement inchangé
  // tant qu'aucune n'a été construite).
  enter(ant, colony, interior) {
    const entrance = interior.leastLoadedChamberOfType(NestChamberType.ENTRANCE);
    interior.moveAntToChamber(ant, entrance.id);
    ant.locationType = "NEST";
    ant.nestId = colony.id;
    ant.nestTask = "NONE";
    ant.state = AntState.IN_NEST;
  }

  exit(ant, colony, interior, colonyConfig, randomFn) {
    // l'entrée d'origine garde une sortie dispersée aléatoirement (V1.5.1,
    // comportement inchangé) ; une entrée creusée dynamiquement a un angle
    // de sortie fixe (exitAngle), lui donnant une position extérieure stable.
    const usedEntrance = interior.chambers.get(ant.nestChamberId);
    const fixedAngle = usedEntrance?.exitAngle;
    interior.removeAnt(ant);
    ant.locationType = "WORLD";
    ant.nestId = null;
    ant.nestPosition = null;
    ant.nestChamberId = null;
    ant.nestTask = "NONE";
    ant.nestPath = null;
    ant.nestPathIndex = 0;
    ant.nestTargetChamberId = null;
    ant.nestBuildSiteId = null;
    ant.nestTransitionCooldown = colonyConfig.nestTransitionCooldownTicks;
    const angle = fixedAngle ?? randomFn() * Math.PI * 2;
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
