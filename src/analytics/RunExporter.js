import { createRunSummary } from "./RunSummary.js";

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function runId(version, seed, duration, config) {
  const text = `${version}:${seed}:${duration}:${JSON.stringify(config)}`;
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0").toUpperCase();
}

export function createRunExport({ simulation, recorder, eventLog, version }) {
  const config = structuredClone(simulation.config);
  return {
    format: "formica-run",
    version,
    runId: runId(version, simulation.config.seed, simulation.tickCount, config),
    seed: simulation.config.seed,
    duration: simulation.tickCount,
    sampling: {
      interval: recorder.sampleInterval,
      maxSamples: recorder.series.maxSamples,
    },
    config,
    summary: createRunSummary(simulation),
    series: recorder.series.toJSON(),
    events: eventLog.toJSON(),
  };
}

export function seriesToCsv(samples) {
  if (samples.length === 0) return "";
  const headers = Object.keys(samples[0]);
  return [
    headers.join(","),
    ...samples.map((sample) => headers.map((key) => csvCell(sample[key])).join(",")),
  ].join("\n");
}

export function downloadText(filename, text, mimeType) {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
