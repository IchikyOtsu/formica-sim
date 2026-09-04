import { AntState } from "../entities/Ant.js";

export class ForeignAntDetectionSystem {
  update(colonies, radius) {
    const living = colonies.flatMap((colony) => colony.ants.filter((ant) => ant.state !== AntState.DEAD));
    for (const ant of living) ant.nearbyForeignAnts = [];
    const contacts = [];
    const radiusSquared = radius * radius;
    const cellSize = Math.max(radius, 1);
    const buckets = new Map();
    for (let index = 0; index < living.length; index += 1) {
      const ant = living[index];
      const column = Math.floor(ant.position.x / cellSize);
      const row = Math.floor(ant.position.y / cellSize);
      const key = `${column}:${row}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(index);
    }
    for (let firstIndex = 0; firstIndex < living.length; firstIndex += 1) {
      const first = living[firstIndex];
      const column = Math.floor(first.position.x / cellSize);
      const row = Math.floor(first.position.y / cellSize);
      const candidates = [];
      for (let y = row - 1; y <= row + 1; y += 1) {
        for (let x = column - 1; x <= column + 1; x += 1) {
          candidates.push(...(buckets.get(`${x}:${y}`) ?? []));
        }
      }
      for (const secondIndex of candidates) {
        if (secondIndex <= firstIndex) continue;
        const second = living[secondIndex];
        if (first.colonyId === second.colonyId) continue;
        const dx = first.position.x - second.position.x;
        const dy = first.position.y - second.position.y;
        if (dx * dx + dy * dy > radiusSquared) continue;
        first.nearbyForeignAnts.push(second.id);
        second.nearbyForeignAnts.push(first.id);
        contacts.push({
          key: [first.colonyId, first.id, second.colonyId, second.id].join(":"),
          first,
          second,
        });
      }
    }
    return contacts;
  }
}
