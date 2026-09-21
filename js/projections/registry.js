// © 2026 김용현
// projections/registry.js — 투영법 레지스트리 (PLAN 3장, 6.2). 새 도법은 여기에 항목을 추가하는 방식으로만 넣는다.
//
// 항목 스키마
//  id, nameKo, family, property, surface({type}|null), light({type:'point', d}|{type:'axisOrthogonal'}|null)
//  params   : 기본 매개변수(라디안). phi0(원통 표준위선), phi1·phi2(원뿔 표준위선), d(방위 광원 위치)
//  domain   : {phiMin, phiMax, maxAngularDist(라디안|null), kind:'rect'|'cap', cuts?} 또는 params → domain 함수
//  forward  : (λ', φ', params) → [x, y]  (프레임 좌표, 단위구, 라디안)
//  derivation : derivations.js 시나리오 id. 빛 투영 도법은 null
//  defaultAspect : 선택 시 기본 aspect ('normal' | 'transverse' | 'oblique')
//  lockParams : UI 에서 잠글 매개변수 이름 배열
//  modern : "요즘 세계지도에 쓰이는 도법" 바로가기 그룹
//  captionKo : 명사형 어미의 짧은 설명(수업용 자막)
import * as P from './perspective.js';
import * as A from './adjusted.js';
import { coneGeometry } from '../geometry/bend.js';

const D = Math.PI / 180;
const rect = (phiMinDeg, phiMaxDeg) => ({ phiMin: phiMinDeg * D, phiMax: phiMaxDeg * D, maxAngularDist: null, kind: 'rect' });
const cap = (deg) => ({ phiMin: -Math.PI / 2, phiMax: Math.PI / 2, maxAngularDist: deg * D, kind: 'cap' });
const perspectiveCap = (params) => cap(P.perspectiveMaxAngularDist(params.d ?? 0) / D);

export const FAMILY_LABELS = {
  cylindrical: '원통',
  conic: '원뿔',
  azimuthal: '평면(방위)',
  pseudocylindrical: '의사원통',
  modifiedAzimuthal: '변형 방위',
  interrupted: '단열',
};

export const PROPERTY_LABELS = {
  conformal: '정각',
  equalArea: '정적',
  equidistant: '정거',
  compromise: '절충',
  none: '—',
};

export const PROJECTIONS = {
  // ---------------- 3.1 가전면 계열 · 원통 ----------------
  centralCylindrical: {
    id: 'centralCylindrical', nameKo: '중심원통도법', family: 'cylindrical', property: 'none',
    surface: { type: 'cylinder' }, light: { type: 'point', d: 0 },
    params: { phi0: 0 }, domain: rect(-75, 75),
    forward: P.centralCylindrical, derivation: null,
    formulaTex: 'x = \\lambda,\\quad y = \\tan\\varphi',
    captionKo: '지구 중심의 빛이 원통에 그린 지도. 위선 간격이 tan φ 로 벌어져 고위도가 끝없이 늘어남. 메르카토르가 아니라 "중심원통도법".',
  },
  lambertCylindricalEA: {
    id: 'lambertCylindricalEA', nameKo: '람베르트 정적원통도법', family: 'cylindrical', property: 'equalArea',
    surface: { type: 'cylinder' }, light: { type: 'axisOrthogonal' },
    params: { phi0: 0 }, domain: rect(-90, 90), lockParams: ['phi0'],
    forward: P.lambertCylindricalEA, derivation: null,
    formulaTex: 'x = \\lambda,\\quad y = \\sin\\varphi',
    captionKo: '지축에서 수평으로 나가는 빛 → 접선 원통. 면적은 정확하지만 고위도가 납작하게 눌림.',
  },
  equirectangular: {
    id: 'equirectangular', nameKo: '등장방형(정거원통)도법', family: 'cylindrical', property: 'equidistant',
    surface: { type: 'cylinder' }, light: null,
    params: { phi0: 0 }, domain: rect(-90, 90),
    forward: A.equirectangular, derivation: 'equirectFromCentral',
    formulaTex: 'x = \\lambda\\cos\\varphi_0,\\quad y = \\varphi',
    captionKo: '위선 간격을 모두 같게 둔 도법. 경선 방향 거리가 정확(정거). 가장 단순해서 위성영상·데이터 지도의 기본 격자로 쓰임.',
  },
  mercator: {
    id: 'mercator', nameKo: '메르카토르 도법', family: 'cylindrical', property: 'conformal',
    surface: { type: 'cylinder' }, light: null,
    params: { phi0: 0 }, domain: rect(-85, 85),
    forward: A.mercator, derivation: 'mercatorFromCentral',
    formulaTex: 'y = \\ln\\tan\\left(\\tfrac{\\pi}{4}+\\tfrac{\\varphi}{2}\\right)',
    captionKo: '빛 투영이 아니라 수학적 조정으로 만든 정각도법. 가로가 늘어난 비율(sec φ)만큼 세로도 늘려 모양(각)을 지킴. 항해도·웹 지도의 표준.',
  },
  miller: {
    id: 'miller', nameKo: '밀러 도법', family: 'cylindrical', property: 'compromise',
    surface: { type: 'cylinder' }, light: null,
    params: { phi0: 0 }, domain: rect(-90, 90),
    forward: A.miller, derivation: 'millerFromMercator',
    formulaTex: 'y = 1.25\\,\\ln\\tan\\left(\\tfrac{\\pi}{4}+0.4\\varphi\\right)',
    captionKo: '메르카토르의 위도를 0.8배로 줄여 투영한 뒤 1.25배 늘린 절충 도법. 극까지 그릴 수 있지만 정각도 정적도 아님.',
  },
  transverseMercator: {
    id: 'transverseMercator', nameKo: '횡축 메르카토르(TM)', family: 'cylindrical', property: 'conformal',
    surface: { type: 'cylinder' }, light: null,
    params: { phi0: 0 }, domain: rect(-85, 85),
    forward: A.mercator, derivation: 'mercatorFromCentral', defaultAspect: 'transverse',
    formulaTex: "y' = \\ln\\tan\\left(\\tfrac{\\pi}{4}+\\tfrac{\\varphi'}{2}\\right)",
    captionKo: '원통을 눕혀 한 경선(127°E)에 접하게 한 메르카토르. 접선 경선 근처의 왜곡이 작음 → 우리나라 지형도(TM 좌표계)와 UTM 의 바탕.',
  },

  // ---------------- 3.1 가전면 계열 · 원뿔 ----------------
  centralConic: {
    id: 'centralConic', nameKo: '중심원추도법', family: 'conic', property: 'none',
    surface: { type: 'cone' }, light: { type: 'point', d: 0 },
    params: { phi1: 40 * D, phi2: null },
    domain: (params) => {
      const g = coneGeometry({ type: 'cone' }, params);
      if (g.kind === 'cylinder') return rect(-75, 75);
      return { phiMin: Math.max(-75 * D, g.alpha - 65 * D), phiMax: Math.PI / 2, maxAngularDist: null, kind: 'rect' };
    },
    forward: P.centralConic, derivation: null,
    formulaTex: '\\rho = \\cot\\varphi_0 - \\tan(\\varphi-\\varphi_0),\\quad \\theta = \\lambda\\sin\\varphi_0',
    captionKo: '지구 중심의 빛이 원뿔에 그린 지도. 표준위선 φ₀ 를 90° 로 올리면 평면, 0° 로 내리면 원통 — 세 가전면은 한 가족.',
  },
  equidistantConic: {
    id: 'equidistantConic', nameKo: '정거원추도법', family: 'conic', property: 'equidistant',
    surface: { type: 'cone' }, light: null,
    params: { phi1: 40 * D, phi2: null }, domain: rect(-90, 90),
    forward: A.equidistantConic, derivation: 'equidistantConicFromCentral',
    formulaTex: '\\rho = \\cot\\varphi_0 - (\\varphi-\\varphi_0),\\quad \\theta = \\lambda\\sin\\varphi_0',
    captionKo: '위선 간격을 균등하게 조정한 원추도법. 경선 방향 거리가 정확.',
  },
  lambertConformalConic: {
    id: 'lambertConformalConic', nameKo: '람베르트 정각원추도법', family: 'conic', property: 'conformal',
    surface: { type: 'cone' }, light: null,
    params: { phi1: 30 * D, phi2: 60 * D }, domain: rect(-60, 90),
    forward: A.lambertConformalConic, derivation: 'lccFromCentral',
    formulaTex: '\\rho = F\\cot^{n}\\!\\left(\\tfrac{\\pi}{4}+\\tfrac{\\varphi}{2}\\right),\\quad \\theta = n\\lambda',
    captionKo: '두 표준위선(30°, 60°)을 지나는 할선 원뿔 + 정각 조건. 중위도 국가의 항공도·기상도에 쓰임.',
  },
  albers: {
    id: 'albers', nameKo: '알베르스 정적원추도법', family: 'conic', property: 'equalArea',
    surface: { type: 'cone' }, light: null,
    params: { phi1: 30 * D, phi2: 60 * D }, domain: rect(-90, 90),
    forward: A.albers, derivation: 'albersFromCentral',
    formulaTex: '\\rho = \\tfrac{\\sqrt{C-2n\\sin\\varphi}}{n},\\quad \\theta = n\\lambda',
    captionKo: '두 표준위선(30°, 60°) 할선 원뿔 + 정적 조건. 미국·유럽처럼 동서로 긴 지역의 통계 지도에 쓰임.',
  },

  // ---------------- 3.1 가전면 계열 · 평면 ----------------
  gnomonic: {
    id: 'gnomonic', nameKo: '심사도법', family: 'azimuthal', property: 'none',
    surface: { type: 'plane' }, light: { type: 'point', d: 0 },
    params: { d: 0 }, domain: perspectiveCap,
    forward: P.azimuthalPerspective, derivation: null,
    formulaTex: 'r = \\tan c',
    captionKo: '지구 중심의 빛이 접평면에 그린 지도. 모든 대권이 직선 → 최단 항로를 자로 그을 수 있음. 접점에서 60° 밖은 그릴 수 없음.',
  },
  stereographic: {
    id: 'stereographic', nameKo: '평사도법', family: 'azimuthal', property: 'conformal',
    surface: { type: 'plane' }, light: { type: 'point', d: 1 },
    params: { d: 1 }, domain: perspectiveCap,
    forward: P.azimuthalPerspective, derivation: null,
    formulaTex: 'r = 2\\tan\\tfrac{c}{2}',
    captionKo: '접점의 대척점에서 나온 빛이 접평면에 그린 지도. 빛 투영이면서도 정각. 극지방 지도·별자리 지도에 쓰임.',
  },
  orthographic: {
    id: 'orthographic', nameKo: '정사도법', family: 'azimuthal', property: 'none',
    surface: { type: 'plane' }, light: { type: 'point', d: Infinity },
    params: { d: Infinity }, domain: perspectiveCap,
    forward: P.azimuthalPerspective, derivation: null,
    formulaTex: 'r = \\sin c',
    captionKo: '무한히 먼 곳의 평행광이 접평면에 그린 지도 = 우주에서 본 지구. 반구만 보이고 가장자리가 눌림.',
  },
  azimuthalEquidistant: {
    id: 'azimuthalEquidistant', nameKo: '정거방위도법', family: 'azimuthal', property: 'equidistant',
    surface: { type: 'plane' }, light: null,
    params: { d: 1 }, domain: cap(179), lockParams: ['d'],
    forward: A.azimuthalEquidistant, derivation: 'azimuthalEquidistantFromStereo',
    formulaTex: 'r = c',
    captionKo: '접점에서의 거리와 방위가 모두 정확하도록 조정. 접점을 중심으로 온 세계를 한 원 안에 담음. UN 기의 지도 = 북극 중심 정거방위도법.',
  },
  lambertAzimuthalEA: {
    id: 'lambertAzimuthalEA', nameKo: '람베르트 정적방위도법', family: 'azimuthal', property: 'equalArea',
    surface: { type: 'plane' }, light: null,
    params: { d: 1 }, domain: cap(179.5), lockParams: ['d'],
    forward: A.lambertAzimuthalEA, derivation: 'lambertAzimuthalFromStereo',
    formulaTex: 'r = 2\\sin\\tfrac{c}{2}',
    captionKo: '면적이 정확하도록 반지름을 조정한 방위도법. 대륙·반구 단위의 통계 지도에 쓰임.',
  },

  // ---------------- 3.2 수학적 도법 ----------------
  sinusoidal: {
    id: 'sinusoidal', nameKo: '시뉴소이드 도법', family: 'pseudocylindrical', property: 'equalArea',
    surface: null, light: null, params: {}, domain: rect(-90, 90),
    forward: A.sinusoidal, derivation: 'sinusoidalFromLambert',
    formulaTex: 'x = \\lambda\\cos\\varphi,\\quad y = \\varphi',
    captionKo: '위선 간격은 등간격, 각 위선은 실제 길이(cos φ)로 축소 → 정적. 경선이 사인 곡선.',
  },
  mollweide: {
    id: 'mollweide', nameKo: '몰바이데 도법', family: 'pseudocylindrical', property: 'equalArea',
    surface: null, light: null, params: {}, domain: rect(-90, 90),
    forward: A.mollweide, derivation: 'mollweideFromLambert',
    formulaTex: '\\begin{gathered}2\\theta+\\sin 2\\theta = \\pi\\sin\\varphi\\\\[2pt] x = \\tfrac{2\\sqrt2}{\\pi}\\lambda\\cos\\theta,\\quad y = \\sqrt2\\sin\\theta\\end{gathered}',
    captionKo: '전체 외곽을 2:1 타원에 맞춘 정적도법. 보조각 θ 로 면적을 보존.',
  },
  eckert4: {
    id: 'eckert4', nameKo: '에케르트 IV 도법', family: 'pseudocylindrical', property: 'equalArea',
    surface: null, light: null, params: {}, domain: rect(-90, 90),
    forward: A.eckert4, derivation: 'eckert4FromLambert',
    formulaTex: '\\theta+\\sin\\theta\\cos\\theta+2\\sin\\theta = \\left(2+\\tfrac{\\pi}{2}\\right)\\sin\\varphi',
    captionKo: '극을 점이 아닌 선(적도의 절반)으로 표현한 정적도법. 고위도 대륙의 모양 왜곡이 덜함.',
  },
  equalEarth: {
    id: 'equalEarth', nameKo: 'Equal Earth 도법', family: 'pseudocylindrical', property: 'equalArea',
    surface: null, light: null, params: {}, domain: rect(-90, 90),
    forward: A.equalEarth, derivation: 'equalEarthFromLambert', modern: true,
    formulaTex: '\\begin{gathered}\\sin\\theta = \\tfrac{\\sqrt3}{2}\\sin\\varphi\\\\[2pt] y = A_1\\theta + A_2\\theta^3 + A_3\\theta^7 + A_4\\theta^9\\end{gathered}',
    captionKo: '2018년 발표된 정적도법. 로빈슨의 친숙한 외형을 다항식으로 흉내 내면서 면적은 정확히 지킴.',
  },
  robinson: {
    id: 'robinson', nameKo: '로빈슨 도법', family: 'pseudocylindrical', property: 'compromise',
    surface: null, light: null, params: {}, domain: rect(-90, 90),
    forward: A.robinson, derivation: 'robinsonFromEquirect', modern: true,
    formulaTex: 'x = 0.8487\\,X(\\varphi)\\,\\lambda,\\quad y = 1.3523\\,Y(\\varphi)',
    captionKo: '수식이 아니라 표로 정의된 절충 도법. 1963년 아서 로빈슨, 목표는 "보기 좋은 세계지도".',
  },
  winkelTripel: {
    id: 'winkelTripel', nameKo: '빈켈 트리펠 도법', family: 'modifiedAzimuthal', property: 'compromise',
    surface: null, light: null, params: { d: 1 }, domain: rect(-90, 90), defaultAspect: 'transverse',
    forward: A.winkelTripel, derivation: 'winkelFromBlend', modern: true,
    formulaTex: '\\begin{gathered}(x, y) = \\tfrac12\\left[\\,\\text{Aitoff}(\\lambda,\\varphi) + (\\lambda\\cos\\varphi_1,\\ \\varphi)\\,\\right]\\\\[2pt] \\varphi_1 = \\arccos\\tfrac{2}{\\pi} \\approx 50°28\'\\end{gathered}',
    captionKo: '아이토프 도법과 등장방형 도법의 산술평균. "트리펠" = 면적·각·거리 세 왜곡을 모두 조금씩 줄였다는 뜻. 1998년부터 내셔널 지오그래픽 세계지도.',
  },
  aitoff: {
    id: 'aitoff', nameKo: '아이토프 도법', family: 'modifiedAzimuthal', property: 'compromise', hidden: true,
    surface: null, light: null, params: { d: 1 }, domain: rect(-90, 90),
    forward: A.aitoff, derivation: null,
    formulaTex: '(x, y) = \\left(2\\,x_{\\mathrm{AE}}(\\tfrac{\\lambda}{2},\\varphi),\\ y_{\\mathrm{AE}}(\\tfrac{\\lambda}{2},\\varphi)\\right)',
    captionKo: '정거방위도법(적도 중심)에서 경도를 절반으로 압축한 뒤 가로를 2배로 늘린 도법.',
  },
  homolosine: {
    id: 'homolosine', nameKo: '호몰로사인(비단열)', family: 'pseudocylindrical', property: 'equalArea', hidden: true,
    surface: null, light: null, params: {}, domain: rect(-90, 90),
    forward: A.homolosine, derivation: null,
    formulaTex: '|\\varphi| \\le 40°44\': \\text{Sinusoidal},\\qquad |\\varphi| > 40°44\': \\text{Mollweide} - 0.0528',
    captionKo: '40°44′ 에서 시뉴소이드(저위도)와 몰바이데(고위도)를 접합한 정적도법. 아직 절개하지 않은 상태.',
  },
  goodeHomolosine: {
    id: 'goodeHomolosine', nameKo: '구드 호몰로사인 도법', family: 'interrupted', property: 'equalArea',
    surface: null, light: null, params: {}, domain: { ...rect(-90, 90), cuts: A.GOODE_CUTS },
    forward: A.goodeHomolosine, derivation: 'goodeFromParts',
    formulaTex: '\\begin{gathered}|\\varphi| \\le 40°44\': \\text{Sinusoidal},\\quad |\\varphi| > 40°44\': \\text{Mollweide}-0.0528\\\\[2pt] x = \\lambda_0 + x\\!\\left(\\lambda-\\lambda_0,\\ \\varphi\\right)\\ \\ (\\lambda_0 = \\text{로브 중앙경선})\\end{gathered}',
    captionKo: '시뉴소이드(저위도)와 몰바이데(고위도)를 40°44′ 에서 접합하고, 대양을 따라 6개 로브로 찢은 정적도법. 1923년 J. 폴 구드. 대륙 모양을 살린 세계 주제도의 단골.',
  },
};

/** 도법 선택기용 그룹 */
export const PICKER_GROUPS = [
  { labelKo: '요즘 세계지도에 쓰이는 도법', ids: ['robinson', 'winkelTripel', 'equalEarth'] },
  { labelKo: '원통', ids: ['centralCylindrical', 'lambertCylindricalEA', 'equirectangular', 'mercator', 'miller', 'transverseMercator'] },
  { labelKo: '원뿔', ids: ['centralConic', 'equidistantConic', 'lambertConformalConic', 'albers'] },
  { labelKo: '평면', ids: ['gnomonic', 'stereographic', 'orthographic', 'azimuthalEquidistant', 'lambertAzimuthalEA'] },
  { labelKo: '의사원통', ids: ['sinusoidal', 'mollweide', 'eckert4', 'equalEarth', 'robinson'] },
  { labelKo: '변형 방위', ids: ['winkelTripel'] },
  { labelKo: '단열', ids: ['goodeHomolosine'] },
];

/** 항목의 domain 을 params 로 평가 */
export function domainOf(entry, params) {
  return typeof entry.domain === 'function' ? entry.domain(params) : entry.domain;
}

/** 빛 투영 도법 목록(surface 와 light 가 모두 있는 것) */
export function lightProjections() {
  return Object.values(PROJECTIONS).filter((e) => e.surface && e.light);
}
