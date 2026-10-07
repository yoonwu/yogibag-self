import * as THREE from '../vendor/three/three.module.js';
import { mmToScene, getProductProfile } from './config.mjs';

// Option sizes are visual references in millimetres. Options share the
// viewer-owned materials; the inner pocket hangs as an independent pouch.
// Its proportions follow the existing 2D inner-pocket.png. Physical sizes
// and attachment height are estimates; artwork uses the whole-piece center.
export function getInnerPocketLayout(config) {
  const { width, height } = config.dimensions;
  const part = config.print?.innerPocket?.partDimensions || {};
  const positive = (value, fallback) => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : fallback;
  const pocketWidth = Math.min(positive(part.width, 140), width - 40);
  const pocketHeight = Math.min(positive(part.height, 120), height - 30);
  const profile=getProductProfile(config),depth=config.dimensions.depth;
  const folded=profile.construction&&profile.construction!=='sample'||profile.id==='daily';
  const floorClearance=folded?Math.min(height*.035,depth*.08+2)+Math.min(height*.02,depth*.12)+3.5:0;
  const top = Math.max(height - 25,pocketHeight+floorClearance);
  return { width: pocketWidth, height: pocketHeight, top,
    bottom: top - pocketHeight, centerX: 0, centerY: top - pocketHeight / 2,
    bandHeight: pocketHeight*0.2, mouthY: pocketHeight*0.3,
    openingHeight: 0.8, bindingWidth: pocketWidth*0.04,
    cornerRadius: Math.min(pocketWidth*0.08, pocketHeight*0.24), lipHeight: 1.1 };
}

export function innerPocketHalfWidth(y, layout, inset = 0) {
  const halfWidth = layout.width/2-inset, bottom = -layout.height/2+inset;
  const radius = Math.max(0, layout.cornerRadius-inset);
  if (y < bottom || y > layout.height/2) return -1;
  if (!radius || y >= bottom+radius) return halfWidth;
  return halfWidth-radius + Math.sqrt(Math.max(0, radius*radius-(bottom+radius-y)**2));
}

export function innerPocketContourVisible(x, y, layout) {
  const halfWidth = innerPocketHalfWidth(y, layout);
  return halfWidth >= 0 && Math.abs(x) <= halfWidth + 1e-7;
}

export function innerPocketRegion(y, layout) {
  if (y <= layout.mouthY-layout.openingHeight/2+1e-7) return 'pouch';
  if (y >= layout.mouthY+layout.openingHeight/2-1e-7) return 'band';
  return 'opening';
}

export function innerPocketBindingDistance(x, y, layout) {
  const halfWidth = layout.width/2, bottom = -layout.height/2, radius = layout.cornerRadius;
  if (y < bottom+radius && Math.abs(x) > halfWidth-radius) {
    return radius - Math.hypot(Math.abs(x)-(halfWidth-radius), y-(bottom+radius));
  }
  return Math.min(halfWidth-Math.abs(x), y-bottom);
}

function grid(columns, rows, sample, reverse = false) {
  const positions = [], uv = [], indices = [];
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= columns; i++) {
    const p = sample(i / columns, j / rows);
    positions.push(mmToScene(p.x), mmToScene(p.y), mmToScene(p.z));
    uv.push(mmToScene(p.u ?? p.x), mmToScene(p.v ?? p.y));
  }
  for (let j = 0; j < rows; j++) for (let i = 0; i < columns; i++) {
    const a = j * (columns + 1) + i, b = a + 1, c = a + columns + 1, d = c + 1;
    if (reverse) indices.push(a, c, b, b, c, d);
    else indices.push(a, b, c, b, d, c);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals(); geometry.computeBoundingBox();
  return geometry;
}

function place(mesh, point) {
  mesh.position.set(mmToScene(point.x), mmToScene(point.y), mmToScene(point.z));
  return mesh;
}

function box(width, height, depth) {
  return new THREE.BoxGeometry(mmToScene(width), mmToScene(height), mmToScene(depth));
}

function metalCircle(radius, thickness) {
  const geometry = new THREE.CylinderGeometry(mmToScene(radius), mmToScene(radius), mmToScene(thickness), 20);
  geometry.rotateX(Math.PI / 2); geometry.computeBoundingBox();
  return geometry;
}

function appendBox(positions, x, y, z, width, height, depth) {
  const vertices = [
    [x-width/2,y-height/2,z-depth/2], [x+width/2,y-height/2,z-depth/2],
    [x+width/2,y+height/2,z-depth/2], [x-width/2,y+height/2,z-depth/2],
    [x-width/2,y-height/2,z+depth/2], [x+width/2,y-height/2,z+depth/2],
    [x+width/2,y+height/2,z+depth/2], [x-width/2,y+height/2,z+depth/2],
  ];
  const faces = [0,2,1,0,3,2, 4,5,6,4,6,7, 0,1,5,0,5,4,
    3,7,6,3,6,2, 0,4,7,0,7,3, 1,2,6,1,6,5];
  for (const index of faces) positions.push(...vertices[index].map(mmToScene));
}

function zipperTeethGeometry(s, halfWidth) {
  const positions = [];
  const count = Math.floor(halfWidth * 2 / 5);
  for (let i = 0; i <= count; i++) {
    const x = -halfWidth + i * 5;
    appendBox(positions, x, s.height + 0.6, -1.6, 2.4, 1.5, 3.2);
    appendBox(positions, x + 1.3, s.height + 0.6, 1.6, 2.4, 1.5, 3.2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(positions.length / 3 * 2), 2));
  geometry.computeVertexNormals(); geometry.computeBoundingBox();
  return geometry;
}

function combineGeometry(parts) {
  const positions = [], uv = [], indices = [];
  for (const part of parts) {
    const offset = positions.length / 3;
    positions.push(...part.getAttribute('position').array);
    uv.push(...part.getAttribute('uv').array);
    for (const index of part.index.array) indices.push(offset + index);
    part.dispose();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals(); geometry.computeBoundingBox();
  return geometry;
}

function bindingPath(layout, inset, fraction) {
  const halfWidth=layout.width/2-inset, bottom=-layout.height/2+inset;
  const radius=Math.max(0.1,layout.cornerRadius-inset);
  const cornerY=-layout.height/2+layout.cornerRadius;
  const sideLength=layout.height/2-cornerY, arcLength=Math.PI*radius/2;
  const bottomLength=layout.width-2*layout.cornerRadius;
  const length=sideLength*2+arcLength*2+bottomLength;
  let distance=THREE.MathUtils.clamp(fraction,0,1)*length;
  if(distance<=sideLength)return {x:-halfWidth,y:layout.height/2-distance,dx:0,dy:-1,length};
  distance-=sideLength;
  if(distance<=arcLength){const angle=Math.PI+distance/radius;return {
    x:-layout.width/2+layout.cornerRadius+radius*Math.cos(angle),
    y:cornerY+radius*Math.sin(angle),dx:-Math.sin(angle),dy:Math.cos(angle),length};}
  distance-=arcLength;
  if(distance<=bottomLength)return {x:-layout.width/2+layout.cornerRadius+distance,y:bottom,dx:1,dy:0,length};
  distance-=bottomLength;
  if(distance<=arcLength){const angle=Math.PI*1.5+distance/radius;return {
    x:layout.width/2-layout.cornerRadius+radius*Math.cos(angle),
    y:cornerY+radius*Math.sin(angle),dx:-Math.sin(angle),dy:Math.cos(angle),length};}
  distance-=arcLength;
  return {x:halfWidth,y:cornerY+distance,dx:0,dy:1,length};
}

function pocketFace(layout,h,inset,top,back=false) {
  const bottom=-layout.height/2+inset;
  const radius=Math.max(0,layout.cornerRadius-inset),knots=[];
  const cornerSteps=back?4:8,straightSteps=back?4:12;
  for(let i=0;i<=cornerSteps;i++)knots.push(bottom+radius*(1-Math.cos(Math.PI*i/(2*cornerSteps))));
  for(let i=1;i<=straightSteps;i++)knots.push(THREE.MathUtils.lerp(bottom+radius,top,i/straightSteps));
  return grid(back?12:16,knots.length-1,(u,v)=>{
    const y=knots[Math.round(v*(knots.length-1))];
    const x=(u*2-1)*innerPocketHalfWidth(y,layout,inset);
    const p=h.innerPoint(x,y);
    if(back)p.z=layout.backZ;
    return p;
  });
}

function bindingKnots(layout,inset) {
  const radius=Math.max(.1,layout.cornerRadius-inset);
  const side=layout.height-layout.cornerRadius,arc=Math.PI*radius/2,bottom=layout.width-2*layout.cornerRadius;
  const total=side*2+arc*2+bottom,knots=[0];let distance=0;
  for(const [length,count] of [[side,14],[arc,10],[bottom,14],[arc,10],[side,14]]){
    for(let i=1;i<=count;i++)knots.push((distance+length*i/count)/total);
    distance+=length;
  }
  return knots;
}

function pocketStitches(layout,h) {
  const parts=[];
  const run=(length,point,maxCount)=>{
    const pitch=Math.max(4,length/maxCount);
    for(let d=0;d+2.1<=length;d+=pitch)parts.push(grid(2,1,(u,v)=>{
      const at=point((d+v*2.1)/length), across=(u-.5)*.45;
      const p=h.innerPoint(at.x+at.dy*across,at.y-at.dx*across);
      p.z+=.1+Math.sin(Math.PI*u)*.05;return p;
    }));
  };
  const inset=layout.bindingWidth*.75, path=bindingPath(layout,inset,0);
  run(path.length,t=>bindingPath(layout,inset,t),96);
  const halfWidth=layout.width/2-layout.bindingWidth-1;
  for(const y of [layout.height/2-1.5,layout.mouthY-layout.openingHeight/2-.7]){
    run(halfWidth*2,t=>({x:(t*2-1)*halfWidth,y,dx:1,dy:0}),48);
  }
  return combineGeometry(parts);
}

function addInnerPocket(config, bag, h, optionGroup) {
  const layout=h.pocketShape(), pouchTop=layout.mouthY-layout.openingHeight/2;
  const pocket=h.add('innerPocket',pocketFace(layout,h,layout.bindingWidth,pouchTop-layout.lipHeight),'innerPocket',optionGroup);
  pocket.userData.partDimensions={width:layout.width,height:layout.height};
  pocket.userData.printCoordinates='inner-pocket-whole-piece-center-mm';
  h.add('innerPocketBack',pocketFace(layout,h,0,pouchTop,true),'inside',optionGroup);
  const band=h.add('innerPocketMountingBand',grid(14,2,(u,v)=>h.innerPoint(
    (u*2-1)*(layout.width/2-layout.bindingWidth),
    THREE.MathUtils.lerp(layout.mouthY+layout.openingHeight/2,layout.height/2,v))),'innerPocket',optionGroup);
  band.userData.nominalHeightMm=layout.bandHeight;
  band.userData.heightFraction=.2;
  const hem=h.add('innerPocketHem',grid(18,2,(u,v)=>h.innerPoint(
    (u*2-1)*(layout.width/2-layout.bindingWidth),pouchTop-layout.lipHeight+v*layout.lipHeight)),
  'pocketEdge',optionGroup);
  hem.userData.openMouth=true;
  hem.userData.openingYmm=layout.mouthY;
  hem.userData.backingGapMm=layout.gap;
  h.add('innerPocketMouthShadow',grid(18,1,(u,v)=>({
    x:(u*2-1)*(layout.width/2-layout.bindingWidth),
    y:layout.centerY+layout.mouthY+(v-.5)*layout.openingHeight,
    z:layout.backZ+.05})), 'pocketShadow',optionGroup);
  const bindingRows=bindingKnots(layout,layout.bindingWidth/2),wrapRows=bindingKnots(layout,0);
  const binding=h.add('innerPocketBinding',grid(4,bindingRows.length-1,(u,v)=>{
    const at=bindingPath(layout,layout.bindingWidth/2,bindingRows[Math.round(v*(bindingRows.length-1))]),across=(u-.5)*layout.bindingWidth;
    return h.innerPoint(at.x+at.dy*across,at.y-at.dx*across);
  }), 'pocketEdge',optionGroup);
  binding.userData.widthMm=layout.bindingWidth;
  binding.userData.cornerRadiusMm=layout.cornerRadius;
  h.add('innerPocketBindingWrap',grid(1,wrapRows.length-1,(u,v)=>{
    const at=bindingPath(layout,0,wrapRows[Math.round(v*(wrapRows.length-1))]),p=h.innerPoint(at.x,at.y);
    p.z=THREE.MathUtils.lerp(p.z,layout.backZ,u);return p;
  }), 'pocketEdge',optionGroup);
  h.add('innerPocketStitches',pocketStitches(layout,h),'pocketStitch',optionGroup);
  bag.userData.innerPocketLayout={...layout,wholePieceOrigin:true};
}

function addClosure(config, s, h, optionGroup) {
  const kind = s.pouch || config.options?.zipper ? 'zipper' : config.options?.magnet ? 'magnet' : config.options?.snap ? 'snap' : null;
  if (!kind) return null;
  if (kind === 'zipper') {
    const mouth = h.sliceAt(s.height);
    const halfWidth = Math.max(30, mouth.a - mouth.r - 8);
    for (const front of [true, false]) {
      h.add(front ? 'zipperTapeFront' : 'zipperTapeBack', grid(28, 2, (u, v) => {
        const x = (u*2-1)*halfWidth;
        const lip = h.bodyPoint(x, s.height, front);
        return { x, y: s.height - 1.2 + Math.sin(Math.PI*u)*0.5,
          z: lip.z*(1-v), u: x, v: Math.abs(lip.z)*(1-v) };
      }, !front), 'handle', optionGroup);
    }
    const topShift=s.pouch?-3:0;
    const teeth=zipperTeethGeometry(s,halfWidth);if(topShift)teeth.translate(0,mmToScene(topShift),0);
    h.add('zipperTeeth', teeth, 'zipper', optionGroup);
    const slider = place(h.add('zipperSlider', box(9,4,10), 'zipper', optionGroup),
      { x: halfWidth-13, y:s.height+3+topShift, z:0 });
    slider.rotation.y = 0.15;
    const pull = new THREE.TorusGeometry(mmToScene(4), mmToScene(0.8), 5, 16);
    pull.rotateX(Math.PI/2); pull.scale(1,1,1.7);
    place(h.add('zipperPull', pull, 'snap', optionGroup), { x:halfWidth-13,y:s.height+5+topShift,z:9 });
    if(s.pouch)for(const front of [true,false]){
      const sign=front?1:-1,band=h.add(`zipperHeader${front?'Front':'Back'}`,grid(24,3,(u,v)=>{
        const p=h.bodyPoint((u*2-1)*halfWidth,s.height-15+v*13,front);p.z+=sign*.2;return p;
      },!front),'body',optionGroup);
      band.userData.construction='bound-top-zipper-band';band.userData.heightMm=13;
    }
    return kind;
  }
  const radius = kind === 'magnet' ? 9 : 7;
  for (const front of [true, false]) {
    const sign = front ? 1 : -1;
    const lip = h.bodyPoint(0, s.height-11, front);
    const prefix = `${kind}${front ? 'Front' : 'Back'}`;
    const tab = grid(4, 8, (u,v) => {
      const p=h.bodyPoint((u-0.5)*22,s.height-28+v*25,front);
      p.z -= sign*1.6; return p;
    }, !front);
    h.add(`${prefix}Tab`, tab, 'body', optionGroup);
    place(h.add(prefix, metalCircle(radius,2.2), 'snap', optionGroup),
      {x:0,y:s.height-11,z:lip.z-sign*3.2});
    place(h.add(`${prefix}Center`, metalCircle(kind==='magnet'?2.8:2,1.2), 'zipper', optionGroup),
      {x:0,y:s.height-11,z:lip.z-sign*4.5});
    const epsilon=.2,exterior=h.exteriorPoint||h.bodyPoint;
    const px1=exterior(epsilon,lip.y,front),px0=exterior(-epsilon,lip.y,front);
    const py1=exterior(0,lip.y+epsilon,front),py0=exterior(0,lip.y-epsilon,front);
    const normal=new THREE.Vector3(-sign*(px1.z-px0.z)/(2*epsilon),-sign*(py1.z-py0.z)/(2*epsilon),sign).normalize();
    const rotation=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),normal);
    // Seat the cap outside the complete curved cloth footprint, not just its
    // centre, so the disc remains visible at the shortest/deepest dimensions.
    let clearance=.3;
    for(let iteration=0;iteration<6;iteration++)for(let i=0;i<24;i++){
      const angle=Math.PI*2*i/24;
      const edge=new THREE.Vector3(Math.cos(angle)*radius,Math.sin(angle)*radius,0).applyQuaternion(rotation);
      const p=exterior(edge.x+normal.x*clearance,lip.y+edge.y+normal.y*clearance,front);
      const separation=sign*(lip.z+edge.z+normal.z*clearance-p.z);
      if(separation<.25)clearance+=(.25-separation)/Math.abs(normal.z);
    }
    const cap=h.add(`${prefix}OuterCap`,metalCircle(radius,1.2),'snap',optionGroup);
    cap.quaternion.copy(rotation);
    cap.position.set(mmToScene(normal.x*(clearance+.6)),mmToScene(lip.y+normal.y*(clearance+.6)),
      mmToScene(lip.z+normal.z*(clearance+.6)));
    cap.userData.location='outside';
    cap.userData.closureKind=kind;
  }
  return kind;
}

function strapFrame(point) {
  const tangent=new THREE.Vector3(point.tangent.x,point.tangent.y,point.tangent.z).normalize();
  const lateral=point.lateral?new THREE.Vector3(point.lateral.x,point.lateral.y,point.lateral.z).normalize()
    :new THREE.Vector3(tangent.y,-tangent.x,0).normalize();
  const normal=new THREE.Vector3().crossVectors(lateral,tangent).normalize();
  return {tangent,lateral,normal};
}

function movedStrapPoint(point,lateralOffset=0,normalOffset=0) {
  const frame=strapFrame(point),p=new THREE.Vector3(point.x,point.y,point.z)
    .addScaledVector(frame.lateral,lateralOffset).addScaledVector(frame.normal,normalOffset);
  return {...point,x:p.x,y:p.y,z:p.z};
}

// Two long straight slopes meet through a short, rounded shoulder fold.
// The bend has room for the complete ribbon width, even at minimum length.
function strapPoints(s,anchorLeft,anchorRight,angle,compact=false) {
  const halfSpan=(anchorRight.x-anchorLeft.x)/2,centerX=(anchorRight.x+anchorLeft.x)/2;
  const radius=s.handle.width/2+Math.max(2,s.handle.thickness*.8);
  const straight=(halfSpan-radius*Math.sin(angle))/Math.cos(angle);
  const length2D=2*straight+2*radius*angle;
  const rise=straight*Math.sin(angle)+radius*(1-Math.cos(angle));
  const points=[],depthLift=Math.min(8,s.depth*.04)*Math.sin(angle);
  const push=(x,y,tx,ty,distance)=>{
    const fraction=distance/length2D;
    const tangent=new THREE.Vector3(tx,ty,-depthLift*Math.PI/length2D*Math.sin(2*Math.PI*fraction)).normalize();
    const lateral=new THREE.Vector3(tangent.y,-tangent.x,0).normalize()
      .applyAxisAngle(tangent,.13*Math.sin(2*Math.PI*fraction)*Math.sin(angle));
    points.push({x:centerX+x,y:anchorLeft.y+y,
      z:anchorLeft.z-depthLift*Math.sin(Math.PI*fraction)**2,
      tangent:{x:tangent.x,y:tangent.y,z:tangent.z},
      lateral:{x:lateral.x,y:lateral.y,z:lateral.z},distanceMm:distance});
  };
  const sideSteps=compact?10:24,foldSteps=compact?12:28;
  for(let i=0;i<=sideSteps;i++){
    const d=straight*i/sideSteps;
    push(-halfSpan+d*Math.cos(angle),d*Math.sin(angle),Math.cos(angle),Math.sin(angle),d);
  }
  for(let i=1;i<=foldSteps;i++){
    const bend=Math.PI/2+angle-2*angle*i/foldSteps;
    push(radius*Math.cos(bend),rise-radius+radius*Math.sin(bend),Math.sin(bend),-Math.cos(bend),straight+2*radius*angle*i/foldSteps);
  }
  for(let i=1;i<=sideSteps;i++){
    const d=straight*i/sideSteps;
    push(radius*Math.sin(angle)+d*Math.cos(angle),straight*Math.sin(angle)-d*Math.sin(angle),Math.cos(angle),-Math.sin(angle),straight+2*radius*angle+d);
  }
  return points;
}

function pathLength(points) {
  let length=0;
  for(let i=1;i<points.length;i++)length+=Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y,points[i].z-points[i-1].z);
  return length;
}

function tubePath(points,radius,planeNormal,closed=false,radialSegments=6) {
  const count=closed?points.length:points.length-1;
  return grid(radialSegments,count,(u,v)=>{
    const index=Math.round(v*count)%points.length,p=points[index];
    const before=points[closed?(index+points.length-1)%points.length:Math.max(0,index-1)];
    const after=points[closed?(index+1)%points.length:Math.min(points.length-1,index+1)];
    const tangent=new THREE.Vector3(after.x-before.x,after.y-before.y,after.z-before.z).normalize();
    const lateral=new THREE.Vector3().crossVectors(planeNormal,tangent).normalize();
    const q=new THREE.Vector3(p.x,p.y,p.z).addScaledVector(lateral,radius*Math.cos(u*Math.PI*2))
      .addScaledVector(planeNormal,radius*Math.sin(u*Math.PI*2));
    return {x:q.x,y:q.y,z:q.z,u:u*Math.PI*2*radius,v:v*pathLength(points)};
  });
}

function roundedRectangle(width,height,radius,point,steps=5) {
  const points=[];
  for(const [cx,cy,start] of [[width/2-radius,height/2-radius,0],[-width/2+radius,height/2-radius,Math.PI/2],
    [-width/2+radius,-height/2+radius,Math.PI],[width/2-radius,-height/2+radius,Math.PI*1.5]]){
    for(let i=0;i<=steps;i++){
      const a=start+Math.PI/2*i/steps;points.push(point(cx+radius*Math.cos(a),cy+radius*Math.sin(a)));
    }
  }
  return points;
}

function strapStitches(points,s,compact=false) {
  const parts=[],pitch=Math.max(7,pathLength(points)/(compact?32:100));
  let next=4;
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],distance=pathLength(points.slice(0,i+1));
    while(next<=distance){
      const span=Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z),blend=1-(distance-next)/span;
      const p={...b,x:THREE.MathUtils.lerp(a.x,b.x,blend),y:THREE.MathUtils.lerp(a.y,b.y,blend),z:THREE.MathUtils.lerp(a.z,b.z,blend)};
      const frame=strapFrame(p);
      for(const edge of [-1,1])parts.push(grid(1,1,(u,v)=>{
        const q=new THREE.Vector3(p.x,p.y,p.z).addScaledVector(frame.lateral,edge*(s.handle.width/2-1.5)+(u-.5)*.4)
          .addScaledVector(frame.tangent,(v-.5)*2.3).addScaledVector(frame.normal,s.handle.thickness/2+.13);
        return {x:q.x,y:q.y,z:q.z};
      }));
      next+=pitch;
    }
  }
  return combineGeometry(parts);
}

function strapEndFold(point,s,h,compact=false) {
  const frame=strapFrame(point),radius=(s.handle.thickness+.9)/2,points=[];
  const steps=compact?6:10;
  for(let i=0;i<=steps;i++){
    const a=Math.PI*i/steps,p=new THREE.Vector3(point.x,point.y,point.z)
      .addScaledVector(frame.normal,radius*(Math.cos(a)-1)).addScaledVector(frame.tangent,-radius*Math.sin(a));
    const tangent=frame.normal.clone().multiplyScalar(-Math.sin(a)).addScaledVector(frame.tangent,-Math.cos(a));
    points.push({x:p.x,y:p.y,z:p.z,tangent:{x:tangent.x,y:tangent.y,z:tangent.z},
      lateral:{x:frame.lateral.x,y:frame.lateral.y,z:frame.lateral.z}});
  }
  return h.ribbonGeometry(points,s.handle.width,s.handle.thickness);
}

function addCrossStrap(config, s, h, optionGroup) {
  // Keep every optional fitting while using fewer subdivisions when the
  // existing body, lining, pockets and zipper already fill most of the budget.
  let existingTriangles=0;
  optionGroup.parent.traverse(mesh=>{if(mesh.isMesh)existingTriangles+=(mesh.geometry.index?.count??mesh.geometry.attributes.position.count)/3;});
  const compact=existingTriangles+(config.options?.nameTag?256:0)>19900;
  const tube=(points,radius,normal,closed=false)=>tubePath(points,radius,normal,closed,compact?4:6);
  const anchors=[h.sidePoint(.5,s.height-14,false),h.sidePoint(.5,s.height-14,true)];
  const attachmentRise=Math.max(28,s.handle.width*.55+12);
  for(let i=0;i<anchors.length;i++){
    const right=i===1, sign=right?1:-1, p=anchors[i];
    const tab=grid(compact?2:4,compact?4:8,(u,v)=>{
      const at=h.sidePoint(.5,s.height-32+v*25,right);
      return {x:at.x+sign*1.3,y:at.y,z:(u-.5)*18};
    }, right);
    h.add(`crossStrap${right?'Right':'Left'}Tab`,tab,'handle',optionGroup);
    const prefix=`crossStrap${right?'Right':'Left'}`,x=p.x+sign*3,plane=new THREE.Vector3(1,0,0);
    const ring=roundedRectangle(20,19,5,(z,y)=>({x,y:s.height-11+y,z}),compact?3:5);
    h.add(`${prefix}Ring`,tube(ring,1.5,plane,true),'crossStrapHardware',optionGroup);
    const hookHeight=attachmentRise-6,cy=s.height-1+hookHeight/2;
    const raw=[[-3,-.5],[-6,-.39],[-7,.15],[-5,.4],[0,.5],[5,.38],[6,.1],[4,-.23],[2,-.32]];
    const curve=new THREE.CatmullRomCurve3(raw.map(([z,y])=>new THREE.Vector3(x,cy+y*hookHeight,z)));
    const hook=curve.getPoints(compact?12:28).map(p=>({x:p.x,y:p.y,z:p.z}));
    h.add(`${prefix}Hook`,tube(hook,1.6,plane),'crossStrapHardware',optionGroup);
    const gate=[hook[hook.length-1],hook[0]];
    h.add(`${prefix}HookGate`,tube(gate,1.05,plane),'crossStrapHardware',optionGroup);
    const swivel=new THREE.CylinderGeometry(mmToScene(2.5),mmToScene(2.5),mmToScene(5),compact?6:10);
    place(h.add(`${prefix}Swivel`,swivel,'crossStrapHardware',optionGroup),{x,y:s.height+attachmentRise-3,z:0});
    anchors[i]={x,y:s.height+attachmentRise,z:0};
  }
  const requestedLength=Number(config.crossStrap?.length??800);
  const minimumLength=anchors[1].x-anchors[0].x;
  if(!Number.isFinite(requestedLength)||requestedLength<=minimumLength)throw new RangeError('Cross strap is shorter than its attachment distance.');
  let lo=0,hi=Math.PI/2-.001;
  for(let i=0;i<30;i++){
    const mid=(lo+hi)/2;
    if(pathLength(strapPoints(s,anchors[0],anchors[1],mid,compact))<requestedLength)lo=mid;else hi=mid;
  }
  const points=strapPoints(s,anchors[0],anchors[1],(lo+hi)/2,compact);
  const strap=h.add('crossStrap',h.ribbonGeometry(points,s.handle.width,s.handle.thickness),'handle',optionGroup);
  strap.userData.centerlineMm=points.map(({x,y,z})=>({x,y,z}));
  strap.userData.widthMm=s.handle.width;strap.userData.thicknessMm=s.handle.thickness;
  const edgeWidth=Math.min(.7,s.handle.width*.025);
  for(const edge of [-1,1])h.add(`crossStrap${edge<0?'Lower':'Upper'}Edge`,grid(1,points.length-1,(u,v)=>
    movedStrapPoint(points[Math.round(v*(points.length-1))],edge*(s.handle.width-edgeWidth)/2+(u-.5)*edgeWidth,s.handle.thickness/2+.08)),
    'crossStrapEdge',optionGroup);
  h.add('crossStrapStitches',strapStitches(points,s,compact),'crossStrapStitch',optionGroup);
  const returnEnd=compact?8:20,offset=s.handle.thickness+.9;
  const returnPoints=points.slice(0,returnEnd+1).map(point=>movedStrapPoint(point,0,-offset));
  h.add('crossStrapReturn',h.ribbonGeometry(returnPoints,s.handle.width,s.handle.thickness),'handle',optionGroup);
  const rightTail=points.slice(-5).map(point=>movedStrapPoint(point,0,-offset));
  h.add('crossStrapRightTail',h.ribbonGeometry(rightTail,s.handle.width,s.handle.thickness),'handle',optionGroup);
  const endStitches=[];
  for(const point of [points[Math.min(3,returnEnd)],rightTail[1]]){
    const f=strapFrame(point);
    for(const along of [0,2.5])endStitches.push(grid(1,8,(u,v)=>{
      const q=new THREE.Vector3(point.x,point.y,point.z)
        .addScaledVector(f.lateral,(v-.5)*(s.handle.width-3))
        .addScaledVector(f.tangent,along+(u-.5)*.4)
        .addScaledVector(f.normal,s.handle.thickness/2+.13);
      return {x:q.x,y:q.y,z:q.z};
    }));
  }
  h.add('crossStrapEndStitches',combineGeometry(endStitches),'crossStrapStitch',optionGroup);
  for(const [suffix,point] of [['Left',points[0]],['Right',points[points.length-1]]]){
    h.add(`crossStrap${suffix}EndFold`,strapEndFold(point,s,h,compact),'handle',optionGroup);
    const frame=strapFrame(point),eyeCenter=movedStrapPoint(point,0,-offset/2);
    const eye=roundedRectangle(s.handle.width+4,7,2,(x,y)=>{
      const p=new THREE.Vector3(eyeCenter.x,eyeCenter.y,eyeCenter.z).addScaledVector(frame.lateral,x).addScaledVector(frame.tangent,y-2);
      return {x:p.x,y:p.y,z:p.z};
    },compact?2:5);
    h.add(`crossStrap${suffix}StrapEye`,tube(eye,1.1,frame.normal,true),'crossStrapHardware',optionGroup);
  }
  // A rectangular two-slot / three-bar adjuster follows the actual strap
  // tangent, rather than floating as a circular ring across its face.
  const bucklePoint=points[compact?6:14],frame=strapFrame(bucklePoint),buckleWidth=s.handle.width+6,buckleHeight=22;
  const buckleCenter=movedStrapPoint(bucklePoint,0,s.handle.thickness/2+1.65);
  const local=(x,y)=>{
    const p=new THREE.Vector3(buckleCenter.x,buckleCenter.y,buckleCenter.z).addScaledVector(frame.lateral,x).addScaledVector(frame.tangent,y);
    return {x:p.x,y:p.y,z:p.z};
  };
  const buckle=tube(roundedRectangle(buckleWidth,buckleHeight,3,local,compact?2:5),1.25,frame.normal,true);
  const bar=tube([local(-buckleWidth/2,0),local(buckleWidth/2,0)],1.25,frame.normal);
  const adjuster=h.add('crossStrapAdjuster',combineGeometry([buckle,bar]),'crossStrapHardware',optionGroup);
  adjuster.userData.type='three-bar-rectangular';
  adjuster.userData.widthMm=buckleWidth;adjuster.userData.heightMm=buckleHeight;
  adjuster.userData.frame={lateral:frame.lateral.toArray(),tangent:frame.tangent.toArray(),normal:frame.normal.toArray()};
  adjuster.userData.centerMm={x:buckleCenter.x,y:buckleCenter.y,z:buckleCenter.z};
  return {referenceLengthMm:requestedLength,requestedLengthMm:requestedLength,
    centerlineLengthMm:pathLength(points),minimumGeometryLengthMm:minimumLength,anchors,
    ordinaryHandlesVisible:!s.sample&&s.supportsHandles,shoulderRadiusMm:s.handle.width/2+Math.max(2,s.handle.thickness*.8),
    returnLayerGapMm:.9,attachmentRiseMm:attachmentRise,adjuster:'three-bar-rectangular',compactGeometry:compact};
}

function addNameTag(config,s,h,optionGroup){
  const pocket=getInnerPocketLayout(config),pocketEdge=pocket.width/2;
  const centerY=pocket.top-pocket.bandHeight/2;
  let rightLimit=Infinity;
  for(let i=0;i<=8;i++)rightLimit=Math.min(rightLimit,h.liningRightLimit(centerY-11+i/8*22)-4);
  const available=rightLimit-pocketEdge;
  const width=Math.min(50,Math.max(1,available-4));
  const gap=Math.min(30,Math.max(4,available-width));
  const height=22*width/50,left=pocketEdge+gap,centerX=left+width/2;
  const point=(x,y)=>{
    const p=h.rearLiningPoint(x,y);p.z+=.75;
    return p;
  };
  const tag=h.add('nameTag',grid(10,4,(u,v)=>point(left+u*width,centerY+(v-.5)*height)),
    'nameTag',optionGroup);
  tag.userData.location='inside-back-right';
  const layout={width,height,gapMm:gap,requestedGapMm:30,pocketEdgeX:pocketEdge,
    left,right:left+width,centerX,centerY,top:centerY+height/2,bottom:centerY-height/2,
    adjusted:Math.abs(gap-30)>.01||Math.abs(width-50)>.01};
  tag.userData.layout=layout;
  const inset=Math.min(2.3,width*.12),lineWidth=Math.min(.32,width*.025);
  const x0=left+inset,x1=left+width-inset,y0=layout.bottom+inset,y1=layout.top-inset;
  const borders=[];
  for(const [ax,ay,bx,by] of [[x0,y0,x1,y0],[x1,y0,x1,y1],[x1,y1,x0,y1],[x0,y1,x0,y0]]){
    const length=Math.hypot(bx-ax,by-ay);
    borders.push(grid(1,10,(u,v)=>{
      const p=point(THREE.MathUtils.lerp(ax,bx,v)+(by-ay)/length*(u-.5)*lineWidth,
        THREE.MathUtils.lerp(ay,by,v)-(bx-ax)/length*(u-.5)*lineWidth);
      p.z+=.08;return p;
    }));
  }
  h.add('nameTagBorder',combineGeometry(borders),'nameTagBorder',optionGroup);
  const stitches=[];
  for(const x of [left+inset*.3,left+width-inset*.3])for(let y=layout.bottom+1;y+1.4<layout.top-1;y+=3.5){
    stitches.push(grid(1,1,(u,v)=>{const p=point(x+(u-.5)*lineWidth*.65,y+v*1.4);p.z+=.09;return p;}));
  }
  h.add('nameTagStitches',combineGeometry(stitches),'nameTagBorder',optionGroup);
  return layout;
}

export function addBagOptions(config, bag, helpers) {
  const s=helpers.shape, options=config.options||{};
  const enabled=options.innerPocket||options.innerPocketPrint||options.snap||options.magnet||options.zipper||options.crossStrap||options.nameTag;
  const visuals={innerPocket:false,innerPocketPrint:false,snap:false,magnet:false,zipper:false,crossStrap:false,nameTag:false,
    individualPackaging:false,doubleSided:false};
  if(!enabled){bag.userData.optionVisuals=visuals;return {closure:null,crossStrap:null};}
  const group=new THREE.Group();group.name='productOptions';bag.add(group);
  if(options.innerPocket||options.innerPocketPrint){addInnerPocket(config,bag,helpers,group);visuals.innerPocket=true;}
  const closure=addClosure(config,s,helpers,group);
  if(closure)visuals[closure]=true;
  const crossStrap=options.crossStrap?addCrossStrap(config,s,helpers,group):null;
  if(crossStrap)visuals.crossStrap=true;
  if(options.nameTag){bag.userData.nameTagLayout=addNameTag(config,s,helpers,group);visuals.nameTag=true;}
  // Artwork is rendered by the independent print module. Packaging is a
  // consultation request and has no geometry pretending to be a finished pack.
  bag.userData.optionVisuals=visuals;
  return {closure,crossStrap};
}
