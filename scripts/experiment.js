const experiment = process.argv[2];
const scripts = {
  alarm: "./alarm-benchmark.js",
  environment: "./environment-benchmark.js",
  demography: "./demography-benchmark.js",
  survival: "./ecology-benchmark.js",
  pheromones: "./benchmark.js",
};

if (!scripts[experiment]) {
  console.error(`Expérience inconnue: ${experiment ?? "(absente)"}`);
  console.error(`Choix: ${Object.keys(scripts).join(", ")}`);
  process.exitCode = 1;
} else {
  await import(scripts[experiment]);
}
