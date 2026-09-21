// © 2026 김용현
// projections/derivations.js — 수학적 조정 시나리오 (PLAN 6.3, 9장). 새 조정 과정은 여기에 시나리오를 추가하는 방식으로만 넣는다.
//
// 시나리오: { root, steps: [ { titleKo, captionKo, formulaTex, morph, panel, compare?, tissot?, badgeKo? } ] }
// morph   : { type:'lerp', to } | { type:'equalAreaFamily', to } | { type:'custom', fn(λ,φ,t,prev,params), domain? } | null
// panel   : 'spacingGraph' | 'robinsonTable' | 'blend' | 'lobes' | 'areaRatio' | 'none'
// compare : 단계에 들어가면 비교 모드로 겹칠 도법 id
// 자막은 명사형 어미로 쓴다(수업용).
//
// 단계 k 의 투영 함수는 stepProjection(deriv, k, t, params) 로 얻는다. 1~4 단계는 root 로 재생한다.
import { PROJECTIONS, domainOf } from './registry.js';
import * as A from './adjusted.js';

const D = Math.PI / 180;
const HALF_PI = Math.PI / 2;
const RECT_WORLD = { phiMin: -HALF_PI, phiMax: HALF_PI, maxAngularDist: null, kind: 'rect' };

export const DERIVATIONS = {
  // ---- 9.2 메르카토르 ----
  mercatorFromCentral: {
    root: 'centralCylindrical',
    steps: [
      {
        titleKo: '위선 간격을 정각 조건에 맞게 조정',
        captionKo: '빛 투영은 고위도가 끝없이 늘어남(y = tan φ). 가로로 늘어난 비율(sec φ)만큼만 세로를 늘리면 모양(각)이 보존됨. 티소 지표가 타원 → 원으로 바뀌는 것이 그 증거.',
        formulaTex: 'y = \\tan\\varphi \\;\\longrightarrow\\; y = \\ln\\tan\\left(\\tfrac{\\pi}{4}+\\tfrac{\\varphi}{2}\\right)',
        morph: { type: 'lerp', to: 'mercator' },
        panel: 'spacingGraph',
      },
    ],
  },
  equirectFromCentral: {
    root: 'centralCylindrical',
    steps: [
      {
        titleKo: '위선 간격을 균등하게 조정',
        captionKo: '벌어진 위선 간격을 모두 같게 되돌림. 경선 방향 거리는 정확해지지만(정거), 고위도의 가로 늘어남은 그대로.',
        formulaTex: 'y = \\tan\\varphi \\;\\longrightarrow\\; y = \\varphi',
        morph: { type: 'lerp', to: 'equirectangular' },
        panel: 'spacingGraph',
      },
    ],
  },
  millerFromMercator: {
    root: 'centralCylindrical',
    steps: [
      {
        titleKo: '① 메르카토르로 조정',
        captionKo: '먼저 정각 조건으로 메르카토르를 만듦. 극은 무한대 — 그릴 수 없음.',
        formulaTex: 'y = \\ln\\tan\\left(\\tfrac{\\pi}{4}+\\tfrac{\\varphi}{2}\\right)',
        morph: { type: 'lerp', to: 'mercator' },
        panel: 'spacingGraph',
      },
      {
        titleKo: '② 위도를 0.8배로 줄여 투영한 뒤 1.25배로 늘림',
        captionKo: '메르카토르 식의 φ 자리에 0.8φ 를 넣고 결과를 1.25배. 극(φ = 90°)도 유한한 y 에 놓이지만 정각성은 잃음.',
        formulaTex: 'y = 1.25\\,\\ln\\tan\\left(\\tfrac{\\pi}{4}+0.4\\varphi\\right)',
        morph: { type: 'lerp', to: 'miller' },
        panel: 'spacingGraph',
      },
    ],
  },

  // ---- 원뿔 3종 ----
  equidistantConicFromCentral: {
    root: 'centralConic',
    steps: [
      {
        titleKo: '위선 간격을 균등하게 조정',
        captionKo: '중심 빛이 만든 위선 간격(tan)을 표준위선에서의 거리에 비례하도록 되돌림. 경선 방향 거리가 정확해짐.',
        formulaTex: '\\rho = \\cot\\varphi_0 - \\tan(\\varphi-\\varphi_0) \\;\\longrightarrow\\; \\rho = \\cot\\varphi_0 - (\\varphi-\\varphi_0)',
        morph: { type: 'lerp', to: 'equidistantConic' },
        panel: 'spacingGraph',
      },
    ],
  },
  lccFromCentral: {
    root: 'centralConic',
    steps: [
      {
        titleKo: '위선 간격을 정각 조건에 맞게 조정',
        captionKo: '두 표준위선(30°, 60°)에서 축척이 1이 되도록 원뿔상수 n 과 반지름 ρ(φ) 를 정함. 메르카토르와 같은 원리 — 세로 간격을 가로 늘어남에 맞춤.',
        formulaTex: '\\begin{gathered}\\rho = F\\cot^{n}\\!\\left(\\tfrac{\\pi}{4}+\\tfrac{\\varphi}{2}\\right)\\\\[2pt] n = \\frac{\\ln(\\cos\\varphi_1/\\cos\\varphi_2)}{\\ln\\!\\left(\\tan(\\tfrac{\\pi}{4}+\\tfrac{\\varphi_2}{2})\\big/\\tan(\\tfrac{\\pi}{4}+\\tfrac{\\varphi_1}{2})\\right)}\\end{gathered}',
        morph: { type: 'lerp', to: 'lambertConformalConic' },
        panel: 'spacingGraph',
      },
    ],
  },
  albersFromCentral: {
    root: 'centralConic',
    steps: [
      {
        titleKo: '위선 간격을 정적 조건에 맞게 조정',
        captionKo: '위선 사이 고리의 넓이가 실제 구면의 띠 넓이와 같아지도록 ρ(φ) 를 정함. 고위도로 갈수록 위선 간격이 좁아짐.',
        formulaTex: '\\rho = \\tfrac{\\sqrt{C-2n\\sin\\varphi}}{n},\\quad n = \\tfrac{\\sin\\varphi_1+\\sin\\varphi_2}{2}',
        morph: { type: 'lerp', to: 'albers' },
        panel: 'spacingGraph',
      },
    ],
  },

  // ---- 방위 2종 ----
  azimuthalEquidistantFromStereo: {
    root: 'stereographic',
    steps: [
      {
        titleKo: '반지름을 각거리에 비례하게 조정',
        captionKo: '평사도법의 반지름 2tan(c/2) 를 각거리 c 그대로로 바꿈. 접점에서 어느 방향으로든 거리가 정확해지고, 대척점까지 온 세계가 원 안에 들어옴.',
        formulaTex: 'r = 2\\tan\\tfrac{c}{2} \\;\\longrightarrow\\; r = c',
        morph: { type: 'lerp', to: 'azimuthalEquidistant' },
        panel: 'spacingGraph',
      },
    ],
  },
  lambertAzimuthalFromStereo: {
    root: 'stereographic',
    steps: [
      {
        titleKo: '반지름을 정적 조건에 맞게 조정',
        captionKo: '반지름 r 안의 원 넓이 πr² = 각거리 c 안의 구면 모자 넓이 2π(1 − cos c) 가 되도록 r = 2sin(c/2).',
        formulaTex: 'r = 2\\tan\\tfrac{c}{2} \\;\\longrightarrow\\; r = 2\\sin\\tfrac{c}{2}',
        morph: { type: 'lerp', to: 'lambertAzimuthalEA' },
        panel: 'spacingGraph',
      },
    ],
  },

  // ---- 9.3 Equal Earth ----
  equalEarthFromLambert: {
    root: 'lambertCylindricalEA',
    steps: [
      {
        titleKo: '① 눌린 고위도를 세로로 다시 벌림 (정적성 유지)',
        captionKo: '면적은 정확하지만 고위도가 납작한 상태. 고위도를 세로로 벌리되, 면적을 지키려면 세로로 늘린 만큼 가로를 줄여야 함: x = λ·cos φ / Y′(φ). 모핑 내내 티소 타원의 넓이는 그대로.',
        formulaTex: 'y = Y(\\varphi),\\qquad x = \\lambda\\,\\frac{\\cos\\varphi}{Y\'(\\varphi)}',
        morph: { type: 'equalAreaFamily', to: 'equalEarth' },
        panel: 'spacingGraph',
        badgeKo: '면적배율 1.00 유지',
      },
      {
        titleKo: '② 로빈슨 도법과 외형 비교',
        captionKo: '로빈슨처럼 친숙한 외형을 목표로 다항식 계수 4개(A₁~A₄)를 정함. 빨간 선 = 로빈슨. 외형은 비슷하지만 이쪽은 면적이 정확.',
        formulaTex: 'A_1 = 1.340264,\\; A_2 = -0.081106,\\; A_3 = 0.000893,\\; A_4 = 0.003796',
        morph: null,
        panel: 'none',
        compare: 'robinson',
      },
      {
        titleKo: '③ 그린란드 : 아프리카 면적비',
        captionKo: '실제 면적비 약 1 : 14. 메르카토르·로빈슨·Equal Earth 에서 지도상 면적비가 어떻게 달라지는지 비교.',
        formulaTex: null,
        morph: null,
        panel: 'areaRatio',
        compare: 'robinson',
      },
    ],
  },

  // ---- 9.4 로빈슨 ----
  robinsonFromEquirect: {
    root: 'centralCylindrical',
    steps: [
      {
        titleKo: '① 등장방형으로 조정',
        captionKo: '먼저 위선 간격을 균등하게 되돌림(등장방형). 로빈슨의 출발점.',
        formulaTex: 'y = \\tan\\varphi \\;\\longrightarrow\\; y = \\varphi',
        morph: { type: 'lerp', to: 'equirectangular' },
        panel: 'spacingGraph',
      },
      {
        titleKo: '② Y 표 적용 — 위선의 세로 위치',
        captionKo: '각 위선을 표의 Y(φ) 값(적도로부터 거리 비)에 따라 옮김. 40° 까지는 거의 등간격, 고위도에서 간격이 좁아짐.',
        formulaTex: 'y = 1.3523\\,Y(\\varphi)',
        morph: {
          type: 'custom',
          fn: (lam, phi, t, prev) => {
            const p = prev(lam, phi), r = A.robinson(lam, phi);
            return [p[0], p[1] + (r[1] - p[1]) * t];
          },
        },
        panel: 'robinsonTable',
      },
      {
        titleKo: '③ X 표 적용 — 위선의 길이',
        captionKo: '각 위선을 표의 X(φ) 비율로 줄임. 극은 점이 아니라 적도 길이의 0.5322배인 선.',
        formulaTex: 'x = 0.8487\\,X(\\varphi)\\,\\lambda',
        morph: {
          type: 'custom',
          fn: (lam, phi, t, prev) => {
            const p = prev(lam, phi), r = A.robinson(lam, phi);
            return [p[0] + (r[0] - p[0]) * t, p[1]];
          },
        },
        panel: 'robinsonTable',
      },
      {
        titleKo: '④ 수식이 없는 도법',
        captionKo: '로빈슨 도법에는 수식이 없음. "보기 좋은" 세계지도를 목표로 시행착오 끝에 정한 표가 곧 정의. 그래서 정각도 정적도 아닌 절충 도법 — 티소 지표로 확인.',
        formulaTex: null,
        morph: null,
        panel: 'robinsonTable',
        tissot: true,
      },
      {
        titleKo: '⑤ 연혁',
        captionKo: '1963년 아서 로빈슨이 랜드 맥널리의 의뢰로 고안. 1988~1998년 내셔널 지오그래픽 협회 세계지도에 사용, 1998년부터는 빈켈 트리펠로 교체.',
        formulaTex: null,
        morph: null,
        panel: 'none',
      },
    ],
  },

  // ---- 9.5 시뉴소이드 · 몰바이데 · 에케르트 IV ----
  sinusoidalFromLambert: {
    root: 'lambertCylindricalEA',
    steps: [
      {
        titleKo: '위선 간격을 등간격으로 되돌림 (정적성 유지)',
        captionKo: '위선 간격을 등간격(y = φ)으로 되돌리면, 면적을 지키기 위해 각 위선은 실제 길이(cos φ)로 줄어듦. 경선이 사인 곡선이 되는 이유.',
        formulaTex: 'y = \\varphi,\\qquad x = \\lambda\\,\\frac{\\cos\\varphi}{Y\'(\\varphi)} = \\lambda\\cos\\varphi',
        morph: { type: 'equalAreaFamily', to: 'sinusoidal' },
        panel: 'spacingGraph',
        badgeKo: '면적배율 1.00 유지',
      },
    ],
  },
  mollweideFromLambert: {
    root: 'lambertCylindricalEA',
    steps: [
      {
        titleKo: '전체 외곽을 2:1 타원에 맞춤 (정적성 유지)',
        captionKo: '보조각 θ 를 2θ + sin 2θ = π sin φ 로 정하면(뉴턴법) 위선 y = √2 sin θ, 외곽은 2:1 타원, 면적은 보존.',
        formulaTex: '\\begin{gathered}2\\theta+\\sin 2\\theta = \\pi\\sin\\varphi\\\\[2pt] y = \\sqrt2\\sin\\theta,\\quad x = \\tfrac{2\\sqrt2}{\\pi}\\lambda\\cos\\theta\\end{gathered}',
        morph: { type: 'equalAreaFamily', to: 'mollweide' },
        panel: 'spacingGraph',
        badgeKo: '면적배율 1.00 유지',
      },
    ],
  },
  eckert4FromLambert: {
    root: 'lambertCylindricalEA',
    steps: [
      {
        titleKo: '극을 선으로 표현 (정적성 유지)',
        captionKo: '극을 적도 절반 길이의 선으로 두고 외곽을 반원 두 개와 직선으로 만든 정적도법. 세로 간격 함수 Y(φ)만 정하면 가로 축척은 자동.',
        formulaTex: '\\begin{gathered}y = 2\\sqrt{\\tfrac{\\pi}{4+\\pi}}\\sin\\theta\\\\[2pt] x = \\tfrac{2}{\\sqrt{\\pi(4+\\pi)}}\\lambda(1+\\cos\\theta)\\end{gathered}',
        morph: { type: 'equalAreaFamily', to: 'eckert4' },
        panel: 'spacingGraph',
        badgeKo: '면적배율 1.00 유지',
      },
    ],
  },

  // ---- 9.6 빈켈 트리펠 ----
  winkelFromBlend: {
    root: 'stereographic',
    steps: [
      {
        titleKo: '① 정거방위도법(적도 중심)으로 조정',
        captionKo: '적도 위 한 점을 중심으로 한 평사도법에서 출발, 반지름을 각거리 c 에 비례하게 바꿈(정거방위도법). 대척점까지 온 세계가 원 안에.',
        formulaTex: 'r = 2\\tan\\tfrac{c}{2} \\;\\longrightarrow\\; r = c',
        morph: { type: 'lerp', to: 'azimuthalEquidistant' },
        panel: 'spacingGraph',
      },
      {
        titleKo: '② 경도를 절반으로 압축',
        captionKo: '경도를 절반으로 압축해 전 세계를 반구 크기의 원 안에 넣음.',
        formulaTex: '(x, y) = \\mathrm{AE}\\!\\left(\\tfrac{\\lambda}{2},\\ \\varphi\\right)',
        morph: {
          type: 'custom',
          fn: (lam, phi, t) => A.azimuthalEquidistant(lam * (1 - t / 2), phi),
          domain: RECT_WORLD,
        },
        panel: 'none',
      },
      {
        titleKo: '③ 가로를 2배로 늘림 = 아이토프 도법',
        captionKo: '가로를 2배로 늘려 2:1 타원으로. 이것이 아이토프 도법.',
        formulaTex: '(x, y) = \\left(2\\,x_{\\mathrm{AE}}(\\tfrac{\\lambda}{2},\\varphi),\\ y_{\\mathrm{AE}}(\\tfrac{\\lambda}{2},\\varphi)\\right)',
        morph: {
          type: 'custom',
          fn: (lam, phi, t) => {
            const h = A.azimuthalEquidistant(lam / 2, phi);
            return [h[0] * (1 + t), h[1]];
          },
          domain: RECT_WORLD,
        },
        panel: 'none',
      },
      {
        titleKo: '④ 등장방형과 산술평균',
        captionKo: '등장방형(표준위선 φ₁ = arccos(2/π) ≈ 50°28′)과 아이토프를 나란히 놓고 두 좌표의 산술평균. "트리펠" = 면적·각·거리 세 왜곡을 모두 조금씩 줄였다는 뜻.',
        formulaTex: '(x, y) = \\tfrac12\\left[\\,\\text{Aitoff}(\\lambda,\\varphi) + (\\lambda\\cos\\varphi_1,\\ \\varphi)\\,\\right]',
        morph: { type: 'lerp', to: 'winkelTripel' },
        panel: 'blend',
      },
    ],
  },

  // ---- 9.7 구드 호몰로사인 ----
  goodeFromParts: {
    root: 'lambertCylindricalEA',
    steps: [
      {
        titleKo: '① 시뉴소이드와 몰바이데 — 둘 다 정적, 장점이 다름',
        captionKo: '시뉴소이드(노란 지도)는 저위도 모양이 자연스럽고, 몰바이데(빨간 선)는 고위도 모양이 자연스러움. 둘 다 정적도법. 두 외곽선이 만나는 위도 = 위선 길이가 같아지는 40°44′.',
        formulaTex: '\\text{Sinusoidal: } x = \\lambda\\cos\\varphi \\qquad \\text{Mollweide: } x = \\tfrac{2\\sqrt2}{\\pi}\\lambda\\cos\\theta',
        morph: { type: 'equalAreaFamily', to: 'sinusoidal' },
        panel: 'lobes',
        compare: 'mollweide',
        badgeKo: '면적배율 1.00 유지',
      },
      {
        titleKo: '② 40°44′ 에서 자르고 접합 = 호몰로사인',
        captionKo: '저위도(|φ| ≤ 40°44′)는 시뉴소이드, 고위도는 몰바이데를 0.0528 만큼 내려 붙임. 두 도법의 위선 길이가 같은 위도라 이음매가 벌어지지 않고, 정적성도 그대로.',
        formulaTex: '|\\varphi| \\le 40°44\': \\text{Sinusoidal},\\qquad |\\varphi| > 40°44\': \\text{Mollweide} - 0.0528',
        morph: { type: 'lerp', to: 'homolosine' },
        panel: 'lobes',
        badgeKo: '면적배율 1.00 유지',
      },
      {
        titleKo: '③ 대양을 따라 찢기 = 단열',
        captionKo: '대륙이 잘리지 않도록 대서양·태평양·인도양에서 절개. 북반구 2개, 남반구 4개 로브가 각자 중앙경선을 기준으로 다시 그려져 모양 왜곡이 크게 줄고, 면적은 그대로. 적도에서는 모든 로브가 이어짐.',
        formulaTex: 'x = \\lambda_0 + x(\\lambda-\\lambda_0,\\ \\varphi),\\qquad \\lambda_0 = \\text{로브 중앙경선}',
        morph: {
          type: 'custom',
          fn: (lam, phi, t) => {
            const u = A.homolosine(lam, phi), i = A.goodeHomolosine(lam, phi);
            return [u[0] + (i[0] - u[0]) * t, u[1] + (i[1] - u[1]) * t];
          },
          domain: { ...RECT_WORLD, cuts: A.GOODE_CUTS },
        },
        panel: 'lobes',
        tissot: true,
        badgeKo: '면적배율 1.00 유지',
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// 모핑 평가
// ---------------------------------------------------------------------------

/** 도메인 보간. kind 가 다르면 t > 0 부터 목표 kind 를 쓴다. 절개선(cuts)은 목표 것을 따른다. */
export function lerpDomain(a, b, t) {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const mad = a.maxAngularDist == null || b.maxAngularDist == null
    ? (b.kind === 'cap' ? b.maxAngularDist : null)
    : a.maxAngularDist + (b.maxAngularDist - a.maxAngularDist) * t;
  return {
    phiMin: a.phiMin + (b.phiMin - a.phiMin) * t,
    phiMax: a.phiMax + (b.phiMax - a.phiMax) * t,
    maxAngularDist: mad,
    kind: b.kind,
    cuts: b.cuts || null,
  };
}

/**
 * 9.1 정적성 보존 모핑. Y_t = (1−t)Y_A + tY_B,  x = λ cos φ / Y_t'(φ)
 */
export function equalAreaMorph(fA, fB, t) {
  const YA = (phi) => fA(0, phi)[1];
  const YB = (phi) => fB(0, phi)[1];
  const Yt = (phi) => (1 - t) * YA(phi) + t * YB(phi);
  const DELTA = 1e-5, LIM = HALF_PI - 1e-4;
  return (lam, phi) => {
    const p = Math.max(-LIM, Math.min(LIM, phi));
    const y = Yt(p);
    const dy = (Yt(p + DELTA) - Yt(p - DELTA)) / (2 * DELTA);
    return [lam * Math.cos(p) / dy, y];
  };
}

function entryProjection(entry, params) {
  return { f: (lam, phi) => entry.forward(lam, phi, params), domain: domainOf(entry, params), entry };
}

/** 단계 k 가 끝난 뒤의 투영 (k = −1 이면 root) */
export function endOfStep(deriv, k, params) {
  if (k < 0) return entryProjection(PROJECTIONS[deriv.root], params);
  const step = deriv.steps[k];
  const prev = endOfStep(deriv, k - 1, params);
  const m = step.morph;
  if (!m) return prev;
  if (m.type === 'lerp' || m.type === 'equalAreaFamily') return entryProjection(PROJECTIONS[m.to], params);
  if (m.type === 'custom') {
    const pf = prev.f;
    return { f: (lam, phi) => m.fn(lam, phi, 1, pf, params), domain: m.domain || prev.domain };
  }
  return prev;
}

/** 단계 k, 진행도 t 의 투영 { f, domain } */
export function stepProjection(deriv, k, t, params) {
  const prev = endOfStep(deriv, k - 1, params);
  if (t >= 1) return endOfStep(deriv, k, params);
  const step = deriv.steps[k];
  const m = step.morph;
  if (!m || t <= 0) return prev;
  if (m.type === 'lerp') {
    const target = entryProjection(PROJECTIONS[m.to], params);
    const fa = prev.f, fb = target.f;
    return {
      f: (lam, phi) => {
        const a = fa(lam, phi), b = fb(lam, phi);
        return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      },
      domain: lerpDomain(prev.domain, target.domain, t),
    };
  }
  if (m.type === 'equalAreaFamily') {
    const target = entryProjection(PROJECTIONS[m.to], params);
    return { f: equalAreaMorph(prev.f, target.f, t), domain: lerpDomain(prev.domain, target.domain, t) };
  }
  if (m.type === 'custom') {
    const pf = prev.f;
    const end = m.domain || prev.domain;
    return { f: (lam, phi) => m.fn(lam, phi, t, pf, params), domain: lerpDomain(prev.domain, end, t) };
  }
  return prev;
}

/** 빈켈 blend 패널용: 등장방형(φ₁ = arccos 2/π) 성분 */
export function winkelEquirectComponent(lam, phi) {
  return [lam * (2 / Math.PI), phi];
}

export { D as DEG };
