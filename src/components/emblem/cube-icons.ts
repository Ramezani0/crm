/** White glyph canvases for the login 2×2 glass cubes (car / home / life / family). */

export const CUBE_ICON_KINDS = ["car", "house", "heart", "people"] as const;
export type CubeIconKind = (typeof CUBE_ICON_KINDS)[number];

export const CUBE_ICON_LAYOUT: { kind: CubeIconKind; col: number; row: number }[] = [
  { kind: "car", col: -1, row: 1 },
  { kind: "house", col: 1, row: 1 },
  { kind: "heart", col: -1, row: -1 },
  { kind: "people", col: 1, row: -1 },
];

export function drawCubeIcon(kind: CubeIconKind, size = 256): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.clearRect(0, 0, size, size);
  ctx.translate(size / 2, size / 2);
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#ffffff";
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  const s = size / 256;
  ctx.scale(s, s);

  if (kind === "car") drawCar(ctx);
  else if (kind === "house") drawHouse(ctx);
  else if (kind === "heart") drawHeart(ctx);
  else drawPeople(ctx);

  return canvas;
}

function drawCar(ctx: CanvasRenderingContext2D) {
  ctx.beginPath();
  roundedRect(ctx, -78, -6, 156, 52, 14);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-44, -6);
  ctx.lineTo(-24, -52);
  ctx.lineTo(32, -52);
  ctx.lineTo(58, -6);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(-44, 46, 20, 0, Math.PI * 2);
  ctx.arc(46, 46, 20, 0, Math.PI * 2);
  ctx.fill();
}

function drawHouse(ctx: CanvasRenderingContext2D) {
  ctx.beginPath();
  ctx.moveTo(0, -78);
  ctx.lineTo(82, -8);
  ctx.lineTo(82, 74);
  ctx.lineTo(-82, 74);
  ctx.lineTo(-82, -8);
  ctx.closePath();
  ctx.fill();
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  roundedRect(ctx, -18, 18, 36, 56, 4);
  ctx.fill();
  ctx.restore();
}

function drawHeart(ctx: CanvasRenderingContext2D) {
  ctx.beginPath();
  ctx.moveTo(0, 58);
  ctx.bezierCurveTo(-96, 8, -86, -72, 0, -32);
  ctx.bezierCurveTo(86, -72, 96, 8, 0, 58);
  ctx.fill();
}

function drawPeople(ctx: CanvasRenderingContext2D) {
  person(ctx, -32, 8, 0.92);
  person(ctx, 34, 14, 0.78);
}

function person(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.beginPath();
  ctx.arc(0, -48, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-36, 62);
  ctx.quadraticCurveTo(-40, 8, 0, 8);
  ctx.quadraticCurveTo(40, 8, 36, 62);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
