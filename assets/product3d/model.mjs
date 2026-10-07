import * as THREE from '../vendor/three/three.module.js';
import { sewnThreadGeometry } from './sewing.mjs?v=1.2.4';
import { mmToScene, getProductProfile } from './config.mjs?v=1.2.4';
import { addBagOptions, getInnerPocketLayout, innerPocketHalfWidth, innerPocketContourVisible,
  innerPocketRegion, innerPocketBindingDistance } from './options-model.mjs?v=1.2.4';

// Shape coordinates are millimetres until a vertex is written. Width, depth,
// webbing width/thickness and print size never depend on an Object3D scale.
const BODY_COLUMNS = 32;
const BODY_ROWS = 28;
const SIDE_COLUMNS = 22;
const LOOP_SEGMENTS = 56;
const INNER_OFFSET = 1.3;
const innerPocketShapes = new WeakMap();

function shape(config) {
  const { width, height, depth } = config.dimensions;
  const profile = getProductProfile(config);
  const construction = profile.construction || (profile.id === 'daily' ? 'gusset' : 'sample');
  const panelHeight = profile.supportsBottomPanel ? config.bottomPanel.height : 0;
  const handle = config.handle;
  for (const [name, value] of Object.entries({ width, height, depth,
    handleWidth: handle.width, handleThickness: handle.thickness,
    handleDrop: handle.drop, handleGap: handle.gap })) {
    if (!Number.isFinite(value) || value <= 0) throw new RangeError(`Invalid bag dimension: ${name}`);
  }
  if (!Number.isFinite(panelHeight) || panelHeight < 0) throw new RangeError('Invalid bottom-panel height.');
  if (panelHeight >= height) throw new RangeError('Bottom panel must be shorter than the body.');
  return { width, height, depth, panelHeight, handle, profile, construction,
    sample:construction==='sample', flat:['flat','pouch-flat'].includes(construction)||(construction==='poly'&&profile.nominalDepth===0),
    pouch:['pouch-flat','pouch-gusset','tumbler'].includes(construction),
    pouchTaperMm:construction==='pouch-gusset'?Math.min(25,depth*.42,width*.15):0,
    poly:construction==='poly', supportsHandles:profile.supportsHandles!==false };
}

function sliceAt(y, s) {
  const v = THREE.MathUtils.clamp(y / s.height, 0, 1);
  const corner = Math.min(12, s.height * 0.035, s.depth * 0.09);
  const bottomT = Math.min(1, Math.max(0, y / corner));
  const inset = corner * (1 - Math.sqrt(Math.max(0, 1 - (1 - bottomT) ** 2)));
  const daily = !s.sample;
  const foldDepth = Math.min(s.depth / 2, s.height * 0.2, s.width * 0.2);
  const foldT = THREE.MathUtils.clamp(1 - y / foldDepth, 0, 1);
  const folded = foldT * foldT * (3 - 2 * foldT);
  // The bottom-gusset pouch narrows over its full side seam; the tumbler
  // and tote templates retain their separate folded lower-corner shapes.
  const taper = s.pouchTaperMm ? s.pouchTaperMm*(1-v) : daily
    ? (s.flat ? Math.min(5,s.width*.018) : Math.max(0, foldDepth - corner)) * folded
    : (1 - v) * Math.min(20, s.width * 0.042);
  const a = s.width / 2 - taper - inset;
  const puff = Math.sin(Math.PI * v) * Math.min(s.poly?3:7, s.depth * 0.04);
  const mouthT = THREE.MathUtils.clamp((v - 0.72) / 0.28, 0, 1);
  const mouthPinch = mouthT * mouthT * (3 - 2 * mouthT);
  const openingT=THREE.MathUtils.clamp(y/(s.height*.3),0,1);
  const flatSpread=s.flat?.18+.82*openingT*openingT*(3-2*openingT):1;
  const closeMouth=s.pouch&&!s.supportsHandles?1-.78*mouthPinch:daily?1-.35*mouthPinch:1;
  const b = Math.max(s.flat?1.85:2,(s.depth / 2 - puff - s.depth * 0.075 * Math.abs(v - 0.5) - inset * 0.6)
    * closeMouth * flatSpread);
  let r = daily ? Math.min(s.depth * 0.46, s.width * 0.16, b * 0.94)
    : Math.min(17, s.depth * 0.12, s.width * 0.045, b * 0.45);
  // The tumbler photograph mounts its narrow tape close to the mouth ends.
  // Open only the upper corners; its deep folded bottom keeps its own shape.
  if(s.construction==='tumbler'){
    const attachmentTop=s.height-(s.profile.handleAttachmentDepth||25)-s.handle.thickness;
    const opening=THREE.MathUtils.smoothstep(y,Math.max(0,attachmentTop-Math.min(80,s.height*.4)),attachmentTop);
    r=THREE.MathUtils.lerp(r,Math.min(r,5),opening);
  }
  return { a, b, r, puff, v, mouthPinch };
}

function bottomLift(x,s,sideT=null) {
  if(s.sample)return 0;
  const bottom=sliceAt(0,s),half=Math.max(1,bottom.a-bottom.r);
  const edge=Math.min(s.height*.035,s.depth*.08+2)*Math.min(1,(Math.abs(x)/half)**2);
  const gusset=sideT===null?0:Math.sin(Math.PI*sideT)**2*Math.min(s.height*.02,s.depth*.12);
  return edge+gusset;
}

function drapedRowPoint(fraction,rawY,s,front=true,side=false,inset=0) {
  if(s.sample){
    if(side)return sidePoint(fraction,rawY,s,front,inset);
    const {a,r}=sliceAt(rawY,s);return panelPoint((fraction*2-1)*(a-r),rawY,s,front,inset);
  }
  const foldHeight=Math.min(s.height*.24,s.depth*.65+12);
  const fade=Math.max(0,1-rawY/foldHeight)**2;
  let y=rawY,p;
  for(let step=0;step<5;step++){
    if(side)p=sidePoint(fraction,y,s,front,inset);
    else {const {a,r}=sliceAt(y,s);p=panelPoint((fraction*2-1)*(a-r),y,s,front,inset);}
    y=rawY+bottomLift(p.x,s,side?fraction:null)*fade;
  }
  if(side)return sidePoint(fraction,y,s,front,inset);
  const {a,r}=sliceAt(y,s);return panelPoint((fraction*2-1)*(a-r),y,s,front,inset);
}

function panelPoint(x, y, s, front = true, inset = 0) {
  const { a, b, r, puff, v } = sliceAt(y, s);
  const t = THREE.MathUtils.clamp(x / Math.max(1, a - r), -1, 1);
  const edgeFade = (1 - t * t) ** 2;
  const wrinkle = Math.sin(t * Math.PI * 3) * Math.sin(v * 2.5) * Math.sin(Math.PI * v) * edgeFade * (s.poly?.25:.65);
  const z = Math.min(s.depth / 2, b + puff * (1 - t * t) + wrinkle) - inset;
  return { x, y, z: front ? z : -z };
}

function printableBodyPoint(x, y, s, front = true) {
  const p = panelPoint(x, y, s, front);
  // The daily tote's print may reach the rounded front corner, but should
  // never bridge empty space outside the folded bottom silhouette.
  if (!s.sample) {
    p.visible=y>=bottomLift(x,s)&&y<=s.height;
    const { a, b, r } = sliceAt(y, s);
    if (Math.abs(x) > a - r) {
      // The recessed gusset is not a rigid quarter circle. Resolve the actual
      // front-most contour at this physical X so artwork hugs the folded side.
      const samples = [];
      for (let i = 0; i <= 40; i++) {
        const t = front ? i / 80 : 1 - i / 80;
        samples.push({ t, point:sidePoint(t,y,s,x >= 0) });
      }
      const outerLimit = Math.max(...samples.map(sample => Math.abs(sample.point.x)));
      p.visible = p.visible && Math.abs(x) <= outerLimit - 0.65;
      for (let i = 1; i < samples.length; i++) {
        const previous=samples[i-1], next=samples[i];
        if (Math.abs(previous.point.x) <= Math.abs(x) && Math.abs(next.point.x) >= Math.abs(x)) {
          let lo=previous.t, hi=next.t;
          for(let step=0;step<16;step++){
            const mid=(lo+hi)/2, candidate=sidePoint(mid,y,s,x>=0);
            if(Math.abs(candidate.x)<Math.abs(x))lo=mid;else hi=mid;
          }
          const at=sidePoint((lo+hi)/2,y,s,x>=0);
          p.z=at.z;
          p.visible=p.visible&&y>=bottomLift(at.x,s,(lo+hi)/2);
          break;
        }
      }
    }
  }
  return p;
}

function printablePoint(x, y, s, config, front = true) {
  const p = printableBodyPoint(x, y, s, front);
  const pocket = front && s.profile.supportsPocket && config.options?.pocket && config.pocket;
  if (pocket && Math.abs(x) <= pocket.width / 2 && y >= pocket.bottom && y <= pocket.bottom + pocket.height) {
    const u = x / pocket.width + 0.5, v = (y - pocket.bottom) / pocket.height;
    p.z += 1.4 + Math.sin(Math.PI * u) * Math.sin(Math.PI * v) * 2.5;
  }
  return p;
}

// The same function drives the cloth and a separate conforming print mesh.
// xMm/yMm are actual artwork positions, with y measured from body centre.
export function frontSurfaceMM(xMm, yMm, config) {
  return exteriorSurfaceMM(xMm, yMm, config, true);
}

// Rear artwork X+ points to the customer's right when viewing the rear.
export function backSurfaceMM(xMm, yMm, config) {
  return exteriorSurfaceMM(xMm, yMm, config, false);
}

function exteriorSurfaceMM(xMm, yMm, config, front) {
  const s = shape(config);
  const sign = front ? 1 : -1;
  const worldX = sign * xMm;
  const p = printablePoint(worldX, yMm + s.height / 2, s, config, front);
  const epsilon = 0.2;
  const px1 = printablePoint(sign * (xMm + epsilon), p.y, s, config, front);
  const px0 = printablePoint(sign * (xMm - epsilon), p.y, s, config, front);
  const py1 = printablePoint(worldX, p.y + epsilon, s, config, front);
  const py0 = printablePoint(worldX, p.y - epsilon, s, config, front);
  const normal = new THREE.Vector3(-(px1.z - px0.z) / (2 * epsilon),
    -sign * (py1.z - py0.z) / (2 * epsilon), sign).normalize();
  const result = { x: mmToScene(p.x), y: mmToScene(p.y), z: mmToScene(p.z),
    normal: { x: normal.x, y: normal.y, z: normal.z } };
  if (!s.sample) {
    result.visible = p.visible !== false && p.y >= 0 && p.y <= s.height && Math.abs(xMm) <= sliceAt(p.y, s).a;
  }
  return result;
}

function innerPocketShape(config, s) {
  const layout = getInnerPocketLayout(config);
  const signature = [s.width,s.height,s.depth,s.profile.id,layout.width,layout.height].join('/');
  const cached = innerPocketShapes.get(config);
  if (cached?.signature === signature) return cached.value;
  // A hanging pouch keeps its rectangle independently of the bag wall. Find
  // a shared interior Z interval for the complete rounded piece, rather than
  // bending its front face to the body's gusset or mouth taper.
  let rear = -Infinity, front = Infinity;
  for (let row=0;row<=16;row++) {
    const y = -layout.height/2 + row/16*layout.height;
    const halfWidth = innerPocketHalfWidth(y,layout);
    const outline = perimeter(s,layout.centerY+y,INNER_OFFSET);
    for (let column=0;column<=18;column++) {
      const x = (column/18*2-1)*halfWidth;
      const hits = [];
      for (let i=0;i<outline.length;i++) {
        const a=outline[i],b=outline[(i+1)%outline.length];
        if ((a.x<=x&&b.x>x)||(b.x<=x&&a.x>x)) {
          hits.push(THREE.MathUtils.lerp(a.z,b.z,(x-a.x)/(b.x-a.x)));
        }
      }
      hits.sort((a,b)=>a-b);
      if(hits.length<2)throw new RangeError('Inner pocket exceeds the lined bag silhouette.');
      rear=Math.max(rear,hits[0]); front=Math.min(front,hits[1]);
    }
  }
  const gap = Math.min(2.4, Math.max(0.35,(front-rear)*0.2));
  const planeZ = rear + 1.05 + gap;
  if(planeZ+0.65>front)throw new RangeError('Inner pocket has no safe interior hanging plane.');
  const value = {...layout,planeZ,backZ:planeZ-gap,gap,belly:0.18};
  innerPocketShapes.set(config,{signature,value});
  return value;
}

function rearLiningPoint(x,y,s) {
  const outline=perimeter(s,y,INNER_OFFSET),hits=[];
  for(let i=0;i<outline.length;i++){
    const a=outline[i],b=outline[(i+1)%outline.length];
    if((a.x<=x&&b.x>x)||(b.x<=x&&a.x>x))hits.push(THREE.MathUtils.lerp(a.z,b.z,(x-a.x)/(b.x-a.x)));
  }
  if(hits.length<2)throw new RangeError('Interior label exceeds the lined bag silhouette.');
  return {x,y,z:Math.min(...hits)};
}

function innerPocketPointMM(x, y, s, config) {
  const layout = innerPocketShape(config,s);
  const distance=innerPocketBindingDistance(x,y,layout);
  const region = innerPocketRegion(y,layout)==='opening' && distance>=-1e-7 && distance<=layout.bindingWidth+1e-7
    ? 'binding' : innerPocketRegion(y,layout);
  let z = region === 'opening' ? layout.backZ : layout.planeZ;
  if(region==='pouch') {
    const u=THREE.MathUtils.clamp(x/layout.width+0.5,0,1);
    const v=THREE.MathUtils.clamp((y+layout.height/2)/(layout.height*0.8),0,1);
    z += Math.sin(Math.PI*u)**2*Math.sin(Math.PI*v)**2*layout.belly;
    const lipTop=layout.mouthY-layout.openingHeight/2;
    if(y>=lipTop-layout.lipHeight)z+=Math.sin(Math.PI*(y-lipTop+layout.lipHeight)/layout.lipHeight)*0.4;
  }
  if(region!=='opening'&&distance>=0&&distance<=layout.bindingWidth) {
    z+=Math.sin(Math.PI*distance/layout.bindingWidth)*0.5;
  }
  return {x,y:layout.centerY+y,z};
}

export function innerPocketSurfaceMM(xMm, yMm, config) {
  const s = shape(config), layout = innerPocketShape(config,s), epsilon = 0.02;
  const p = innerPocketPointMM(xMm, yMm, s, config);
  const px1 = innerPocketPointMM(xMm + epsilon, yMm, s, config), px0 = innerPocketPointMM(xMm - epsilon, yMm, s, config);
  const py1 = innerPocketPointMM(xMm, yMm + epsilon, s, config), py0 = innerPocketPointMM(xMm, yMm - epsilon, s, config);
  const distance=innerPocketBindingDistance(xMm,yMm,layout);
  const region=innerPocketRegion(yMm,layout)==='opening' && distance>=-1e-7 && distance<=layout.bindingWidth+1e-7
    ? 'binding' : innerPocketRegion(yMm,layout);
  // Separate front faces meet an actual slot. A normal must stay on its own
  // face instead of measuring across the missing surface behind that slot.
  const derivativeY = region==='pouch'&&yMm+epsilon>layout.mouthY-layout.openingHeight/2
    ? (p.z-py0.z)/epsilon : region==='band'&&yMm-epsilon<layout.mouthY+layout.openingHeight/2
      ? (py1.z-p.z)/epsilon : (py1.z-py0.z)/(2*epsilon);
  const normal = new THREE.Vector3(-(px1.z-px0.z)/(2*epsilon),-derivativeY,1).normalize();
  const contourVisible=innerPocketContourVisible(xMm,yMm,layout);
  return { x:mmToScene(p.x), y:mmToScene(p.y), z:mmToScene(p.z), normal:{x:normal.x,y:normal.y,z:normal.z},
    visible:contourVisible&&region!=='opening', contourVisible, region };
}

// Left side traverses the front corner, gusset and rear corner. The right
// side is a mirrored surface, not a stretched front panel.
function sidePoint(t, y, s, right = false, inset = 0) {
  const { a, b, r, v, mouthPinch } = sliceAt(y, s);
  const arc = Math.PI * r / 2;
  const straight = Math.max(0, 2 * (b - r));
  const total = 2 * arc + straight;
  const distance = t * total;
  let x, z;
  if (distance <= arc) {
    const angle = distance / Math.max(0.1, r);
    x = -a + r - r * Math.sin(angle);
    z = b - r + r * Math.cos(angle);
    x += inset * Math.sin(angle);
    z -= inset * Math.cos(angle);
  } else if (distance <= arc + straight) {
    x = -a + inset;
    z = b - r - (distance - arc);
  } else {
    const angle = (distance - arc - straight) / Math.max(0.1, r);
    x = -a + r - r * Math.cos(angle);
    z = -b + r - r * Math.sin(angle);
    x += inset * Math.cos(angle);
    z += inset * Math.sin(angle);
  }
  // A gentle recessed gusset fold is independent of front artwork geometry.
  const fold = Math.sin(Math.PI * t) ** 4 * (!s.sample
    ? Math.min(r * 0.6, Math.sin(Math.PI * v) * Math.min(20, s.depth * 0.18) + mouthPinch * Math.min(20, s.depth * 0.18))
    : Math.sin(Math.PI * y / s.height) * Math.min(4, s.depth * 0.025));
  x += fold;
  if (right) x = -x;
  return { x, y, z, u: distance };
}

function geometryFromGrid(columns, rows, sample, reverse = false) {
  const positions = [], uvs = [], indices = [];
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= columns; i++) {
      const p = sample(i / columns, j / rows);
      positions.push(mmToScene(p.x), mmToScene(p.y), mmToScene(p.z));
      uvs.push(mmToScene(p.u ?? p.x), mmToScene(p.v ?? p.y));
    }
  }
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < columns; i++) {
      const a = j * (columns + 1) + i;
      const b = a + 1, c = a + columns + 1, d = c + 1;
      if (reverse) indices.push(a, c, b, b, c, d);
      else indices.push(a, b, c, b, d, c);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  return geometry;
}

function verticalKnots(s, y0, y1) {
  const count = Math.max(5, Math.round(BODY_ROWS * (y1 - y0) / s.height));
  const values = Array.from({ length: count + 1 }, (_, i) => y0 + (y1 - y0) * i / count);
  const corner = Math.min(12, s.height * 0.035, s.depth * 0.09);
  // Concentrate vertices at the bottom's tight rounded fold; a tall body
  // should not replace this small curve with a single long triangle.
  if (y0 < corner) {
    for (let i = 1; i <= 8; i++) {
      const y = corner * (1 - Math.cos(Math.PI * i / 16));
      if (y > y0 && y < y1) values.push(y);
    }
  }
  if (s.profile.handleAttachment === 'mouth') {
    const foldDepth = Math.min(s.depth / 2, s.height * 0.2, s.width * 0.2);
    if (foldDepth > y0 && foldDepth < y1) values.push(foldDepth);
  }
  return values.sort((a, b) => a - b).filter((value, index, all) => !index || value - all[index - 1] > 1e-7);
}

function panelGeometry(s, y0, y1, front, inward = false) {
  const knots = verticalKnots(s, y0, y1);
  return geometryFromGrid(BODY_COLUMNS, knots.length - 1, (u, v) => {
    const y = knots[Math.round(v * (knots.length - 1))];
    return drapedRowPoint(u,y,s,front,false,inward?INNER_OFFSET:0);
  }, front ? inward : !inward);
}

function sideGeometry(s, y0, y1, right, inward = false) {
  const knots = verticalKnots(s, y0, y1);
  if (!s.sample) {
    const rows = knots.map(y => {
      let distance = 0, previous = null;
      return Array.from({length:SIDE_COLUMNS+1},(_,i)=>{
        const p=drapedRowPoint(i/SIDE_COLUMNS,y,s,right,true,inward?INNER_OFFSET:0);
        if(previous)distance+=Math.hypot(p.x-previous.x,p.z-previous.z);
        p.u=distance; previous=p; return p;
      });
    });
    return geometryFromGrid(SIDE_COLUMNS,knots.length-1,(u,v)=>
      rows[Math.round(v*(knots.length-1))][Math.round(u*SIDE_COLUMNS)],right?inward:!inward);
  }
  return geometryFromGrid(SIDE_COLUMNS, knots.length - 1,
    (u, v) => sidePoint(u, knots[Math.round(v * (knots.length - 1))], s, right, inward ? INNER_OFFSET : 0), right ? inward : !inward);
}

function perimeter(s, y, inset = 0) {
  const { a, r } = sliceAt(y, s);
  const outline = [];
  for (let i = 0; i <= BODY_COLUMNS; i++) outline.push(panelPoint((i / BODY_COLUMNS * 2 - 1) * (a - r), y, s, true, inset));
  for (let i = 1; i <= SIDE_COLUMNS; i++) outline.push(sidePoint(i / SIDE_COLUMNS, y, s, true, inset));
  for (let i = 1; i <= BODY_COLUMNS; i++) outline.push(panelPoint((1 - i / BODY_COLUMNS * 2) * (a - r), y, s, false, inset));
  for (let i = SIDE_COLUMNS - 1; i > 0; i--) outline.push(sidePoint(i / SIDE_COLUMNS, y, s, false, inset));
  return outline;
}

function floorGeometry(s, inside = false) {
  const y = inside ? 2.2 : 0;
  const inset=inside?INNER_OFFSET:0;
  let outline;
  if(s.sample)outline=perimeter(s,y,inset);
  else {
    outline=[];
    for(let i=0;i<=BODY_COLUMNS;i++)outline.push(drapedRowPoint(i/BODY_COLUMNS,y,s,true,false,inset));
    for(let i=1;i<=SIDE_COLUMNS;i++)outline.push(drapedRowPoint(i/SIDE_COLUMNS,y,s,true,true,inset));
    for(let i=1;i<=BODY_COLUMNS;i++)outline.push(drapedRowPoint(1-i/BODY_COLUMNS,y,s,false,false,inset));
    for(let i=SIDE_COLUMNS-1;i>0;i--)outline.push(drapedRowPoint(i/SIDE_COLUMNS,y,s,false,true,inset));
  }
  const positions = [0, mmToScene(y), 0], uvs = [0, 0], indices = [];
  for (const p of outline) {
    positions.push(mmToScene(p.x), mmToScene(s.sample?y:p.y), mmToScene(p.z));
    uvs.push(mmToScene(p.x), mmToScene(p.z));
  }
  for (let i = 0; i < outline.length; i++) {
    const a = i + 1, b = (i + 1) % outline.length + 1;
    if (inside) indices.push(0, a, b);
    else indices.push(0, b, a);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  return geometry;
}

function ribbonGeometry(points, width, thickness) {
  const positions = [], uvs = [], indices = [];
  const endRings = [];
  let length = 0;
  for (let i = 0; i < points.length; i++) {
    const p = new THREE.Vector3(points[i].x, points[i].y, points[i].z);
    const previous = points[Math.max(0, i - 1)], next = points[Math.min(points.length - 1, i + 1)];
    const tangent = points[i].tangent
      ? new THREE.Vector3(points[i].tangent.x, points[i].tangent.y, points[i].tangent.z).normalize()
      : new THREE.Vector3(next.x - previous.x, next.y - previous.y, next.z - previous.z).normalize();
    const lateral = points[i].lateral
      ? new THREE.Vector3(points[i].lateral.x, points[i].lateral.y, points[i].lateral.z)
        .addScaledVector(tangent, -new THREE.Vector3(points[i].lateral.x, points[i].lateral.y, points[i].lateral.z).dot(tangent)).normalize()
      : new THREE.Vector3(tangent.y, -tangent.x, 0).normalize();
    const normal = new THREE.Vector3().crossVectors(lateral, tangent).normalize();
    if (i) length += p.distanceTo(new THREE.Vector3(points[i - 1].x, points[i - 1].y, points[i - 1].z));
    const offsets = [[-1, 1], [1, 1], [1, -1], [-1, -1]];
    const ring = offsets.map(([side, surface]) => p.clone()
      .addScaledVector(lateral, width * side / 2).addScaledVector(normal, thickness * surface / 2));
    // Each face owns its edge vertices: broad front/back faces stay flat,
    // while normals remain smooth along the curved length of the ribbon.
    for (let edge = 0; edge < 4; edge++) {
      for (const k of [edge, (edge + 1) % 4]) {
        const vertex = ring[k];
        positions.push(mmToScene(vertex.x), mmToScene(vertex.y), mmToScene(vertex.z));
        uvs.push(mmToScene(k === 0 || k === 3 ? 0 : width), mmToScene(length));
      }
    }
    if (i === 0 || i === points.length - 1) endRings.push(ring);
    if (i < points.length - 1) {
      for (let edge = 0; edge < 4; edge++) {
        const a = i * 8 + edge * 2, b = a + 8;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  }
  for (let i = 0; i < endRings.length; i++) {
    const start = positions.length / 3;
    for (const vertex of endRings[i]) {
      positions.push(mmToScene(vertex.x), mmToScene(vertex.y), mmToScene(vertex.z));
      uvs.push(mmToScene(vertex.x), mmToScene(vertex.z));
    }
    if (i === 0) indices.push(start, start + 3, start + 1, start + 1, start + 3, start + 2);
    else indices.push(start, start + 1, start + 3, start + 1, start + 2, start + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  return geometry;
}

function handleLegStart(s) {
  return s.profile.handleAttachment === 'mouth'
    ? Math.max(2, s.height - s.profile.handleAttachmentDepth) : Math.max(2, s.panelHeight - 1);
}

function dailyHandleDepthAt(x, y, s) {
  // Reserve 1.8 mm for cloth/lining even though the existing shared lining
  // uses a thinner offset. The rounded corner is inset along its own normal,
  // so subtracting a fixed Z from the outside face would leave wide straps
  // emerging through the corner.
  const inset = Math.max(INNER_OFFSET, 1.8);
  const { a, r } = sliceAt(y, s);
  if (Math.abs(x) <= a - r) return panelPoint(x, y, s, true, inset).z;
  let previous = sidePoint(0, y, s, true, inset), previousT = 0;
  for (let i = 1; i <= 40; i++) {
    const t = i / 80, next = sidePoint(t, y, s, true, inset);
    if (previous.x <= Math.abs(x) && next.x >= Math.abs(x)) {
      let lo = previousT, hi = t;
      for (let step = 0; step < 18; step++) {
        const mid = (lo + hi) / 2;
        if (sidePoint(mid, y, s, true, inset).x < Math.abs(x)) lo = mid;
        else hi = mid;
      }
      return sidePoint((lo + hi) / 2, y, s, true, inset).z;
    }
    previous = next; previousT = t;
  }
  throw new RangeError('Daily handle attachment exceeds the lined mouth width.');
}

function dailyHandleAnchor(s, x, y, front) {
  const depthAt = height => {
    let depth = Infinity;
    for (let i = 0; i <= 8; i++) {
      // A sloping ribbon's thickness also moves its corners vertically. On
      // a short, deep bag the mouth changes rapidly over those millimetres.
      for (const dy of [-s.handle.thickness / 2, 0, s.handle.thickness / 2]) {
        depth = Math.min(depth, dailyHandleDepthAt(x + (i / 8 - 0.5) * s.handle.width,
          THREE.MathUtils.clamp(height + dy, 0, s.height), s));
      }
    }
    return depth;
  };
  const mouthDepth = depthAt(s.height);
  const depth = depthAt(y);
  // Follow the lining below the mouth, then become vertical over the final
  // 2 mm. Both the attachment and loop own exactly the same endpoint frame.
  const t = THREE.MathUtils.clamp((y - (s.height - 8)) / 6, 0, 1);
  const eased = t * t * (3 - 2 * t);
  const centerDepth = THREE.MathUtils.lerp(depth, Math.min(depth, mouthDepth), eased)
    - s.handle.thickness / 2 - 0.65;
  return { x, y, z: (front ? 1 : -1) * centerDepth };
}

function handleLeg(s, x, front) {
  const points = [];
  const y0 = handleLegStart(s);
  for (let i = 0; i <= 24; i++) {
    const y = y0 + (s.height - y0) * i / 24;
    const p = s.profile.handleAttachment === 'mouth' ? dailyHandleAnchor(s, x, y, front) : panelPoint(x, y, s, front);
    if (s.profile.handleAttachment === 'mouth') {
      if (i === 24) p.tangent = { x: 0, y: 1, z: 0 };
    } else {
      p.z += (front ? 1 : -1) * (s.handle.thickness / 2 + 0.65);
      if (i === 24 && s.profile.handleLoopStyle === 'folded-cloth') p.tangent = { x: 0, y: 1, z: 0 };
    }
    points.push(p);
  }
  return ribbonGeometry(points, s.handle.width, s.handle.thickness);
}

function handleLoop(s, front) {
  if (s.profile.handleAttachment === 'mouth' || s.profile.handleLoopStyle === 'folded-cloth') return dailyHandleLoop(s, front);
  const points = [];
  const root = panelPoint(-s.handle.gap / 2, s.height, s, front);
  const offset = (front ? 1 : -1) * (s.handle.thickness / 2 + 0.65);
  const rise = Math.max(1, s.handle.drop - s.handle.width / 2);
  for (let i = 0; i <= LOOP_SEGMENTS; i++) {
    const angle = Math.PI * i / LOOP_SEGMENTS;
    points.push({ x: -s.handle.gap / 2 * Math.cos(angle),
      y: s.height + rise * Math.sin(angle),
      z: root.z + offset + (front ? 1 : -1) * Math.min(22, s.handle.drop * 0.06) * Math.sin(angle) ** 2 });
  }
  return ribbonGeometry(points, s.handle.width, s.handle.thickness);
}

function ease(value) {
  const t=THREE.MathUtils.clamp(value,0,1);
  return t*t*(3-2*t);
}

function clothDrape(s) {
  const rounded=s.profile.handleShape==='rounded', broad=['small','poly_v','poly_h'].includes(s.profile.id);
  const defaults=rounded?{leftRollDeg:35,rightRollDeg:55,crownRollDeg:broad?30:85,depthBowMm:1.5}
    :{leftRollDeg:65,rightRollDeg:35,crownRollDeg:90,depthBowMm:1.5};
  defaults.leftRollKnots=rounded?[[0,0],[.5,35],[.8,broad?55:65],[1,defaults.crownRollDeg]]
    :[[0,0],[.25,30],[.5,50],[.8,70],[1,90]];
  defaults.rightRollKnots=rounded?[[0,0],[.5,55],[.8,broad?60:75],[1,defaults.crownRollDeg]]
    :[[0,0],[.25,15],[.5,35],[.8,60],[1,90]];
  const pose={...defaults,...s.profile.handleDrape};
  // A 70 mm tape on an 80 mm drop cannot make the same tight turn as the
  // narrow photographic sample. Gradually flatten that exceptional pose.
  const sourceRatio=s.profile.defaultHandle.drop/s.profile.defaultHandle.width;
  const scale=ease((s.handle.drop/s.handle.width-1.3)/Math.min(1.8,Math.max(.4,sourceRatio-1.3)));
  return {...pose,crownRollDeg:pose.crownRollDeg*scale,twistScale:scale};
}

function clothRoll(s,y,rise,side,crownRadius) {
  const pose=clothDrape(s), capStart=Math.max(1,rise-Math.min(crownRadius,s.handle.width*.4));
  const rootBlend=s.handle.width*(s.construction==='tumbler'?.25:1.5);
  const crownBlend=Math.min(s.handle.width*1.2,rise*.55), crownStart=Math.max(0,capStart-crownBlend);
  const primary=THREE.MathUtils.degToRad(pose[`${side}RollDeg`]*pose.twistScale),crown=THREE.MathUtils.degToRad(pose.crownRollDeg);
  let roll=primary*ease(y/rootBlend);
  const knots=pose[`${side}RollKnots`];
  if(Array.isArray(knots)&&knots.length>1){
    const angleAt=f=>{
      for(let i=1;i<knots.length;i++)if(f<=knots[i][0]){
        const a=knots[i-1],b=knots[i],t=THREE.MathUtils.clamp((f-a[0])/Math.max(.0001,b[0]-a[0]),0,1);
        return THREE.MathUtils.lerp(a[1],b[1],t);
      }
      return knots.at(-1)[1];
    };
    // Alpha-image width measurements include local wrinkles and overlaps.
    // Spread their rotation over a cloth-width distance instead of making
    // a separate rigid twist at every pixel-derived measurement knot.
    const window=Math.min(.3,s.handle.width/rise*.8),f=y/rise;
    let angle=0,weight=0;
    for(let i=-4;i<=4;i++){
      const w=Math.exp(-i*i/5);angle+=angleAt(THREE.MathUtils.clamp(f+i/4*window,0,1))*w;weight+=w;
    }
    roll=THREE.MathUtils.degToRad(angle/weight*pose.twistScale)*ease(y/rootBlend);
  }
  return THREE.MathUtils.lerp(roll,crown,ease((y-crownStart)/Math.max(1,capStart-crownStart)));
}

function clothLoopPoints(s,front,rise,path,crownRadius) {
  const sign=front?1:-1;
  const anchor=s.profile.handleAttachment==='mouth' ? dailyHandleAnchor(s,-s.handle.gap/2,s.height,front)
    : panelPoint(-s.handle.gap/2,s.height,s,front);
  const baseZ=Math.abs(anchor.z)+(s.profile.handleAttachment==='mouth'?0:s.handle.thickness/2+.65),pose=clothDrape(s);
  const points=[];
  // A photographed tape turns edge-on near its fold. Keep an actual 3D
  // width vector, rather than narrowing or scaling the material itself.
  const peakRoll=Math.max(pose.crownRollDeg,...['left','right'].flatMap(side=>
    (pose[`${side}RollKnots`]||[[0,pose[`${side}RollDeg`]]]).map(k=>k[1]*pose.twistScale)));
  const targetDepth=Math.max(baseZ*(1-.38*pose.twistScale)+Math.min(5,pose.depthBowMm??1.5)*pose.twistScale,
    s.handle.width/2*Math.sin(THREE.MathUtils.degToRad(peakRoll))+s.handle.thickness/2+.9);
  const depthAt=y=>{
    // Smoothly reserve the turned ribbon's depth before its upper fold.
    // A piecewise max tied to each rotation knot can crease the centreline.
    return THREE.MathUtils.lerp(baseZ,targetDepth,ease(y/Math.min(s.handle.width*1.8,rise*.55)));
  };
  for(let i=0;i<path.length;i++){
    const p=path[i],side=p.side||'left',roll=clothRoll(s,p.y,rise,side,crownRadius),epsilon=.01;
    const derivative=(depthAt(Math.min(rise,p.y+epsilon),side)-depthAt(Math.max(0,p.y-epsilon),side))
      /Math.max(epsilon,Math.min(rise,p.y+epsilon)-Math.max(0,p.y-epsilon));
    const tangent=new THREE.Vector3(p.tx,p.ty,sign*derivative*p.ty).normalize();
    const lateral=new THREE.Vector3(tangent.y,-tangent.x,0).normalize().applyAxisAngle(tangent,roll);
    points.push({x:p.x,y:s.height+p.y,z:sign*depthAt(p.y,side),tangent,lateral});
  }
  // End frames stay identical to the mouth's sewn vertical attachment.
  for(const [i,direction] of [[0,1],[points.length-1,-1]]){
    points[i].tangent={x:0,y:direction,z:0};points[i].lateral={x:direction,y:0,z:0};
  }
  return points;
}

function fitClothLoop(s,front,pathAt,crownRadius) {
  const top=points=>Math.max(...points.map(p=>{
    const t=new THREE.Vector3(p.tangent.x,p.tangent.y,p.tangent.z).normalize();
    const l=new THREE.Vector3(p.lateral.x,p.lateral.y,p.lateral.z).normalize(),n=new THREE.Vector3().crossVectors(l,t).normalize();
    return p.y+s.handle.width/2*Math.abs(l.y)+s.handle.thickness/2*Math.abs(n.y);
  }));
  let lo=Math.max(1,s.handle.drop-s.handle.width/2-s.handle.thickness),hi=s.handle.drop;
  for(let i=0;i<24;i++){
    const rise=(lo+hi)/2,points=clothLoopPoints(s,front,rise,pathAt(rise),crownRadius);
    if(top(points)>s.height+s.handle.drop)hi=rise;else lo=rise;
  }
  return ribbonGeometry(clothLoopPoints(s,front,(lo+hi)/2,pathAt((lo+hi)/2),crownRadius),s.handle.width,s.handle.thickness);
}

function dailyHandleLoop(s, front) {
  if(s.profile.id==='small')return smallMouthHandleLoop(s,front);
  const photographed=photographicHandleLoop(s,front);
  if(photographed)return photographed;
  if(s.profile.handleShape==='rounded')return roundedMouthHandleLoop(s,front);
  const halfGap=s.handle.gap/2,minimumRadius=s.handle.width/2+Math.max(1.2,s.handle.thickness*.6);
  const rootRadius=Math.min(halfGap-2,Math.max(s.handle.width*.95,minimumRadius),
    Math.max(minimumRadius,s.handle.drop-s.handle.width/2-s.handle.thickness-2));
  const crownRoll=THREE.MathUtils.degToRad(clothDrape(s).crownRollDeg);
  // A turned tape bends about its thin edge at the shoulder, so a 3 mm
  // cloth fold can replace the old rigid width/2 semicircular cap.
  const crownRadius=Math.max(3,s.handle.width/2*Math.abs(Math.cos(crownRoll))+s.handle.thickness*.7+1);
  const pathAt=rise=>{
    let lo=0,hi=Math.PI/2-.0001;
    for(let i=0;i<32;i++){
      const a=(lo+hi)/2,required=(halfGap-rootRadius)*Math.tan(a)+crownRadius+(rootRadius-crownRadius)/Math.cos(a);
      if(required>rise)hi=a;else lo=a;
    }
    const angle=(lo+hi)/2,points=[],point=(x,y,tx,ty,side)=>({x,y,tx,ty,side});
    const leftBase={x:-halfGap+rootRadius-rootRadius*Math.sin(angle),y:rootRadius*Math.cos(angle)};
    const leftTip={x:-crownRadius*Math.sin(angle),y:rise-crownRadius+crownRadius*Math.cos(angle)};
    for(let i=0;i<=8;i++){
      const a=Math.PI-(Math.PI/2-angle)*i/8;
      points.push(point(-halfGap+rootRadius+rootRadius*Math.cos(a),rootRadius*Math.sin(a),Math.sin(a),-Math.cos(a),'left'));
    }
    for(let i=1;i<=24;i++)points.push(point(THREE.MathUtils.lerp(leftBase.x,leftTip.x,i/24),THREE.MathUtils.lerp(leftBase.y,leftTip.y,i/24),Math.cos(angle),Math.sin(angle),'left'));
    for(let i=1;i<=32;i++){
      const a=Math.PI/2+angle-2*angle*i/32;
      points.push(point(crownRadius*Math.cos(a),rise-crownRadius+crownRadius*Math.sin(a),Math.sin(a),-Math.cos(a),i<=16?'left':'right'));
    }
    for(let i=1;i<=24;i++)points.push(point(THREE.MathUtils.lerp(-leftTip.x,-leftBase.x,i/24),THREE.MathUtils.lerp(leftTip.y,leftBase.y,i/24),Math.cos(angle),-Math.sin(angle),'right'));
    for(let i=1;i<=8;i++){
      const a=Math.PI/2+angle+(Math.PI/2-angle)*i/8;
      points.push(point(halfGap-rootRadius-rootRadius*Math.cos(a),rootRadius*Math.sin(a),Math.sin(a),Math.cos(a),'right'));
    }
    return points;
  };
  return fitClothLoop(s,front,pathAt,crownRadius);
}

function photographicHandleLoop(s,front) {
  const halfGap=s.handle.gap/2;
  const knots=s.profile.handleDrape?.centerlineKnots;
  const photo=s.profile.defaultHandle,aspect=(s.handle.drop/s.handle.gap)/(photo.drop/photo.gap);
  // Keep the photographed centreline under proportional custom sizes.
  // A very wide/short or crowded tape instead uses the safe bend template.
  if(Array.isArray(knots)&&knots.length>=5&&aspect>.65&&aspect<1.85
    &&s.handle.width/s.handle.gap<.4&&s.handle.drop/s.handle.width>2.4){
    const maxHeight=Math.max(...knots.map(k=>k[1]));
    const pathAt=rise=>{
      const control=knots.map(([x,y],i)=>{
        const height=(i===0||i===knots.length-1)?0:y/maxHeight*rise;
        const root=x<=0?-halfGap:halfGap;
        return new THREE.Vector3(THREE.MathUtils.lerp(root,x*halfGap,ease(height/(s.handle.width*.95))),height,0);
      });
      const curve=new THREE.CatmullRomCurve3(control,false,'centripetal'),points=[];
      const broad=['small','poly_v','poly_h'].includes(s.profile.id);
      if(broad){
        // The photographed diagonal shoulders include local folded layers.
        // Smooth only their centreline over a cloth-width distance; copying
        // every medial pixel turn would cut one face through the next face.
        const sampled=curve.getSpacedPoints(192),step=curve.getLength()/192,sigma=s.handle.width*.46;
        const reach=Math.ceil(sigma*2.5/step),smoothed=[];
        const sample=i=>i<0?new THREE.Vector3(-halfGap,i*step,0)
          :i>192?new THREE.Vector3(halfGap,(192-i)*step,0):sampled[i];
        for(let i=0;i<=192;i++){
          const p=new THREE.Vector3();let total=0;
          for(let j=-reach;j<=reach;j++){
            const weight=Math.exp(-(((j*step)/sigma)**2)/2);p.addScaledVector(sample(i+j),weight);total+=weight;
          }
          smoothed.push(p.divideScalar(total));
        }
        const leftError=smoothed[0].clone().sub(sampled[0]),rightError=smoothed[192].clone().sub(sampled[192]);
        for(let i=0;i<=192;i++){
          smoothed[i].addScaledVector(leftError,-(1-ease(i*step/(s.handle.width*1.5))));
          smoothed[i].addScaledVector(rightError,-(1-ease((192-i)*step/(s.handle.width*1.5))));
          if(s.profile.id==='small'){
            const shoulder=ease((Math.abs(sampled[i].x)/halfGap-.3)/.45);
            smoothed[i].lerp(sampled[i],1-shoulder);
          }
        }
        for(let i=0;i<=192;i+=2){
          const p=smoothed[i],t=smoothed[Math.min(192,i+1)].clone().sub(smoothed[Math.max(0,i-1)]).normalize();
          points.push({x:p.x,y:p.y,tx:t.x,ty:t.y,side:p.x<=0?'left':'right'});
        }
      }else for(let i=0;i<=96;i++){
        const p=curve.getPointAt(i/96),t=curve.getTangentAt(i/96);
        points.push({x:p.x,y:p.y,tx:t.x,ty:t.y,side:p.x<=0?'left':'right'});
      }
      return points;
    };
    return fitClothLoop(s,front,pathAt,Math.min(halfGap,s.handle.width));
  }
  return null;
}

function smallMouthHandleLoop(s,front) {
  const halfGap=s.handle.gap/2,bendMinimum=s.handle.width/2+Math.max(1.2,s.handle.thickness*.6);
  const radius=Math.min(halfGap,Math.max(bendMinimum,s.handle.width*.53));
  const pathAt=rise=>{
    const leg=Math.max(0,rise-radius);
    // The reference has diagonal folded shoulders around a small, nearly
    // square opening corner. Its medial pixels include the overlapping fold:
    // sweeping that skeleton made a large round opening instead of the fold.
    let inset=Math.max(0,Math.min(s.handle.width*.14,halfGap-radius));
    inset=Math.min(inset,leg*leg/(6*bendMinimum));
    const upperHalfGap=halfGap-inset,span=Math.max(0,2*(upperHalfGap-radius));
    const points=[],point=(x,y,tx,ty)=>({x,y,tx,ty,side:x<=0?'left':'right'});
    points.push(point(-halfGap,0,0,1));
    if(leg>.001)for(let i=1;i<=16;i++){
      const v=i/16,shift=inset*ease(v),slope=6*inset*v*(1-v)/leg;
      points.push(point(-halfGap+shift,leg*v,slope,1));
    }
    for(let i=1;i<=24;i++){
      const a=Math.PI/2*i/24;
      points.push(point(-upperHalfGap+radius-radius*Math.cos(a),leg+radius*Math.sin(a),Math.sin(a),Math.cos(a)));
    }
    if(span>.001)for(let i=1;i<=16;i++)points.push(point(-upperHalfGap+radius+span*i/16,rise,1,0));
    for(let i=1;i<=24;i++){
      const a=Math.PI/2*(1-i/24);
      points.push(point(upperHalfGap-radius+radius*Math.cos(a),leg+radius*Math.sin(a),Math.sin(a),-Math.cos(a)));
    }
    if(leg>.001)for(let i=1;i<=16;i++){
      const v=1-i/16,shift=inset*ease(v),slope=6*inset*v*(1-v)/leg;
      points.push(point(halfGap-shift,leg*v,slope,-1));
    }
    return points;
  };
  return fitClothLoop(s,front,pathAt,radius);
}

function roundedMouthHandleLoop(s,front) {
  const halfGap=s.handle.gap/2;
  const bendMinimum=s.handle.width/2+Math.max(1.2,s.handle.thickness*.6);
  const pathAt=rise=>{
  const gatheredSides=['sgak_s','kids'].includes(s.profile.id);
  let inset=gatheredSides&&rise>halfGap*1.65?Math.max(0,Math.min(halfGap*.36,halfGap-bendMinimum)):0;
  // A broad, short loop keeps its U shape. Taller loops gently gather their
  // sides toward a smaller round crown, with vertical tangents at both ends.
  // Reserve a full positive inner bend radius for the widest ribbon.
  if(inset&&6*inset*bendMinimum>(rise-halfGap+inset)**2){
    let lo=0,hi=inset;
    for(let i=0;i<24;i++){
      const mid=(lo+hi)/2;
      if(6*mid*bendMinimum<=(rise-halfGap+mid)**2)lo=mid;else hi=mid;
    }
    inset=lo;
  }
  const tapered=inset>.001,broad=['small','poly_v','poly_h'].includes(s.profile.id);
  // The short photographic handles have distinct shoulders and a wide,
  // almost straight bridge. A half-gap semicircle makes a plastic U ring.
  const shoulder=broad?Math.max(bendMinimum,s.handle.width*.58):halfGap;
  const radius=tapered?halfGap-inset:Math.min(halfGap,rise,shoulder);
  const span=tapered?0:2*(halfGap-radius),bow=broad&&span>1
    ?Math.min(s.poly?2.5:.6,span*.035,span*span/(4*Math.PI*Math.PI*bendMinimum)):0;
  const leg=Math.max(0,rise-radius-bow);
  const points=[],point=(x,y,tx,ty,side=x<=0?'left':'right')=>({x,y,tx,ty,side});
  points.push(point(-halfGap,0,0,1));
  if(leg>.001)for(let i=1;i<=8;i++){
    const v=i/8,shift=inset*v*v*(3-2*v),slope=6*inset*v*(1-v)/leg;
    points.push(point(-halfGap+shift,leg*v,slope,1));
  }
  for(let i=1;i<=16;i++){
    const a=Math.PI/2*i/16;points.push(point((tapered?0:-halfGap+radius)-radius*Math.cos(a),leg+radius*Math.sin(a),Math.sin(a),Math.cos(a)));
  }
  if(span>.001)for(let i=1;i<=12;i++){
    const u=i/12;points.push(point(-halfGap+radius+span*u,rise-bow+bow*Math.sin(Math.PI*u)**2,
      1,bow*Math.PI/span*Math.sin(2*Math.PI*u)));
  }
  for(let i=1;i<=16;i++){
    const a=Math.PI/2*(1-i/16);points.push(point((tapered?0:halfGap-radius)+radius*Math.cos(a),leg+radius*Math.sin(a),Math.sin(a),-Math.cos(a)));
  }
  if(leg>.001)for(let i=1;i<=8;i++){
    const v=1-i/8,shift=inset*v*v*(3-2*v),slope=6*inset*v*(1-v)/leg;
    points.push(point(halfGap-shift,leg*v,slope,-1));
  }
  return points;
  };
  // Rounded references keep a broad U, with the two sides gently turning
  // instead of an identical flat frame facing the camera all the way up.
  return fitClothLoop(s,front,pathAt,halfGap);
}

function stitchGeometry(s, y, front, x0, x1) {
  return sewnThreadGeometry(x1-x0,(distance,across)=>{
    const p=panelPoint(x0+distance,y+across,s,front);
    return {...p,nz:front?1:-1};
  },{maxCount:s.seamMaxCount});
}

function sideStitchGeometry(s,y,right) {
  // Resolve arc length along the folded side so spacing stays physical even
  // when the mouth narrows. The thread follows the actual cloth surface.
  const samples=[{distance:0,t:0,point:sidePoint(0,y,s,right)}];
  for(let i=1;i<=80;i++){
    const point=sidePoint(i/80,y,s,right),previous=samples.at(-1);
    samples.push({distance:previous.distance+Math.hypot(point.x-previous.point.x,point.z-previous.point.z),t:i/80,point});
  }
  const length=samples.at(-1).distance;
  return sewnThreadGeometry(length,(distance,across)=>{
    const end=samples.findIndex(sample=>sample.distance>=distance),a=samples[Math.max(0,end-1)],b=samples[Math.max(1,end)];
    const t=THREE.MathUtils.lerp(a.t,b.t,(distance-a.distance)/Math.max(.0001,b.distance-a.distance));
    const p=sidePoint(t,y+across,s,right),previous=sidePoint(Math.max(0,t-.001),y,s,right),next=sidePoint(Math.min(1,t+.001),y,s,right);
    const dx=next.x-previous.x,dz=next.z-previous.z,norm=Math.max(.0001,Math.hypot(dx,dz)),sign=right?-1:1;
    return {...p,nx:sign*dz/norm,nz:-sign*dx/norm};
  },{maxCount:s.sideSeamMaxCount,rounded:false});
}

function pocketGeometry(s, pocket) {
  return geometryFromGrid(20, 16, (u, v) => {
    const x = (u - 0.5) * pocket.width;
    const y = pocket.bottom + v * pocket.height;
    const p = panelPoint(x, y, s);
    p.z += 1.4 + Math.sin(Math.PI * u) * Math.sin(Math.PI * v) * 2.5;
    return p;
  });
}

/** Materials are supplied/owned by the viewer; the model owns only geometry. */
export function buildBagModel(config, materials) {
  const s = shape(config);
  // Keep the existing full-options triangle budget when a long cross strap
  // is present. Ordinary bags retain the denser seam spacing for close views.
  s.seamMaxCount=config.options?.crossStrap?48:110;
  s.sideSeamMaxCount=config.options?.crossStrap?24:60;
  const bag = new THREE.Group();
  bag.name = 'Bag';
  const aliases = { handle: 'webbing', inside: 'lining', seam: 'stitch', innerPocket: 'inside',
    pocketEdge: 'body', pocketStitch: 'seam', pocketShadow: 'inside',nameTag:'body',nameTagBorder:'seam',
    crossStrapEdge:'handle', crossStrapStitch:'seam', crossStrapHardware:'snap' };
  const add = (name, geometry, materialKey, parent = bag) => {
    const material = materials[materialKey] || materials[aliases[materialKey]] || materials.body;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.userData.materialKey = materialKey;
    mesh.castShadow = !['seam', 'inside', 'pocketStitch', 'pocketShadow'].includes(materialKey);
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };

  add('bodyFront', panelGeometry(s, s.panelHeight, s.height, true), 'body');
  add('bodyBack', panelGeometry(s, s.panelHeight, s.height, false), 'body');
  if (s.panelHeight > 0) {
    add('bottomFrontPanel', panelGeometry(s, 0, s.panelHeight, true), 'bottom');
    add('bottomBackPanel', panelGeometry(s, 0, s.panelHeight, false), 'bottom');
  }
  add('sideLeft', sideGeometry(s, s.panelHeight, s.height, false), 'body');
  add('sideRight', sideGeometry(s, s.panelHeight, s.height, true), 'body');
  if (s.panelHeight > 0) {
    add('bottomSideLeftPanel', sideGeometry(s, 0, s.panelHeight, false), 'bottom');
    add('bottomSideRightPanel', sideGeometry(s, 0, s.panelHeight, true), 'bottom');
  }
  add('bottom', floorGeometry(s), s.profile.supportsBottomPanel ? 'bottom' : 'body');
  add('liningFront', panelGeometry(s, 2.2, s.height, true, true), 'inside');
  add('liningBack', panelGeometry(s, 2.2, s.height, false, true), 'inside');
  add('liningLeft', sideGeometry(s, 2.2, s.height, false, true), 'inside');
  add('liningRight', sideGeometry(s, 2.2, s.height, true, true), 'inside');
  add('liningBottom', floorGeometry(s, true), 'inside');

  // Seal the shell thickness at the mouth without filling the open top.
  const outside = perimeter(s, s.height), inside = perimeter(s, s.height, INNER_OFFSET);
  const rim = geometryFromGrid(outside.length, 1, (u, v) => {
    const index = Math.round(u * outside.length) % outside.length;
    const a = outside[index], b = inside[index];
    return { x: THREE.MathUtils.lerp(a.x, b.x, v), y: s.height,
      z: THREE.MathUtils.lerp(a.z, b.z, v), u: u * (s.width * 2 + s.depth * 2), v: v * INNER_OFFSET };
  });
  add('openTopRim', rim, 'body');

  if (s.supportsHandles && (!config.options?.crossStrap || !s.sample)) {
    add('handleFrontLeft', handleLeg(s, -s.handle.gap / 2, true), 'handle');
    add('handleFrontRight', handleLeg(s, s.handle.gap / 2, true), 'handle');
    add('handleBackLeft', handleLeg(s, -s.handle.gap / 2, false), 'handle');
    add('handleBackRight', handleLeg(s, s.handle.gap / 2, false), 'handle');
    add('handlesLoopFront', handleLoop(s, true), 'handle');
    add('handlesLoopBack', handleLoop(s, false), 'handle');
  }

  const seams = new THREE.Group();
  seams.name = 'seams';
  bag.add(seams);
  const seamRows = [['mouth', s.height - 5]];
  if (s.profile.supportsBottomPanel) seamRows.push(['bottomPanel', s.panelHeight + 2.5]);
  for (const [name, y] of seamRows) {
    const { a, r } = sliceAt(y, s);
    add(`${name}FrontStitches`, stitchGeometry(s, y, true, -a + r + 3, a - r - 3), 'seam', seams);
    add(`${name}BackStitches`, stitchGeometry(s, y, false, -a + r + 3, a - r - 3), 'seam', seams);
    add(`${name}LeftStitches`, sideStitchGeometry(s,y,false), 'seam', seams);
    add(`${name}RightStitches`, sideStitchGeometry(s,y,true), 'seam', seams);
  }
  if (s.profile.supportsPocket && config.options?.pocket && config.pocket) {
    add('frontPocket', pocketGeometry(s, config.pocket), 'pocket');
    const p = config.pocket;
    const stitch = stitchGeometry(s, p.bottom + p.height - 4, true, -p.width / 2 + 4, p.width / 2 - 4);
    stitch.translate(0, 0, mmToScene(1.5));
    add('pocketTopStitches', stitch, 'seam', seams);
  }

  const optionState = addBagOptions(config, bag, { shape:s, add,
    pocketShape:()=>innerPocketShape(config,s),
    innerPoint:(x,y)=>innerPocketPointMM(x,y,s,config),
    bodyPoint:(x,y,front)=>printableBodyPoint(x,y,s,front),
    exteriorPoint:(x,y,front)=>printablePoint(x,y,s,config,front),
    sidePoint:(t,y,right)=>sidePoint(t,y,s,right),
    rearLiningPoint:(x,y)=>rearLiningPoint(x,y,s),
    liningRightLimit:y=>Math.max(...perimeter(s,y,INNER_OFFSET).map(point=>point.x)),
    sliceAt:y=>sliceAt(y,s), ribbonGeometry });

  let partCount = 0, triangleCount = 0;
  bag.traverse(object => {
    if (!object.isMesh) return;
    partCount++;
    triangleCount += (object.geometry.index?.count ?? object.geometry.getAttribute('position').count) / 3;
  });
  bag.userData.metrics = {
    dimensions: { width: s.width, height: s.height, depth: s.depth },
    construction:s.construction,nominalDepth:s.profile.depthBasis==='opening-estimate'?0:s.depth,
    fullSideTaperMm:s.pouchTaperMm,widthBasis:s.pouch?'mouth-width':'body-maximum',
    supportsHandles:s.supportsHandles,foldedBottom:!s.sample,
    bottomPanelHeight: s.panelHeight,
    handleWidth: s.handle.width, handleThickness: s.handle.thickness,
    handleDrop: s.handle.drop, handleGap: s.handle.gap,
    handleAttachmentCenters: [-s.handle.gap / 2, s.handle.gap / 2],
    handleLegStartHeight: handleLegStart(s),
    handleAttachment: s.profile.handleAttachment,
    productId: s.profile.id, productType: s.profile.type,
    partCount, triangleCount, openTop: optionState.closure !== 'zipper',
    closure:optionState.closure, crossStrap:optionState.crossStrap,
    optionVisuals:bag.userData.optionVisuals,
  };
  return bag;
}

export function disposeBagModel(group) {
  const disposed = new Set();
  group.traverse(object => {
    if (!object.geometry || disposed.has(object.geometry)) return;
    object.geometry.dispose();
    disposed.add(object.geometry);
  });
}
