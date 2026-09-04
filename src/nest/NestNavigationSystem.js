// Déplacement direct vers un point cible (une chambre, un chantier...) dans
// l'espace intérieur local de la colonie — jamais de pathfinding ici, une
// seule jambe de trajet à la fois. Le choix du chemin (quelle suite de
// points viser, via les corridors) est la responsabilité de
// `NestInterior.path()`, appelée par Simulation. Retourne true dès que
// l'objectif est atteint, et oriente `ant.direction` sur le déplacement réel
// (repris par le rendu pour faire tourner le sprite 2D).
export class NestNavigationSystem {
  moveToward(ant, targetPosition, speed, deltaSeconds, arrivalRadius) {
    const dx = targetPosition.x - ant.nestPosition.x;
    const dy = targetPosition.y - ant.nestPosition.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= arrivalRadius) return true;
    const angle = Math.atan2(dy, dx);
    ant.direction = angle;
    const step = Math.min(speed * deltaSeconds, distance);
    ant.nestPosition = {
      x: ant.nestPosition.x + Math.cos(angle) * step,
      y: ant.nestPosition.y + Math.sin(angle) * step,
    };
    return false;
  }
}
