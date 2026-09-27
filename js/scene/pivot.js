// © 2026 김용현
// scene/pivot.js — 회전 중심(OrbitControls target) 표시, 더블클릭(마우스)·두 번 탭(터치)으로 옮기기.
// e-GIS 3D 와 같은 방식: 빨간 점을 항상 맨 위에, 화면상 크기 일정. 옮기면 카메라는 제자리에서 새 중심을 바라봄.
import * as THREE from 'three';
import { isDoubleTap } from '../util/doubleTap.js';

export class PivotMarker {
  constructor() {
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xff3b30, depthTest: false, depthWrite: false, transparent: true, opacity: 0.9 }),
    );
    this.mesh.renderOrder = 999;
    this.mesh.frustumCulled = false;
  }

  /** 매 프레임: 중심으로 옮기고 카메라 거리에 비례해 크기를 바꿔 화면상 크기를 일정하게 */
  update(camera, target) {
    this.mesh.position.copy(target);
    this.mesh.scale.setScalar(Math.max(camera.position.distanceTo(target) / 150, 1e-3));
  }
}

/** 자신과 조상이 모두 보이는지 */
function shown(o) {
  for (let x = o; x; x = x.parent) if (!x.visible) return false;
  return true;
}

/**
 * canvas 더블클릭·두 번 탭 → getTargets() 메시에 레이캐스트 → 맞은 점을 onPick(Vector3) 로.
 * 빈 공간이면 아무 일 없음.
 */
export function installPivotPicking(canvas, camera, getTargets, onPick) {
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const pick = (clientX, clientY) => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects(getTargets().filter(shown), false)[0];
    if (hit) onPick(hit.point.clone());
  };
  canvas.addEventListener('dblclick', (e) => pick(e.clientX, e.clientY));
  let lastTap = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch' || !e.isPrimary) return;
    const tap = { t: e.timeStamp, x: e.clientX, y: e.clientY };
    if (isDoubleTap(lastTap, tap)) { lastTap = null; pick(e.clientX, e.clientY); } else lastTap = tap;
  });
}
