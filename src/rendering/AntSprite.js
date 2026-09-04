import { Caste } from "../entities/Ant.js";

// Rendu Canvas pur d'une fourmi 2D orientée — pas d'image externe, tout en
// vecteurs (le projet n'a aucune dépendance externe). Trois segments (tête,
// thorax, abdomen) + 6 pattes très simples ; `angle` oriente tout le sprite
// via ctx.rotate(). Conçu pour être appelé depuis n'importe quel renderer
// (vue nid aujourd'hui, vue monde potentiellement plus tard) — c'est la
// seule fonction qui connaît l'anatomie du sprite.
export function drawAnt2D(ctx, {
  x,
  y,
  angle = 0,
  scale = 1,
  color = "#c8a25a",
  caste = Caste.WORKER,
  carrying = false,
  resting = false,
  tending = false,
  building = false,
  legPhase = 0,
}) {
  const isSoldier = caste === Caste.SOLDIER;
  const bodyScale = (isSoldier ? 1.35 : 1) * scale * (resting ? 0.85 : 1);

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(bodyScale, resting ? bodyScale * 0.7 : bodyScale);

  if (tending) {
    ctx.beginPath();
    ctx.arc(0, 0, 3.2, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(232, 195, 74, 0.55)";
    ctx.lineWidth = 0.5 / bodyScale;
    ctx.stroke();
  }
  if (building) {
    ctx.beginPath();
    ctx.arc(0, 0, 2.6, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(150, 210, 235, 0.6)";
    ctx.lineWidth = 0.5 / bodyScale;
    ctx.stroke();
  }

  // pattes : trois paires, un léger balancement pendant le mouvement
  if (!resting) {
    ctx.strokeStyle = "rgba(20, 16, 12, 0.6)";
    ctx.lineWidth = 0.35;
    const swing = Math.sin(legPhase) * 0.35;
    for (let side = -1; side <= 1; side += 2) {
      for (let index = 0; index < 3; index += 1) {
        const originX = -0.6 + index * 0.6;
        const legAngle = side * (0.9 + swing * (index % 2 === 0 ? 1 : -1));
        ctx.beginPath();
        ctx.moveTo(originX, side * 0.3);
        ctx.lineTo(originX + Math.cos(legAngle) * 1.1, side * 0.3 + Math.sin(legAngle) * 1.1);
        ctx.stroke();
      }
    }
  }

  ctx.fillStyle = color;
  // abdomen (arrière)
  ctx.beginPath();
  ctx.ellipse(-1.3, 0, isSoldier ? 1.1 : 0.95, isSoldier ? 0.85 : 0.7, 0, 0, Math.PI * 2);
  ctx.fill();
  // thorax (centre)
  ctx.beginPath();
  ctx.ellipse(0, 0, 0.55, 0.45, 0, 0, Math.PI * 2);
  ctx.fill();
  // tête (avant), plus large chez le soldat
  ctx.beginPath();
  ctx.ellipse(0.95, 0, isSoldier ? 0.75 : 0.55, isSoldier ? 0.65 : 0.45, 0, 0, Math.PI * 2);
  ctx.fill();

  if (carrying) {
    ctx.fillStyle = "rgba(232, 195, 74, 0.9)";
    ctx.beginPath();
    ctx.arc(-2.2, 0, 0.55, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}
