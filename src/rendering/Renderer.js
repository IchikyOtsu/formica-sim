import { PheromoneType } from "../simulation/PheromoneField.js";
import { AntState, Caste } from "../entities/Ant.js";
import { BroodStage } from "../entities/Brood.js";
import { TerritoryState } from "../simulation/TerritoryMap.js";

function colorToRgb(color) {
  const match = /^#([0-9a-f]{6})$/i.exec(color);
  if (!match) return [240, 180, 95];
  const value = Number.parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d");
    this.pheromoneMode = "BOTH";
    this.territoryMode = "COLONIES";
  }

  setPheromonesVisible(visible) {
    this.pheromoneMode = visible ? "BOTH" : "OFF";
  }

  setPheromoneMode(mode) {
    if (!["BOTH", "FOOD", "HOME", "ALARM", "OFF"].includes(mode)) {
      throw new Error(`Unknown pheromone display mode: ${mode}`);
    }
    this.pheromoneMode = mode;
  }

  setTerritoryMode(mode) {
    if (!["COLONIES", "INFLUENCE", "CONTESTED", "OFF"].includes(mode)) {
      throw new Error(`Unknown territory display mode: ${mode}`);
    }
    this.territoryMode = mode;
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
    const { world, colonies, foodSources, dangerZones } = simulation;
    const scaleX = this.canvas.width / world.width;
    const scaleY = this.canvas.height / world.height;

    ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
    ctx.clearRect(0, 0, world.width, world.height);
    this.drawGrid(ctx, world);
    if (this.territoryMode !== "OFF") {
      this.drawTerritories(ctx, simulation.territoryMap, colonies, this.territoryMode);
    }
    for (const zone of dangerZones) this.drawDangerZone(ctx, zone);
    if (this.pheromoneMode !== "OFF") {
      for (const colony of colonies) {
        this.drawPheromones(ctx, simulation.colonyPheromones.get(colony.id), colony.color);
      }
    }

    for (const source of foodSources) {
      if (source.active) this.drawFood(ctx, source);
    }
    for (const colony of colonies) {
      this.drawNest(ctx, colony.nest, colony.color);
      this.drawQueenAndBrood(ctx, colony);
      for (const ant of colony.ants) this.drawAnt(ctx, ant, colony.color);
    }
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

  drawPheromones(ctx, field, colonyColor = "#f0b45f") {
    const colonyRgb = colorToRgb(colonyColor);
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    if (this.pheromoneMode === "BOTH" || this.pheromoneMode === "HOME") {
      this.drawPheromoneLayer(ctx, field, PheromoneType.HOME, colonyRgb);
    }
    if (this.pheromoneMode === "BOTH" || this.pheromoneMode === "FOOD") {
      this.drawPheromoneLayer(ctx, field, PheromoneType.FOOD, colonyRgb);
    }
    if (this.pheromoneMode === "BOTH" || this.pheromoneMode === "ALARM") {
      this.drawPheromoneLayer(ctx, field, PheromoneType.ALARM, [234, 76, 132]);
    }
    ctx.restore();
  }

  drawTerritories(ctx, territory, colonies, mode) {
    const colors = new Map(colonies.map((colony) => [colony.id, colorToRgb(colony.color)]));
    ctx.save();
    for (let index = 0; index < territory.cells.length; index += 1) {
      const owner = territory.cells[index];
      const column = index % territory.columns;
      const row = Math.floor(index / territory.columns);
      let color = null;
      let alpha = 0;
      if (owner === TerritoryState.CONTESTED) {
        if (mode === "COLONIES" || mode === "CONTESTED") {
          color = [224, 102, 190];
          alpha = 0.24;
        }
      } else if (owner !== TerritoryState.NEUTRAL && mode !== "CONTESTED") {
        color = colors.get(owner);
        if (mode === "INFLUENCE") {
          const influence = territory.influences.get(owner)?.[index] ?? 0;
          alpha = Math.min(0.28, Math.sqrt(influence / 80) * 0.3);
        } else {
          alpha = 0.12;
        }
      }
      if (!color || alpha <= 0) continue;
      ctx.fillStyle = `rgba(${color.join(", ")}, ${alpha})`;
      ctx.fillRect(
        column * territory.cellSize,
        row * territory.cellSize,
        territory.cellSize,
        territory.cellSize,
      );
    }
    ctx.restore();
  }

  drawDangerZone(ctx, zone) {
    const { x, y } = zone.position;
    const gradient = ctx.createRadialGradient(x, y, 4, x, y, zone.radius);
    gradient.addColorStop(0, "rgba(190, 74, 54, 0.22)");
    gradient.addColorStop(1, "rgba(190, 74, 54, 0.04)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, zone.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(224, 107, 78, 0.46)";
    ctx.setLineDash([5, 6]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  drawPheromoneLayer(ctx, field, type, color) {
    const values = field.layer(type);
    for (let row = 0; row < field.rows; row += 1) {
      for (let column = 0; column < field.columns; column += 1) {
        const intensity = values[row * field.columns + column];
        if (intensity <= 0) continue;
        const alpha = Math.min(0.46, Math.sqrt(intensity / field.maxIntensity) * 0.48);
        ctx.fillStyle = `rgba(${color.join(", ")}, ${alpha})`;
        ctx.fillRect(
          column * field.cellSize,
          row * field.cellSize,
          field.cellSize,
          field.cellSize,
        );
      }
    }
  }

  drawNest(ctx, nest, color = "#f0b45f") {
    const { x, y } = nest.position;
    const gradient = ctx.createRadialGradient(x - 7, y - 8, 3, x, y, nest.radius);
    gradient.addColorStop(0, color);
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

  drawQueenAndBrood(ctx, colony) {
    const { x, y } = colony.nest.position;
    const stageColors = {
      [BroodStage.EGG]: "#eee4c9",
      [BroodStage.LARVA]: "#d8bd8d",
      [BroodStage.PUPA]: "#a9825f",
    };
    colony.brood.forEach((brood, index) => {
      const angle = index * 2.4;
      const ring = 12 + (index % 3) * 4;
      ctx.fillStyle = stageColors[brood.stage];
      ctx.beginPath();
      ctx.ellipse(
        x + Math.cos(angle) * ring,
        y + Math.sin(angle) * ring,
        2.2,
        1.5,
        angle,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    });

    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = colony.color;
    ctx.beginPath(); ctx.ellipse(0, 0, 7, 4, -0.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#3a281b";
    ctx.beginPath(); ctx.arc(5, -1, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = colony.color;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-3, -5); ctx.lineTo(-1, -8); ctx.lineTo(1, -5); ctx.lineTo(3, -8); ctx.lineTo(5, -5); ctx.stroke();
    ctx.restore();
  }

  drawAnt(ctx, ant, colonyColor = "#f0b45f") {
    ctx.save();
    ctx.translate(ant.position.x, ant.position.y);
    if (ant.state === AntState.DEAD) {
      ctx.strokeStyle = "rgba(135, 130, 120, 0.72)";
      ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.moveTo(-3, -2); ctx.lineTo(3, 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-3, 2); ctx.lineTo(3, -2); ctx.stroke();
      ctx.restore();
      return;
    }
    const isSoldier = ant.caste === Caste.SOLDIER;
    const scale = isSoldier ? 1.25 : 1;
    ctx.rotate(ant.direction);
    const colonyRgb = colorToRgb(colonyColor);
    ctx.strokeStyle = `rgba(${colonyRgb.join(", ")}, 0.66)`;
    ctx.lineWidth = isSoldier ? 1.1 : 0.8;
    for (const side of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(-1 * scale, side * scale); ctx.lineTo(-5 * scale, side * 4 * scale); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(1 * scale, side * scale); ctx.lineTo(4 * scale, side * 4 * scale); ctx.stroke();
    }
    if (ant.carryingFood) {
      ctx.fillStyle = "rgba(164, 195, 100, 0.18)";
      ctx.beginPath(); ctx.arc(-3, 0, 6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = ant.state === AntState.RESTING
      ? "#79a8c8"
      : ant.carryingFood ? "#d8cb78" : colonyColor;
    ctx.beginPath(); ctx.ellipse(-2.5 * scale, 0, 3 * scale, 2.2 * scale, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(2.5 * scale, 0, 1.9 * scale, 0, Math.PI * 2); ctx.fill();
    if (isSoldier) {
      // Marque martiale : liseré sombre sur le thorax, pour distinguer un
      // soldat d'une ouvrière au premier coup d'œil.
      ctx.strokeStyle = "rgba(60, 20, 20, 0.85)";
      ctx.lineWidth = 0.9;
      ctx.beginPath(); ctx.ellipse(-2.5 * scale, 0, 3 * scale, 2.2 * scale, 0, 0, Math.PI * 2); ctx.stroke();
    }
    if (ant.carryingFood) {
      ctx.fillStyle = "#a4c364";
      ctx.beginPath(); ctx.arc(-5.5, 0, 1.8, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    if (ant.health < ant.maxHealth) this.drawHealthBar(ctx, ant);
  }

  drawHealthBar(ctx, ant) {
    const ratio = Math.max(0, ant.health / ant.maxHealth);
    const width = 7;
    const x = ant.position.x - width / 2;
    const y = ant.position.y - 7;
    ctx.save();
    ctx.fillStyle = "rgba(20, 16, 12, 0.75)";
    ctx.fillRect(x, y, width, 1.6);
    ctx.fillStyle = ratio > 0.5 ? "#8fbf5a" : ratio > 0.25 ? "#d9a441" : "#c0453f";
    ctx.fillRect(x, y, width * ratio, 1.6);
    ctx.restore();
  }
}
