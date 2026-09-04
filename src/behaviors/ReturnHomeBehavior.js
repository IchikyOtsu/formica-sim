export class ReturnHomeBehavior {
  update(ant, nest) {
    const dx = nest.position.x - ant.position.x;
    const dy = nest.position.y - ant.position.y;
    ant.target = nest;
    ant.direction = Math.atan2(dy, dx);
    return Math.hypot(dx, dy);
  }
}
