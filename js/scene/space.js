import * as THREE from 'three';

/** Static sky: generated once, no star geometry or per-frame animation. */
export function installSpaceBackground(scene) {
  if (!scene?.isScene) return;
  const canvas = document.createElement('canvas');
  canvas.width = 2048; canvas.height = 1152;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#060c19';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const haze = ctx.createRadialGradient(1230, 430, 20, 1230, 430, 1050);
  haze.addColorStop(0, '#142a40');
  haze.addColorStop(0.45, '#0d192d');
  haze.addColorStop(1, '#060c19');
  ctx.fillStyle = haze;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  let seed = 731;
  const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < 480; i++) {
    const x = random() * canvas.width, y = random() * canvas.height;
    const bright = random(), radius = bright > 0.97 ? 1.35 : 0.35 + random() * 0.55;
    ctx.fillStyle = `rgba(205,224,245,${0.16 + bright * 0.48})`;
    ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
    if (bright > 0.97) {
      const glow = ctx.createRadialGradient(x, y, 0, x, y, 5);
      glow.addColorStop(0, 'rgba(179,213,248,0.2)');
      glow.addColorStop(1, 'rgba(179,213,248,0)');
      ctx.fillStyle = glow; ctx.fillRect(x - 5, y - 5, 10, 10);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  scene.background = texture;
}
