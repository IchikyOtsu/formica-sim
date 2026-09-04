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
}
