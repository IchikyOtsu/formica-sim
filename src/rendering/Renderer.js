export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d");
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.round(rect.width * dpr);
    const height = Math.round(rect.height * dpr);
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  render(simulation) {
    this.resize();
    const ctx = this.context;
    const { world, colony, foodSources } = simulation;
    const scaleX = this.canvas.width / world.width;
    const scaleY = this.canvas.height / world.height;

    ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
    ctx.clearRect(0, 0, world.width, world.height);
    this.drawGrid(ctx, world);

    for (const source of foodSources) {
      if (source.active) this.drawFood(ctx, source);
    }
    this.drawNest(ctx, colony.nest);
    for (const ant of colony.ants) this.drawAnt(ctx, ant);
  }

  drawGrid(ctx, world) {
    ctx.fillStyle = "#20271b";
    ctx.fillRect(0, 0, world.width, world.height);
    ctx.strokeStyle = "rgba(180, 200, 144, 0.075)";
    ctx.lineWidth = 1;
    for (let x = 20; x < world.width; x += 20) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, world.height); ctx.stroke();
    }
    for (let y = 20; y < world.height; y += 20) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(world.width, y); ctx.stroke();
    }
    ctx.strokeStyle = "rgba(219, 231, 192, 0.2)";
    ctx.strokeRect(0.5, 0.5, world.width - 1, world.height - 1);
  }

  drawNest(ctx, nest) {
    const { x, y } = nest.position;
    const gradient = ctx.createRadialGradient(x - 7, y - 8, 3, x, y, nest.radius);
    gradient.addColorStop(0, "#9d7048");
    gradient.addColorStop(1, "#4e3526");
    ctx.fillStyle = gradient;
    ctx.beginPath(); ctx.arc(x, y, nest.radius, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(239, 180, 95, 0.45)";
    ctx.setLineDash([3, 5]); ctx.beginPath(); ctx.arc(x, y, nest.radius + 8, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = "#241a14";
    ctx.beginPath(); ctx.ellipse(x + 1, y + 2, 10, 7, -0.2, 0, Math.PI * 2); ctx.fill();
  }

  drawFood(ctx, source) {
    const { x, y } = source.position;
    ctx.fillStyle = "rgba(164, 195, 100, 0.11)";
    ctx.beginPath(); ctx.arc(x, y, source.radius + 11, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#a4c364";
    const seeds = [[-5, -3], [5, -4], [-2, 5], [7, 5], [1, -9]];
    const visibleSeeds = Math.max(1, Math.ceil((source.quantity / source.initialQuantity) * seeds.length));
    for (const [offsetX, offsetY] of seeds.slice(0, visibleSeeds)) {
      ctx.beginPath(); ctx.arc(x + offsetX, y + offsetY, 4, 0, Math.PI * 2); ctx.fill();
    }
  }

  drawAnt(ctx, ant) {
    ctx.save();
    ctx.translate(ant.position.x, ant.position.y);
    ctx.rotate(ant.direction);
    ctx.strokeStyle = "rgba(240, 180, 95, 0.66)";
    ctx.lineWidth = 0.8;
    for (const side of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(-1, side); ctx.lineTo(-5, side * 4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(1, side); ctx.lineTo(4, side * 4); ctx.stroke();
    }
    if (ant.carryingFood) {
      ctx.fillStyle = "rgba(164, 195, 100, 0.18)";
      ctx.beginPath(); ctx.arc(-3, 0, 6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = ant.carryingFood ? "#d8cb78" : "#f0b45f";
    ctx.beginPath(); ctx.ellipse(-2.5, 0, 3, 2.2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(2.5, 0, 1.9, 0, Math.PI * 2); ctx.fill();
    if (ant.carryingFood) {
      ctx.fillStyle = "#a4c364";
      ctx.beginPath(); ctx.arc(-5.5, 0, 1.8, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
}
