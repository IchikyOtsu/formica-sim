import { NestChamberType } from "../nest/NestChamber.js";
import { AntState } from "../entities/Ant.js";
import { NestTask } from "../nest/NestTask.js";
import { drawAnt2D } from "./AntSprite.js";

const CHAMBER_LABELS = Object.freeze({
  [NestChamberType.ENTRANCE]: "Entrée",
  [NestChamberType.STORAGE]: "Stock",
  [NestChamberType.BROOD]: "Couvain",
  [NestChamberType.QUEEN]: "Reine",
  [NestChamberType.REST]: "Repos",
});

function chamberLabel(chamber) {
  return CHAMBER_LABELS[chamber.type] ?? chamber.type;
}

// Vue "intérieur du nid" : pas de zoom/pan manuel, un espace de coordonnées
// local recentré et mis à l'échelle dynamiquement sur la boîte englobante de
// toutes les chambres (+ chantiers en cours) — depuis V1.5.3 le nid peut
// grandir par construction dynamique, donc l'échelle fixe de V1.5.1/V1.5.2
// ne suffit plus. La reine et le couvain n'ont pas de position propre (ils
// ne se déplacent jamais) — ce renderer les place conceptuellement dans la
// chambre QUEEN/BROOD d'origine, une fois d'une seule variante ou la
// colonie en construit plusieurs.
export class NestRenderer {
  render(ctx, canvas, colony, interior, tickCount = 0, nestInteriorEnabled = true) {
    const width = canvas.width;
    const height = canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#181d14";
    ctx.fillRect(0, 0, width, height);

    const bounds = this.computeBounds(interior);
    const scale = Math.min(width / bounds.width, height / bounds.height);
    ctx.setTransform(scale, 0, 0, scale, width / 2 - bounds.centerX * scale, height / 2 - bounds.centerY * scale);

    this.drawCorridors(ctx, interior);
    for (const chamber of interior.chambers.values()) {
      this.drawChamber(ctx, chamber, colony);
    }
    this.drawConstructionSites(ctx, interior, colony);
    this.drawQueen(ctx, interior, colony);
    this.drawBrood(ctx, interior, colony);
    this.drawAnts(ctx, interior, colony, tickCount);

    if (!nestInteriorEnabled) this.drawDisabledNotice(ctx, width, height);
  }

  // La vue intérieure est toujours affichable (les cinq chambres existent
  // pour chaque colonie), mais tant que `nestInteriorEnabled` n'est pas
  // activé pour cette colonie, aucune fourmi n'y entrera jamais — sans ce
  // message, la pièce vide donne l'impression d'une fonctionnalité cassée.
  drawDisabledNotice(ctx, width, height) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "rgba(24, 29, 20, 0.72)";
    ctx.fillRect(0, height - 34, width, 34);
    ctx.fillStyle = "#e8c34a";
    ctx.font = "13px 'DM Mono', monospace";
    ctx.textAlign = "center";
    ctx.fillText(
      "Vue intérieure inactive pour cette colonie — coche « Vue intérieure du nid » dans les paramètres",
      width / 2,
      height - 13,
    );
  }

  computeBounds(interior) {
    const positions = [...interior.chambers.values()].map((chamber) => chamber.position)
      .concat([...interior.pendingSites.values()].map((site) => site.position));
    const padding = 40;
    const xs = positions.map((position) => position.x);
    const ys = positions.map((position) => position.y);
    const minX = Math.min(...xs) - padding;
    const maxX = Math.max(...xs) + padding;
    const minY = Math.min(...ys) - padding;
    const maxY = Math.max(...ys) + padding;
    return {
      width: Math.max(maxX - minX, 120),
      height: Math.max(maxY - minY, 120),
      centerX: (minX + maxX) / 2,
      centerY: (minY + maxY) / 2,
    };
  }

  drawCorridors(ctx, interior) {
    ctx.strokeStyle = "rgba(180, 200, 144, 0.25)";
    ctx.lineWidth = 1.4;
    for (const [fromId, toId] of interior.corridors) {
      const from = interior.getChamber(fromId).position;
      const to = interior.getChamber(toId).position;
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
    ctx.fillText(chamberLabel(chamber), 0, 22);
    ctx.restore();
  }

  drawConstructionSites(ctx, interior, colony) {
    for (const site of interior.pendingSites.values()) {
      ctx.save();
      ctx.translate(site.position.x, site.position.y);
      const ratio = Math.min(1, site.progress / site.requiredProgress);
      ctx.beginPath();
      ctx.setLineDash([2, 2]);
      ctx.ellipse(0, 0, 14, 10, 0, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(150, 210, 235, 0.55)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(0, -16, 3, -Math.PI / 2, -Math.PI / 2 + ratio * Math.PI * 2);
      ctx.strokeStyle = colony.color;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.fillStyle = "#8ac2d8";
      ctx.font = "6px 'DM Mono', monospace";
      ctx.textAlign = "center";
      ctx.fillText("chantier", 0, 22);
      ctx.restore();
    }
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

  drawAnts(ctx, interior, colony, tickCount) {
    for (const ant of colony.ants) {
      if (ant.locationType !== "NEST" || ant.state === AntState.DEAD || !ant.nestPosition) continue;
      const resting = ant.state === AntState.RESTING;
      const tending = ant.nestTask === NestTask.TEND_BROOD && ant.nestChamberId === NestChamberType.BROOD;
      const building = ant.nestTask === NestTask.BUILD;
      const carrying = ant.internalFoodCargo > 0 || ant.carryingFood || ant.raidCargo > 0;
      const phaseSeed = hashAntId(ant.id);
      drawAnt2D(ctx, {
        x: ant.nestPosition.x,
        y: ant.nestPosition.y,
        angle: ant.direction ?? 0,
        scale: 1.15,
        color: resting ? "#8fbf5a" : colony.color,
        caste: ant.caste,
        carrying,
        resting,
        tending,
        building,
        legPhase: tickCount * 0.35 + phaseSeed,
      });
    }
  }
}

function hashAntId(id) {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  return (hash % 1000) / 1000 * Math.PI * 2;
}
