import { EventLog } from "../analytics/EventLog.js";
import { MetricsRecorder } from "../analytics/MetricsRecorder.js";
import { createRunSummary } from "../analytics/RunSummary.js";
import { Simulation } from "../simulation/Simulation.js";

export class ExperimentRunner {
  run({
    config,
    ticks,
    stopWhen = () => false,
    sampleInterval = 100,
    maxSamples = 10_000,
    maxEvents = 5_000,
  }) {
    const simulation = new Simulation(config);
    const recorder = new MetricsRecorder({ sampleInterval, maxSamples });
    const eventLog = new EventLog({ maxEvents });
    recorder.record(simulation, { force: true });
    while (simulation.tickCount < ticks && !stopWhen(simulation)) {
      simulation.tick();
      recorder.record(simulation);
      eventLog.capture(simulation.tickEvents);
    }
    return {
      simulation,
      metrics: simulation.getMetrics(),
      summary: createRunSummary(simulation),
      series: recorder.series.toJSON(),
      events: eventLog.toJSON(),
    };
  }

  runSeeds({ seeds, configForSeed, ...options }) {
    return seeds.map((seed) => this.run({ config: configForSeed(seed), ...options }));
  }
}
