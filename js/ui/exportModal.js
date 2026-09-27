// © 2026 김용현
// ui/exportModal.js — PNG 저장 모달: 미리보기 + 채우기 · 색 반전 · 경위선, 저장은 긴 변 3000 px 투명 배경 PNG.
// 그리는 지도 = 지금 종이에 그려진 모양(state.frame() 의 f · domain · rotation), 카메라와 무관한 정면.
import { prepareMapData, buildMapVector } from '../export/mapVector.js';
import { drawMapVector, layoutFor, LONG_SIDE } from '../export/drawMap.js';

const KEY = 'proj3d.export';
const PREVIEW_SIDE = 520;
const DEFAULTS = { fill: true, invert: false, graticule: true };

function loadOpts() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch (e) { return { ...DEFAULTS }; }
}
function saveOpts(o) {
  try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) { /* 저장 불가 환경 */ }
}
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
const safeName = (s) => s.replace(/[\\/:*?"<>|]/g, '_');

export function createExportModal({ landTopo, getFrame }) {
  let data = null, vec = null, fileName = 'map';
  const opts = loadOpts();

  const backdrop = el('div', 'modal-backdrop');
  const box = el('div', 'modal');
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', 'PNG 저장');
  const title = el('h3', null, 'PNG 저장');
  const preview = el('div', 'modal-preview');
  const canvas = el('canvas');
  preview.appendChild(canvas);
  const optsBox = el('div', 'modal-opts');
  const mk = (key, label) => {
    const wrap = el('label', 'ctl ctl-toggle');
    const input = el('input');
    input.type = 'checkbox';
    input.checked = opts[key];
    input.addEventListener('change', () => { opts[key] = input.checked; saveOpts(opts); drawPreview(); });
    wrap.append(input, el('span', 'ctl-label', label));
    optsBox.appendChild(wrap);
  };
  mk('fill', '채우기');
  mk('invert', '색 반전');
  mk('graticule', '경위선');
  const note = el('p', 'modal-note');
  const actions = el('div', 'modal-actions');
  const cancel = el('button', 'chip', '취소');
  cancel.type = 'button';
  const save = el('button', 'chip on', '저장');
  save.type = 'button';
  actions.append(cancel, save);
  box.append(title, preview, optsBox, note, actions);
  backdrop.appendChild(box);
  document.body.appendChild(backdrop);

  const close = () => backdrop.classList.remove('open');
  cancel.addEventListener('click', close);
  backdrop.addEventListener('pointerdown', (e) => { if (e.target === backdrop) close(); });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && backdrop.classList.contains('open')) close(); });

  // drawMapVector 는 캔버스 크기가 이미 L.width × L.height 여야 한다 — 크기를 먼저 정한다.
  function render(cv, side) {
    const L = layoutFor(vec.bbox, side);
    cv.width = L.width;
    cv.height = L.height;
    drawMapVector(cv.getContext('2d'), vec, opts, L, side);
  }

  function drawPreview() {
    if (!vec) return;
    render(canvas, PREVIEW_SIDE);
    const full = layoutFor(vec.bbox, LONG_SIDE);
    note.textContent = `저장 크기 ${full.width} × ${full.height} px · 지도 밖은 투명 · 색은 #000000 · #ffffff 두 가지`;
  }

  save.addEventListener('click', () => {
    if (!vec) return;
    const cv = document.createElement('canvas');
    render(cv, LONG_SIDE);
    cv.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${safeName(fileName)}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      close();
    }, 'image/png');
  });

  return {
    open() {
      if (!data) data = prepareMapData(landTopo);
      const fr = getFrame();
      fileName = fr.entry.nameKo;
      vec = buildMapVector(fr, data, { graticule: true });
      const ok = vec.sea.length > 0 && Number.isFinite(vec.bbox.minX);
      save.disabled = !ok;
      backdrop.classList.add('open');
      if (ok) drawPreview();
      else { vec = null; canvas.width = 0; canvas.height = 0; note.textContent = '이 단계에서는 그릴 지도가 없음'; }
      save.focus();
    },
  };
}
