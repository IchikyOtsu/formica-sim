import { NestChamberType } from "../nest/NestChamber.js";
import { AntState } from "../entities/Ant.js";
import { NestTask } from "../nest/NestTask.js";

const CHAMBER_LABELS = Object.freeze({
  [NestChamberType.ENTRANCE]: "Entrée",
  [NestChamberType.STORAGE]: "Stock",
  [NestChamberType.BROOD]: "Couvain",
  [NestChamberType.QUEEN]: "Reine",
  [NestChamberType.REST]: "Repos",
});

// Vue "intérieur du nid" : pas de zoom/pan, un espace de coordonnées local
// fixe (indépendant du monde), recentré et mis à l'échelle pour remplir le
// canvas. La reine et le couvain n'ont pas de position propre (ils ne se
// déplacent jamais) — ce renderer les place conceptuellement dans leur
// chambre dédiée (QUEEN / BROOD) pour la lecture visuelle.
export class NestRenderer {
  render(ctx, canvas, colony, interior) {
    const width = canvas.width;
    const height = canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#181d14";
    ctx.fillRect(0, 0, width, height);

    const scale = Math.min(width, height) / 220;
    ctx.setTransform(scale, 0, 0, scale, width / 2, height / 2);

    this.drawCorridors(ctx, interior);
    for (const chamber of interior.chambers.values()) {
      this.drawChamber(ctx, chamber, colony);
    }
    this.drawQueen(ctx, interior, colony);
    this.drawBrood(ctx, interior, colony);
    this.drawAnts(ctx, interior, colony);
  }

  drawCorridors(ctx, interior) {
    ctx.strokeStyle = "rgba(180, 200, 144, 0.25)";
    ctx.lineWidth = 1.4;
    for (const [fromType, toType] of interior.corridors) {
      const from = interior.getChamber(fromType).position;
      const to = interior.getChamber(toType).position;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    }
  }

  drawChamber(ctx, chamber, colony) {
    ctx.save();
    ctx.translate(chamber.position.x, chamber.position.y);
    ctx.beginPath();
    ctx.ellipse(0, 0, 16, 12, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(32, 37, 29, 0.9)";
    ctx.fill();
    ctx.strokeStyle = colony.color;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.fillStyle = "#c8d0ba";
    ctx.font = "6px 'DM Mono', monospace";
    ctx.textAlign = "center";
    ctx.fillText(CHAMBER_LABELS[chamber.type] ?? chamber.type, 0, 22);
    ctx.restore();
  }

  drawQueen(ctx, interior, colony) {
    if (!colony.queen) return;
    const chamber = interior.getChamber(NestChamberType.QUEEN);
    ctx.save();
    ctx.translate(chamber.position.x, chamber.position.y);
    ctx.beginPath();
    ctx.ellipse(0, 0, 4.5, 3, 0, 0, Math.PI * 2);
    ctx.fillStyle = colony.color;
    ctx.fill();
    ctx.strokeStyle = "rgba(20, 16, 12, 0.85)";
    ctx.lineWidth = 0.6;
    ctx.stroke();
    ctx.restore();
  }

  drawBrood(ctx, interior, colony) {
    if (!colony.brood || colony.brood.length === 0) return;
    const chamber = interior.getChamber(NestChamberType.BROOD);
    ctx.save();
    ctx.translate(chamber.position.x, chamber.position.y);
    ctx.fillStyle = "rgba(232, 195, 74, 0.9)";
    const shown = Math.min(colony.brood.length, 8);
    for (let index = 0; index < shown; index += 1) {
      const angle = (index / shown) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(Math.cos(angle) * 6, Math.sin(angle) * 4, 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawAnts(ctx, interior, colony) {
    for (const ant of colony.ants) {
      if (ant.locationType !== "NEST" || ant.state === AntState.DEAD || !ant.nestPosition) continue;
      ctx.save();
      ctx.translate(ant.nestPosition.x, ant.nestPosition.y);
      if (ant.nestTask === NestTask.TEND_BROOD && ant.nestChamberId === NestChamberType.BROOD) {
        ctx.beginPath();
        ctx.arc(0, 0, 3, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(232, 195, 74, 0.55)";
        ctx.lineWidth = 0.7;
        ctx.stroke();
      }
      if (ant.internalFoodCargo > 0) {
        ctx.fillStyle = "rgba(232, 195, 74, 0.85)";
        ctx.beginPath(); ctx.arc(-1.6, 0, 0.7, 0, Math.PI * 2); ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(0, 0, ant.state === AntState.RESTING ? 1.6 : 1.2, 0, Math.PI * 2);
      ctx.fillStyle = ant.state === AntState.RESTING ? "#8fbf5a" : colony.color;
      ctx.fill();
      ctx.restore();
    }
  }
}
