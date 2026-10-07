import * as THREE from '../vendor/three/three.module.js';
import { mmToScene } from './config.mjs?v=1.2.9';

// Millimetre-sized, crowned thread dashes share one mesh per seam. Rounded
// cross-sections catch the studio light without a draw call per stitch.
export function sewnThreadGeometry(length, surface, { pitch = 4.4, maxCount = 110, width = .8, rounded = true } = {}) {
  const positions = [], uv = [], indices = [];
  const step = Math.max(pitch, length / maxCount), threadLength = Math.min(2.8, step * .7);
  const columns=rounded?2:1, stride=columns+1;
  for (let start = .6; start + threadLength < length; start += step) {
    const base = positions.length / 3;
    let outward;
    for (let j = 0; j <= 1; j++) for (let i = 0; i <= columns; i++) {
      const along = j, across = i / columns;
      const p = surface(start + along * threadLength, (across - .5) * width);
      outward = new THREE.Vector3(p.nx || 0,p.ny || 0,p.nz ?? 1);
      const rise = .12 + Math.sin(Math.PI * across) * .26;
      positions.push(mmToScene(p.x + (p.nx || 0) * rise), mmToScene(p.y + (p.ny || 0) * rise),
        mmToScene(p.z + (p.nz ?? 1) * rise));
      uv.push(mmToScene(start + along * threadLength), mmToScene(across * width));
    }
    const vertex=index=>new THREE.Vector3().fromArray(positions,index*3);
    const reverse=vertex(base+1).sub(vertex(base)).cross(vertex(base+stride).sub(vertex(base))).dot(outward)<0;
    for (let i = 0; i < columns; i++) {
      const a = base + i, b = a + 1, c = a + stride, d = c + 1;
      if(reverse)indices.push(a,c,b,b,c,d);else indices.push(a,b,c,b,d,c);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals(); geometry.computeBoundingBox();
  return geometry;
}
