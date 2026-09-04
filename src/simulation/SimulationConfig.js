export const DEFAULT_CONFIG = Object.freeze({
  width: 800,
  height: 520,
  tickDurationMs: 100,
  initialAnts: 50,
  antSpeed: 14,
  antEnergy: 100,
  foodDetectionRadius: 46,
  foodPickupDistance: 3,
  nest: { x: 135, y: 365, radius: 28 },
  foodSources: [
    { x: 625, y: 125, quantity: 100, radius: 20 },
    { x: 515, y: 345, quantity: 80, radius: 17 },
    { x: 300, y: 135, quantity: 60, radius: 15 },
  ],
  seed: 1847,
});
