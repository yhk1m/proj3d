// © 2026 김용현
// ui/graphLayout.js — 간격 함수 그래프(spacingGraph)의 글자 배치. 순수 함수라 Node 검증(tests/suite.js)에서 겹침을 확인한다.
//
// 캔버스에 그리기 전에 축 이름·눈금·범례의 글자 상자를 모두 계산한다. 그리기(sidePanel.js)는 이 결과만 따른다.
// 줄 구성(위→아래): [세로축 이름 + 범례] / 그래프(왼쪽 여백에 최댓값·최솟값) / [눈금] / [가로축 이름].
// 글자끼리 같은 줄을 나눠 쓰지 않으므로 값이 바뀌어도 겹치지 않는다.

export const GRAPH_FONT_PX = 11;
const ASCENT = 9;   // 11px 글꼴의 대략적인 어센트
const DESCENT = 2;
const EDGE = 2;     // 캔버스 가장자리 최소 여백

/**
 * @param {object} o
 * @param {number} o.W 캔버스 폭
 * @param {number} o.H 캔버스 높이
 * @param {string} o.xLabel 가로축 이름
 * @param {string} o.yLabel 세로축 이름
 * @param {number[]} o.ticks 가로 눈금 값(도)
 * @param {number} o.x0 가로 범위 시작
 * @param {number} o.x1 가로 범위 끝
 * @param {number} o.ymin 세로 범위 아래
 * @param {number} o.ymax 세로 범위 위
 * @param {{label:string,color:string}[]} o.legend 범례
 * @param {(text:string)=>number} o.measure 글자 폭(px) 측정
 * @returns {{
 *   pad: {l:number,r:number,t:number,b:number},
 *   px: (x:number)=>number, py: (y:number)=>number,
 *   texts: Array<{role:string,text:string,x:number,y:number,align:'left'|'center'|'right',left:number,top:number,w:number,h:number,color?:string}>,
 *   swatches: Array<{x:number,y:number,w:number,h:number,color:string}>,
 * }}
 */
export function layoutSpacingGraph({ W, H, xLabel, yLabel, ticks, x0, x1, ymin, ymax, legend, measure }) {
  const titleY = 12;                       // 맨 윗줄(세로축 이름·범례) 기준선
  const pad = { l: 38, r: 10, t: titleY + 12, b: 36 };
  const tickY = H - pad.b + 15;            // 눈금 줄 기준선
  const xLabelY = H - 6;                   // 맨 아랫줄(가로축 이름) 기준선
  const px = (x) => pad.l + ((x - x0) / (x1 - x0)) * (W - pad.l - pad.r);
  const py = (y) => H - pad.b - ((y - ymin) / (ymax - ymin)) * (H - pad.t - pad.b);
  const texts = [];
  const swatches = [];
  const add = (role, text, x, y, align = 'left', color) => {
    const w = measure(text);
    let left = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
    // 캔버스 밖으로 나가면 안쪽으로 밀어 넣는다(마지막 눈금 등)
    if (left + w > W - EDGE) left = W - EDGE - w;
    if (left < EDGE) left = EDGE;
    texts.push({ role, text, x: left, y, align: 'left', left, top: y - ASCENT, w, h: ASCENT + DESCENT, color });
  };
  // 윗줄: 세로축 이름, 그 오른쪽에 범례
  add('yLabel', yLabel, 4, titleY);
  let lx = Math.max(pad.l + 6, 4 + measure(yLabel) + 12);
  for (const l of legend) {
    swatches.push({ x: lx, y: titleY - 6, w: 14, h: 3, color: l.color });
    add('legend', l.label, lx + 18, titleY, 'left', l.color);
    lx += 18 + measure(l.label) + 14;
  }
  // 왼쪽 여백: 세로 범위 값
  add('ymax', ymax.toFixed(1), 4, py(ymax) + 4);
  add('ymin', ymin.toFixed(1), 4, py(ymin) + 4);
  // 눈금 줄
  for (const tx of ticks) add('tick', `${tx}°`, px(tx), tickY, 'center');
  // 맨 아랫줄: 가로축 이름(오른쪽 정렬)
  add('xLabel', xLabel, W - pad.r, xLabelY, 'right');
  return { pad, px, py, texts, swatches };
}
