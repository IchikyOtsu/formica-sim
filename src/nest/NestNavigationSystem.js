// Pas de pathfinding : chaque chambre a une position dans l'espace
// intérieur local de la colonie, le déplacement est une ligne directe vers
// la chambre visée. Retourne true dès que l'objectif est atteint.
export class NestNavigationSystem {
  moveToward(ant, targetPosition, speed, deltaSeconds, arrivalRadius) {
    const dx = targetPosition.x - ant.nestPosition.x;
    const dy = targetPosition.y - ant.nestPosition.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= arrivalRadius) return true;
    const step = Math.min(speed * deltaSeconds, distance);
    const angle = Math.atan2(dy, dx);
    ant.nestPosition = {
      x: ant.nestPosition.x + Math.cos(angle) * step,
      y: ant.nestPosition.y + Math.sin(angle) * step,
    };
    return false;
  }
}
