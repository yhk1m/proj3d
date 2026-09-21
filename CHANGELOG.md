# CHANGELOG

## 2026-09-21 — 단계 B (Claude Code + Claude Fable 5.1): M1~M5 본 구현

단계 A(시안)는 생략하고 B 부터 시작했다. PLAN.md 6장의 파이프라인 `B_t( f( R(λ, φ) ) )` 를 그대로 구현했고,
`npm test`(Node)와 `tests/verify.html`(브라우저) 모두 **86 / 86 통과**.

### 만든 파일

| 경로 | 요약 |
|---|---|
| `index.html`, `css/style.css` | import map(three 0.186.0, d3-geo 3.1.1, d3-geo-projection 4.0.0, topojson-client 3.1.0, katex 0.18.7 — 모두 버전 고정), 네이비 테마, 모바일에서 측면 패널 → 하단 시트 |
| `data/land-110m.json`, `data/countries-110m.json` | world-atlas 2.0.2 사본. countries 는 그린란드:아프리카 면적비 계산용(PLAN 은 land 만 언급) |
| `js/main.js` | 부트스트랩, 씬 그래프(지구본 그룹 / 프레임 그룹(Mᵀ 회전) / 이동 그룹), 카메라 연출, 티소 hover, 렌더 루프 |
| `js/state.js` | 상태 머신(flat→wrap→project→unroll→adjust[k]), 진행도 t, 재생·역재생·자동재생, URL 쿼리 동기화, 파생값 `frame()` |
| `js/projections/registry.js` | 3장 목록 전부(구드 제외) + 숨김 항목 `aitoff`. 스키마에 `formulaTex`, `defaultAspect`, `lockParams`, `modern`, `hidden` 추가. `domain` 은 객체 또는 `params → domain` 함수, `kind: 'rect' \| 'cap'` 포함 |
| `js/projections/perspective.js` | 빛 투영 forward: 중심원통, 람베르트 정적원통(축 수평광), 중심원추(원뿔 가족 통합), 방위 원근(d 매개, 심사·평사·정사) |
| `js/projections/adjusted.js` | d3 raw 래핑: 메르카토르·등장방형·밀러(φ₀ 축척), 원추 3종(y 오프셋 관례 변환), 방위 2종, 의사원통 4종, 로빈슨(×0.8487), 빈켈·아이토프 |
| `js/projections/derivations.js` | 시나리오 14개 + 모핑 평가(`lerp`, `equalAreaFamily`, `custom`), 도메인 보간, 단계 체인(`endOfStep`, `stepProjection`) |
| `js/projections/robinsonTable.js`, `distortion.js` | 9.4 표(19행), h·k·면적배율·최대각왜곡 수치 미분 |
| `js/geometry/rotate.js` | aspect 회전 R. 프레임 규칙: +Z = 지도 중심 C, +Y = 가전면 축(북에서 ψ 회전), M 행렬·역행렬·쿼터니언용 Mᵀ |
| `js/geometry/bend.js` | B_t (원통·원뿔·평면), 법선, 원뿔 가족 기하(`coneGeometry`), FLAT 오프셋 |
| `js/geometry/clip.js` | 해안선·경위선·티소 원 생성, d3 `geoClipAntimeridian` 스트림으로 회전+절개, 국가 폴리곤·지도상 면적 |
| `js/geometry/pipeline.js` | **6.1 합성의 유일한 구현** `positionOf(ctx, λ', φ')`, 도메인 판정, (u,v) 매개화, 광선 도달 거리 |
| `js/scene/globe.js` | 지구본(런타임 육지 마스크 canvas 2048×1024, 15° 경위선, 불투명도 1→0.35) |
| `js/scene/paper.js` | 종이 = 도메인 격자의 상(像). 인덱스 없는 삼각형 버퍼로 NaN 정점 삼각형 퇴화 처리 |
| `js/scene/mapLayer.js` | 2° 격자 메시(프래그먼트 셰이더에서 Mᵀ 역회전 후 마스크 샘플링) + 해안선·경위선 LineSegments, 광선색→잉크색 정점색 |
| `js/scene/rays.js`, `tissot.js` | 15° 교점 광선(가산 블렌딩) + 내핵(발광 구·PointLight·글로우 스프라이트·축광원용 막대), 티소 지표 + 화면 좌표 pick |
| `js/ui/*.js` | picker(그룹 + "요즘 세계지도" 바로가기), controls(축·표준위선·접선/할선·광원 d·티소·비교·자동재생·저사양·프로젝터·링크 복사), stepper(단계 버튼·스크러버·재생·키보드 ←/→/스페이스·"조정 단계부터 보기"), sidePanel(자막·KaTeX·spacingGraph·robinsonTable·blend·areaRatio), compare(겹쳐 보기·면적비) |
| `js/util/tween.js` | 자체 트윈·이징(gsap 미사용) |
| `tests/suite.js`, `tests/verify.html`, `tests/run.mjs` | 12장 항목 1~6 + 회전·절개·시나리오 연결·면적비. `npm test` 로 Node 에서도 실행 |
| `package.json` | 빌드 없음. devDependencies 는 Node 테스트용 |

### PLAN.md 와 다르게 정한 것 (문서에도 반영함 — 5장, 6.4)

1. **`js/geometry/pipeline.js` 추가.** 6.1 합성을 한 곳에 두기 위해서다(구조 변경이 아니라 구조의 구현 위치).
2. **평면(방위)의 프레임 관례**: 접점을 프레임 **+Z** (λ'=0, φ'=0) 에 둔다. 그래서 방위 forward 는 d3 raw 와 같은 '적도 중심' 꼴이고, 정축(극)은 aspect 회전(C = 북극)으로 만든다. 빈켈 시나리오처럼 방위 root 에서 전세계 도법으로 이어지는 체인이 같은 프레임 안에서 성립한다.
3. **원추의 종이 좌표 관례**: y = ρ(α) − ρ cos θ (α = 표준위선 중간). d3 는 ρ(0). 기준 위선을 y = 0 에 두어야 φ₀ → 90°(평면), 0°(원통) 극한이 연속이라 φ₀ 슬라이더 연속 변형이 된다. 검증은 y 오프셋을 빼고 d3 와 비교(< 1e-6).
4. **d3 대응이 없는 도법**(중심원통, 중심원추)은 닫힌 식과 비교. 평사도법은 d3 가 중심 통과 평면(½ 배)이라 ×2 로 비교. 로빈슨은 정의 축척 0.8487 로 나눠 비교. 횡축 메르카토르는 d3 가 축을 바꿔 그리므로 (y, −x) 로 비교.
5. **람베르트 정적원통의 φ₀ 를 0 으로 잠금**(`lockParams`). 할선 원통에서는 y = sin φ 가 정적이 아니므로 빛 투영으로 성립하지 않는다.
6. **횡축 프리셋**: 원통·원뿔은 127°E 자오선(우리나라 TM), 평면은 (0°, 0°) 적도 접점. 사축은 서울(127°E, 37.5°N).
7. **표시용 구 반지름 0.992**: 반지름 1 로 씌운 종이와 접선에서 z-fighting 하지 않게. 수학은 모두 단위구.
8. **M6 일부 선반영**: 시뉴소이드·몰바이데·에케르트 IV 는 `equalAreaFamily` 하나로 끝나 함께 넣었다. 구드(로브 분리·절개 모핑)는 미구현.
9. **M7 일부 선반영**: 키보드 조작, URL 공유, 프로젝터 모드(큰 글씨·고대비·전체화면), 자동 재생, 저사양 모드(격자·광선 절반, DPR 1). 60fps 측정은 안 했다.
10. **로빈슨 단계 ②③** 은 표 값 보간에 d3 의 2차 보간(`geoRobinsonRaw`)을 쓴다. 표 값 자체는 PLAN 표와 일치함을 검증했다.
11. 빈켈 root(평사도법, 적도 중심)의 1~4단계는 각거리 120° 모자만 보인다. 조정 ① 에서 정거방위(179°)로 넓어지며 온 세계가 들어온다.
12. **격자 메시 셰이더의 varying 은 (λ', φ') 가 아니라 프레임 단위벡터**다. 각도를 보간하면 모자(cap) 매개화의 뒷반구 자오선(λ' = ±180°)을 걸치는 삼각형에서 엉뚱한 경도를 샘플링해 검은 줄이 생긴다(적도 중심 평사도법에서 확인). 벡터 보간은 연속이라 문제없고, 8.4 의 "프래그먼트에서 역회전" 원칙은 그대로다.

### 다음 작업자에게

**단계 C(Codex, `visual-polish`) 범위:** `js/scene/*.js`, `css/`, `js/util/tween.js`, `index.html` 마크업·스타일. `js/projections/`, `js/geometry/`, `js/state.js`, `tests/` 는 읽기 전용.

- 광선·글로우: 지금은 1px `LineSegments` + 가산 블렌딩. 프로젝터에서 얇다. `Line2`(fat lines) 등으로 굵기 조절 권장. 광선 끝점은 `pipeline.positionOf` 결과를 그대로 쓴다(바꾸지 말 것).
- 종이 재질: `MeshLambertMaterial` 미색 + 매 프레임 `computeVertexNormals`(플랫 셰이딩). 종이 질감·양면 색 구분은 자유.
- 새겨지는 효과: 선 정점색(광선색→잉크색, `sv` 0.85~1 구간)과 격자 셰이더의 `arrive` 로만 구현돼 있다. 더 강한 연출(번짐·잔광)은 셰이더에서.
- 카메라: `main.js` 의 `fitDefaultView`/`fitFlatView`. 펼친 뒤 지구본을 좌측 상단으로 옮길 때 종이 평면을 관통하며 지나간다(경로를 앞쪽으로 우회시키면 됨).
- FLAT 단계에서 원통·평면 종이는 지구본 오른쪽(반폭 + 1.3), 원뿔 부채꼴은 꼭짓점 높이 위 0.9 에서 내려온다. 횡축·사축에서는 프레임 기준이라 화면상 위치가 달라 보일 수 있다.
- 지구본 그래티큘은 반지름 0.996, 종이 위 지도 선은 법선 방향 +0.004, 격자 메시 +0.002, 티소 +0.006. z-fighting 이 보이면 이 값과 `polygonOffset` 을 조정.
- `?instant=1` 을 붙이면 카메라·지구본 트윈이 즉시 끝난다(스크린샷 검증용). `?dev=1` 은 공선성 assert 를 켠다(콘솔).

**단계 D(M6~M7) 남은 일:**
- 구드 호몰로사인: 레지스트리 항목 + `goodeFromParts` 시나리오(로브별 forward, `custom` 모핑), 격자 메시 로브 단위 분리, 절개선 재분할, `lobes` 패널.
- M7 완료 기준 측정: 1080p 프로젝터 60fps, 중급 모바일 30fps. 느리면 10장 5번(두 끝점 attribute + 버텍스 셰이더 lerp/B_t)으로.
- 모바일 터치 검증(하단 시트 CSS 만 있음).
- 배포: GitHub Pages + `CNAME`(서브도메인 미정이라 파일을 만들지 않았다).

**알려진 문제**
- 조정 단계에서 도메인 kind 가 cap→rect 로 바뀌는 순간(빈켈 ②) 격자 메시가 재생성되어 한 프레임 튄다.
- 로빈슨 표 행 강조는 위선을 24점으로 근사해 화면 거리로 고르므로 확대 상태에서는 둔하다.
- 헤드리스 Chrome(SwiftShader)으로만 화면을 확인했다. 실제 GPU 에서 선 두께·블렌딩이 다를 수 있다.
