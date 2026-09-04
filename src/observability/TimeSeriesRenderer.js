const COLORS = Object.freeze({
  population: "#efb35e",
  foodStock: "#a7c66b",
  averageEnergy: "#79a8c8",
  deaths: "#d86d58",
});

export class TimeSeriesRenderer {
  constructor(canvas, key) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d");
    this.key = key;
  }

  render(samples) {
    if (!this.context) return;
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
    const ctx = this.context;
    const width = this.canvas.width;
    const height = this.canvas.height;
    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = "rgba(210, 220, 190, 0.12)";
    ctx.beginPath();
    ctx.moveTo(0, height - 1);
    ctx.lineTo(width, height - 1);
    ctx.stroke();
    if (samples.length < 2) return;

    const values = samples.map((sample) => sample[this.key]);
    const minimum = Math.min(...values);
    const maximum = Math.max(...values);
    const range = maximum - minimum || 1;
    ctx.strokeStyle = COLORS[this.key] ?? "#e7eadf";
    ctx.lineWidth = Math.max(1, dpr);
    ctx.beginPath();
    samples.forEach((sample, index) => {
      const x = index / (samples.length - 1) * width;
      const y = height - 4 * dpr - (sample[this.key] - minimum) / range * (height - 8 * dpr);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.fillStyle = "#8d9582";
    ctx.font = `${8 * dpr}px DM Mono`;
    ctx.fillText(maximum.toFixed(1), 4 * dpr, 10 * dpr);
    ctx.fillText(minimum.toFixed(1), 4 * dpr, height - 5 * dpr);
  }
}
