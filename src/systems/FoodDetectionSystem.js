function squaredDistance(first, second) {
  const dx = first.x - second.x;
  const dy = first.y - second.y;
  return dx * dx + dy * dy;
}

export class FoodDetectionSystem {
  findNearest(ant, foodSources, detectionRadius) {
    let nearest = null;
    let nearestDistance = Infinity;

    for (const source of foodSources) {
      if (!source.active) continue;
      const reach = detectionRadius + source.radius;
      const distance = squaredDistance(ant.position, source.position);
      if (distance <= reach * reach && distance < nearestDistance) {
        nearest = source;
        nearestDistance = distance;
      }
    }
    return nearest;
  }
}
