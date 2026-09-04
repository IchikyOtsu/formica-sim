export class MovementSystem {
  update(ant, world, deltaSeconds, maxDistance = Infinity) {
    const distance = Math.min(ant.speed * deltaSeconds, maxDistance);
    const next = {
      x: ant.position.x + Math.cos(ant.direction) * distance,
      y: ant.position.y + Math.sin(ant.direction) * distance,
    };

    if (next.x < 3 || next.x > world.width - 3) {
      ant.direction = Math.PI - ant.direction;
      next.x = Math.max(3, Math.min(world.width - 3, next.x));
    }
    if (next.y < 3 || next.y > world.height - 3) {
      ant.direction = -ant.direction;
      next.y = Math.max(3, Math.min(world.height - 3, next.y));
    }

    ant.position = next;
    ant.age += deltaSeconds;
  }
}
