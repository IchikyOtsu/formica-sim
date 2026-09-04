export class ReplayController {
  constructor(simulation, { onTick = () => {} } = {}) {
    this.simulation = simulation;
    this.onTick = onTick;
    this.generation = 0;
  }

  cancel() {
    this.generation += 1;
  }

  async seek(targetTick, { chunkSize = 1_000, onProgress = () => {} } = {}) {
    const target = Number.isFinite(targetTick) ? Math.max(0, Math.floor(targetTick)) : 0;
    const generation = ++this.generation;
    this.simulation.reset();
    onProgress(0, target);
    while (this.simulation.tickCount < target) {
      const end = Math.min(target, this.simulation.tickCount + chunkSize);
      while (this.simulation.tickCount < end) {
        this.simulation.tick();
        this.onTick(this.simulation);
      }
      onProgress(this.simulation.tickCount, target);
      await new Promise((resolve) => requestAnimationFrame(resolve));
      if (generation !== this.generation) return false;
    }
    return true;
  }
}
