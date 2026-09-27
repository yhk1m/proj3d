// © 2026 김용현
// export/drawMap.js — mapVector 결과를 캔버스 2D 에 그린다. 색은 두 가지(#000000 · #ffffff)만, 지도 밖은 투명.
// 채우기: 바다 → 경위선(땅 아래라 바다 위에만 보임) → 땅 → 해안선 → 티소 지표 → 테두리. 채우기 끔: 경위선 → 해안선 → 티소 지표 → 테두리.
export const LONG_SIDE = 3000;
const BLACK = '#000000', WHITE = '#ffffff';

/** 색 규칙. 채우기 끔이면 면은 투명(null). 선은 늘 땅 색. halo = 땅 위에서도 선이 보이게 까는 반대색 테두리(채우기일 때만) */
export function exportColors({ fill, invert }) {
  const dark = invert ? WHITE : BLACK, light = invert ? BLACK : WHITE;
  return { sea: fill ? light : null, land: fill ? dark : null, line: dark, halo: fill ? light : null };
}

/** 캔버스 크기(긴 변 = longSide, 사방 여백 1 %)와 종이 좌표 → 픽셀 변환(y 뒤집기) */
export function layoutFor(bbox, longSide) {
  const w = bbox.maxX - bbox.minX, h = bbox.maxY - bbox.minY;
  const span = Math.max(w, h);
  const k = longSide / (span * 1.02);
  const pad = 0.01 * span * k;
  return {
    width: Math.round(w * k + 2 * pad), height: Math.round(h * k + 2 * pad),
    tx: (x) => (x - bbox.minX) * k + pad,
    ty: (y) => (bbox.maxY - y) * k + pad,
  };
}

function trace(ctx, pts, L, close) {
  if (pts.length < 2) return;
  ctx.moveTo(L.tx(pts[0][0]), L.ty(pts[0][1]));
  for (let i = 1; i < pts.length; i++) ctx.lineTo(L.tx(pts[i][0]), L.ty(pts[i][1]));
  if (close) ctx.closePath();
}

/** opts = { fill, invert, graticule, tissot }. 선 굵기는 긴 변 3000 px 기준(테두리 3, 해안선 2, 경위선 1.5, 티소 2 + 테두리 5)으로 비례 */
export function drawMapVector(ctx, vec, opts, L, longSide) {
  const c = exportColors(opts);
  const s = longSide / LONG_SIDE;
  const w = (px) => Math.max(0.75, px * s);
  ctx.clearRect(0, 0, L.width, L.height);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  // 면: 짝홀 채우기 + 같은 색 가는 선(날짜변경선·로브 경계에서 잘린 고리 사이 머리카락 틈 가림).
  // 가는 선은 채운 면 안으로 잘라(clip) 그린다 — 잘라내기가 경계에 남긴 넓이 0 인 '다리'가 바다 위에 선으로 드러나지 않게.
  const fillRings = (rings, color) => {
    ctx.beginPath();
    for (const r of rings) trace(ctx, r, L, true);
    ctx.fillStyle = color;
    ctx.fill('evenodd');
    ctx.save();
    ctx.clip('evenodd');
    ctx.strokeStyle = color;
    ctx.lineWidth = w(1);
    ctx.stroke();
    ctx.restore();
  };
  const strokeLines = (lines, px, color = c.line) => {
    ctx.beginPath();
    for (const ln of lines) trace(ctx, ln, L, false);
    ctx.strokeStyle = color;
    ctx.lineWidth = w(px);
    ctx.stroke();
  };
  if (opts.fill) fillRings(vec.sea, c.sea);
  if (opts.graticule) strokeLines(vec.graticule, 1.5);
  if (opts.fill) fillRings(vec.land, c.land);
  strokeLines(vec.coast, 2);
  if (opts.tissot && vec.tissot) {
    if (c.halo) strokeLines(vec.tissot, 5, c.halo);
    strokeLines(vec.tissot, 2);
  }
  strokeLines(vec.outline, 3);
}
