// Contact shading only: no vertex positions or projection calculations.
import * as THREE from 'three';
import { frame, getState } from '../state.js';

export const contactGLSL = `
  uniform vec2 contactHeights;
  uniform float contactEnabled;
  uniform float contactPlane;
  float contactDistance(vec3 p) {
    if (contactPlane > 0.5) return length(p.xy);
    return min(abs(p.y - contactHeights.x), abs(p.y - contactHeights.y));
  }
`;

export function contactUniforms() {
  return {
    contactHeights: { value: new THREE.Vector2() },
    contactEnabled: { value: 0 },
    contactPlane: { value: 0 },
  };
}

export function updateContact(uniforms) {
  const fr = frame(), s = getState(), p = fr.params;
  const plane = fr.surface.type === 'plane';
  const attached = s.stage === 'project' || (s.stage === 'wrap' && s.t >= 0.25) || s.stage === 'unroll';
  uniforms.contactEnabled.value = attached && fr.bendT > 0.999 &&
    !(plane && s.stage === 'project' && s.t >= 0.82) ? 1 : 0;
  uniforms.contactPlane.value = plane ? 1 : 0;
  const a = fr.surface.type === 'cylinder' ? -(p.phi0 || 0) : (p.phi1 || 0);
  const b = fr.surface.type === 'cylinder' ? (p.phi0 || 0) : (p.phi2 ?? a);
  uniforms.contactHeights.value.set(Math.sin(a), Math.sin(b));
}
