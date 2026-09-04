import { OverlayType } from "../systems/TacticalOverlaySystem.js";

// V1.4.Web.1 : dessine les marqueurs produits par TacticalOverlaySystem.
// Chaque overlay porte déjà sa position monde ; ce renderer ne fait que le
// tracé, sur le ctx déjà mis à l'échelle par Renderer.render().
export class MapMarkerRenderer {
  render(ctx, overlays, colonyColors) {
    for (const overlay of overlays) {
      const color = colonyColors.get(overlay.colonyId) ?? "#f0d080";
      switch (overlay.type) {
        case OverlayType.RAID_ROUTE:
          this.drawRaidRoute(ctx, overlay, color);
          break;
        case OverlayType.RAID_GROUP:
          this.drawRaidGroup(ctx, overlay, color);
          break;
        case OverlayType.ENEMY_NEST_KNOWN:
          this.drawKnownNest(ctx, overlay, color);
          break;
        case OverlayType.LOOT_CARRIED:
          this.drawLoot(ctx, overlay);
          break;
        case OverlayType.NEST_UNDER_THREAT:
          this.drawNestUnderThreat(ctx, overlay);
          break;
        case OverlayType.ALARM_ALERT:
          this.drawAlarmAlert(ctx, overlay);
          break;
        case OverlayType.COMBAT:
          this.drawCombat(ctx, overlay);
          break;
        case OverlayType.COMBAT_DEATH:
          this.drawCombatDeath(ctx, overlay);
          break;
        default:
          break;
      }
    }
  }

  drawRaidRoute(ctx, overlay, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 1.3;
    // Trait plus serré au retour, plus large à l'aller : lisible sans texte.
    ctx.setLineDash(overlay.payload.state === "RETURNING" ? [2, 3] : [6, 4]);
    ctx.beginPath();
    ctx.moveTo(overlay.x, overlay.y);
    ctx.lineTo(overlay.targetX, overlay.targetY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  drawRaidGroup(ctx, overlay, color) {
    ctx.save();
    ctx.translate(overlay.x, overlay.y - 11);
    ctx.fillStyle = color;
    ctx.strokeStyle = "rgba(20, 16, 12, 0.85)";
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(0, -5.5);
    ctx.lineTo(4.5, 4);
    ctx.lineTo(-4.5, 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  drawKnownNest(ctx, overlay, color) {
    ctx.save();
    ctx.translate(overlay.x, overlay.y - 36);
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.ellipse(0, 0, 5.5, 3.2, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 1.5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  }

  drawLoot(ctx, overlay) {
    ctx.save();
    ctx.translate(overlay.x, overlay.y - 9);
    ctx.fillStyle = "#e8c34a";
    ctx.strokeStyle = "rgba(60, 45, 10, 0.85)";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.arc(0, 0, 2.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  drawNestUnderThreat(ctx, overlay) {
    ctx.save();
    ctx.translate(overlay.x, overlay.y);
    // anneau d'alerte autour du nid
    ctx.strokeStyle = "rgba(224, 90, 60, 0.85)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, overlay.payload.radius + 6, 0, Math.PI * 2);
    ctx.stroke();
    // bouclier simplifié au-dessus du nid
    ctx.translate(0, -(overlay.payload.radius + 20));
    ctx.fillStyle = "#e05a3c";
    ctx.strokeStyle = "rgba(40, 10, 8, 0.85)";
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(0, -5);
    ctx.lineTo(4, -2.5);
    ctx.lineTo(4, 2.5);
    ctx.lineTo(0, 5.5);
    ctx.lineTo(-4, 2.5);
    ctx.lineTo(-4, -2.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  drawAlarmAlert(ctx, overlay) {
    ctx.save();
    ctx.translate(overlay.x, overlay.y - 46);
    ctx.globalAlpha = Math.min(1, 0.5 + overlay.payload.intensity * 0.5);
    ctx.fillStyle = "#e8c34a";
    ctx.strokeStyle = "rgba(50, 35, 5, 0.85)";
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(0, -5);
    ctx.lineTo(4.5, 4.5);
    ctx.lineTo(-4.5, 4.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(50, 35, 5, 0.9)";
    ctx.fillRect(-0.5, -2.2, 1, 3.2);
    ctx.beginPath();
    ctx.arc(0, 2.4, 0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawCombat(ctx, overlay) {
    ctx.save();
    ctx.translate(overlay.x, overlay.y);
    ctx.strokeStyle = "rgba(240, 220, 180, 0.9)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-4, -4);
    ctx.lineTo(4, 4);
    ctx.moveTo(4, -4);
    ctx.lineTo(-4, 4);
    ctx.stroke();
    ctx.restore();
  }

  drawCombatDeath(ctx, overlay) {
    ctx.save();
    ctx.translate(overlay.x, overlay.y - 6);
    ctx.strokeStyle = "rgba(230, 230, 230, 0.9)";
    ctx.fillStyle = "rgba(20, 20, 20, 0.55)";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(0, 0, 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-1.3, -0.6);
    ctx.lineTo(1.3, 0.6);
    ctx.moveTo(1.3, -0.6);
    ctx.lineTo(-1.3, 0.6);
    ctx.stroke();
    ctx.restore();
  }
}
