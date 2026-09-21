// © 2026 김용현
// geometry/mesh.js — 격자 메시 유틸 (three.js 의존 없음, tests 에서도 쓴다).
//  buildGridTopology : (nu+1)×(nv+1) 격자의 (u, v) 와 삼각형 인덱스
//  scatterTriangles  : 격자 정점 배열 → 인덱스 없는 삼각형 버퍼 (NaN 정점 삼각형은 퇴화)
//  fixLobeSeams      : 단열 도법의 절개 자오선 위 정점을 삼각형마다 자기 로브 쪽으로 ε 밀어 다시 평가 (PLAN 9.7)

export function buildGridTopology(nu, nv) {
  const uv = new Float32Array((nu + 1) * (nv + 1) * 2);
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const k = (j * (nu + 1) + i) * 2;
    uv[k] = i / nu; uv[k + 1] = j / nv;
  }
  const tris = new Uint32Array(nu * nv * 6);
  let t = 0;
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
    tris[t++] = a; tris[t++] = b; tris[t++] = d;
    tris[t++] = a; tris[t++] = d; tris[t++] = c;
  }
  return { uv, tris, count: (nu + 1) * (nv + 1), nu, nv };
}

/**
 * gridPos(NaN 포함 가능) → dst 삼각형 버퍼. NaN 정점이 있는 삼각형은 세 점을 같은 점으로 퇴화시킨다.
 * extras: [{ src: Float32Array(count*n), dst: Float32Array(tris.length*n), n }]
 */
export function scatterTriangles(gridPos, tris, dst, extras = []) {
  for (let t = 0; t < tris.length; t += 3) {
    const a = tris[t], b = tris[t + 1], c = tris[t + 2];
    const bad = Number.isNaN(gridPos[a * 3]) || Number.isNaN(gridPos[b * 3]) || Number.isNaN(gridPos[c * 3]);
    let ia = a, ib = b, ic = c;
    if (bad) {
      const good = !Number.isNaN(gridPos[a * 3]) ? a : !Number.isNaN(gridPos[b * 3]) ? b : !Number.isNaN(gridPos[c * 3]) ? c : -1;
      if (good < 0) { for (let k = 0; k < 9; k++) dst[t * 3 + k] = 0; for (const e of extras) for (let k = 0; k < e.n * 3; k++) e.dst[t * e.n + k] = 0; continue; }
      ia = ib = ic = good;
    }
    const o = t * 3;
    dst[o] = gridPos[ia * 3]; dst[o + 1] = gridPos[ia * 3 + 1]; dst[o + 2] = gridPos[ia * 3 + 2];
    dst[o + 3] = gridPos[ib * 3]; dst[o + 4] = gridPos[ib * 3 + 1]; dst[o + 5] = gridPos[ib * 3 + 2];
    dst[o + 6] = gridPos[ic * 3]; dst[o + 7] = gridPos[ic * 3 + 1]; dst[o + 8] = gridPos[ic * 3 + 2];
    for (const e of extras) {
      const n = e.n, eo = t * n;
      for (let k = 0; k < n; k++) { e.dst[eo + k] = e.src[ia * n + k]; e.dst[eo + n + k] = e.src[ib * n + k]; e.dst[eo + 2 * n + k] = e.src[ic * n + k]; }
    }
  }
}

/**
 * 절개 자오선 위의 격자 정점은 양쪽 로브가 공유하므로, 그 정점을 쓰는 삼각형마다 무게중심 쪽으로 ε 민 좌표로
 * 다시 평가해 삼각형 버퍼에 직접 쓴다. gridLatLon: 정점별 (λ', φ'), evalPos(λ, φ, out) → 3D 위치.
 * 반환: 보정한 삼각형 수
 */
export function fixLobeSeams(gridLatLon, tris, dst, cuts, evalPos, eps = 1e-6) {
  if (!cuts) return 0;
  const tmp = [0, 0, 0];
  const TOL = 1e-5; // gridLatLon 은 Float32 — 2° 격자에서 절개선 판정에 충분
  let fixed = 0;
  for (let t = 0; t < tris.length; t += 3) {
    const ia = tris[t], ib = tris[t + 1], ic = tris[t + 2];
    const la = gridLatLon[2 * ia], lb = gridLatLon[2 * ib], lc = gridLatLon[2 * ic];
    const pa = gridLatLon[2 * ia + 1], pb = gridLatLon[2 * ib + 1], pc = gridLatLon[2 * ic + 1];
    const phiC = (pa + pb + pc) / 3;
    const list = phiC >= 0 ? cuts.north : cuts.south;
    let touched = false;
    for (const cut of list) {
      const onA = Math.abs(la - cut) < TOL, onB = Math.abs(lb - cut) < TOL, onC = Math.abs(lc - cut) < TOL;
      if (!(onA || onB || onC)) continue;
      const lamC = (la + lb + lc) / 3;
      const side = lamC > cut ? 1 : -1;
      const corners = [[onA, la, pa, 0], [onB, lb, pb, 3], [onC, lc, pc, 6]];
      for (const [on, l, p, off] of corners) {
        if (!on) continue;
        evalPos(l + side * eps, p, tmp);
        if (Number.isNaN(tmp[0])) continue;
        const o = t * 3 + off;
        dst[o] = tmp[0]; dst[o + 1] = tmp[1]; dst[o + 2] = tmp[2];
      }
      touched = true;
    }
    if (touched) fixed++;
  }
  return fixed;
}

/** 절개 자오선을 따라 그리는 가장자리 선(양쪽 로브 각각). 반환: [λ, φ, λ, φ, …] 폴리라인 배열(프레임 좌표, ε 만큼 안쪽) */
export function cutEdgeLines(cuts, stepDeg = 2, eps = 1e-6) {
  const D = Math.PI / 180;
  const out = [];
  if (!cuts) return out;
  const hemi = [[cuts.north, 1], [cuts.south, -1]];
  for (const [list, sign] of hemi) {
    for (const c of list) {
      for (const side of [-1, 1]) {
        const pts = [];
        for (let deg = 0; deg <= 90; deg += stepDeg) pts.push(c + side * eps, sign * deg * D);
        out.push(Float64Array.from(pts));
      }
    }
  }
  return out;
}
