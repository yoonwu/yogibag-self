import * as THREE from '../vendor/three/three.module.js';
import * as surfaces from './model.mjs?v=1.2.12';
import { MM_TO_SCENE } from './config.mjs?v=1.2.12';

// Sewn layers have a continuous padded body, not just a patterned decal.
// The rounded shoulder stays in the silhouette even when individual threads
// are smaller than a pixel. Heights are display estimates in physical mm.
export const EMBROIDERY_EDGE_MM = .4;
export const EMBROIDERY_CREST_MM = 1.75;
export const EMBROIDERY_CONTACT_MM = .12;
export function embroideryHeightFromDistance(distance) {
  return EMBROIDERY_EDGE_MM+(EMBROIDERY_CREST_MM-EMBROIDERY_EDGE_MM)*Math.sin(Math.PI/2*Math.min(1,Math.max(0,distance)/1.15));
}

export function sampleEmbroideryElevation(plan,mx,my) {
  const a=plan.analysis;if(!a)return EMBROIDERY_CREST_MM;
  const px=mx/a.dx-.5,py=my/a.dy-.5,x=Math.floor(px),y=Math.floor(py),fx=px-x,fy=py-y;
  let height=0;
  for(let oy=0;oy<2;oy++)for(let ox=0;ox<2;ox++) {
    const xx=x+ox,yy=y+oy,i=yy*a.width+xx;
    const inside=xx>=0&&yy>=0&&xx<a.width&&yy<a.height&&a.labels[i];
    const h=inside?embroideryHeightFromDistance(Math.max(0,a.distance[i]-.5)*Math.min(a.dx,a.dy)):EMBROIDERY_EDGE_MM;
    height+=h*(ox?fx:1-fx)*(oy?fy:1-fy);
  }
  return height;
}

export function embroiderySurfacePoint(config,side,mx,my,z,width,height) {
  const print=config.print[side],angle=print.rotation*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
  const lx=mx-width/2,ly=height/2-my,x=print.x+lx*c-ly*s,y=print.y+lx*s+ly*c;
  const surface=(x,y,c)=>surfaces.printSurfaceMM(x,y,c,side);
  const p=surface(x,y,config),n=side==='innerPocket'?new THREE.Vector3(0,0,1):new THREE.Vector3(p.normal?.x||0,p.normal?.y||0,p.normal?.z??(side==='back'?-1:1)).normalize();
  const bounds=side==='innerPocket'?print.partDimensions:config.dimensions;
  return {point:new THREE.Vector3(p.x,p.y,p.z).addScaledVector(n,z*MM_TO_SCENE),normal:n,
    visible:p.visible!==false&&p.contourVisible!==false&&Math.abs(x)<=bounds.width/2&&Math.abs(y)<=bounds.height/2};
}

export function createEmbroideryReliefGeometry(config,side,plan) {
  const a=plan.analysis;if(!a)return null;
  const positions=[],uvs=[],indices=[],lookup=new Map();
  const node=(x,y)=>{
    const i=y*a.width+x,inside=x>=0&&y>=0&&x<a.width&&y<a.height&&Boolean(a.labels[i]);
    return {mx:(x+.5)*a.dx,my:(y+.5)*a.dy,inside,
      z:inside?embroideryHeightFromDistance(Math.max(0,a.distance[i]-.5)*Math.min(a.dx,a.dy)):0};
  };
  const vertex=v=>{
    const key=`${Math.round(v.mx*1e5)}:${Math.round(v.my*1e5)}:${Math.round(v.z*1e5)}`;
    if(lookup.has(key))return lookup.get(key);
    const sample=embroiderySurfacePoint(config,side,v.mx,v.my,v.z,plan.widthMm,plan.heightMm);
    if(!sample.visible)return -1;
    const id=positions.length/3;positions.push(...sample.point.toArray());uvs.push(v.mx/plan.widthMm,1-v.my/plan.heightMm);lookup.set(key,id);return id;
  };
  const triangle=(x,y,z)=>{const ids=[vertex(x),vertex(y),vertex(z)];if(ids.every(i=>i>=0))indices.push(...ids);};
  const edge=(p,q)=>({mx:(p.mx+q.mx)/2,my:(p.my+q.my)/2,z:EMBROIDERY_EDGE_MM,inside:true,edge:true});
  const emit=source=>{
    // Clip the alpha contour itself instead of displacing a rectangular image
    // sheet. Hollow letters remain real holes at every viewing angle.
    const polygon=[];
    for(let i=0;i<3;i++) {
      const p=source[i],q=source[(i+1)%3];
      if(p.inside)polygon.push(p);
      if(p.inside!==q.inside)polygon.push(edge(p,q));
    }
    if(polygon.length<3)return;
    for(let i=1;i<polygon.length-1;i++)triangle(polygon[0],polygon[i+1],polygon[i]);
    for(let i=0;i<polygon.length;i++) {
      const p=polygon[i],q=polygon[(i+1)%polygon.length];
      if(!p.edge||!q.edge)continue;
      const lowerP={...p,z:EMBROIDERY_CONTACT_MM},lowerQ={...q,z:EMBROIDERY_CONTACT_MM};
      triangle(p,lowerP,q);triangle(q,lowerP,lowerQ);
    }
  };
  const covered=new Uint8Array(a.width*a.height);
  // Keep the original fine grid around shoulders, holes and colour seams.
  // On a broad flat sewn plateau, one curved-cloth patch replaces many cells.
  const flat=(x,y)=>x>=0&&y>=0&&x<a.width&&y<a.height&&a.labels[y*a.width+x]
    && Math.max(0,a.distance[y*a.width+x]-.5)*Math.min(a.dx,a.dy)>=1.15;
  const block=Math.max(1,Math.min(12,Math.floor(5/Math.max(a.dx,a.dy))));
  for(let y=0;y<a.height-1;y+=block)for(let x=0;x<a.width-1;x+=block) {
    const right=Math.min(a.width-1,x+block),bottom=Math.min(a.height-1,y+block);
    if(right-x<2||bottom-y<2)continue;
    let plateau=true;
    for(let yy=y;yy<=bottom&&plateau;yy++)for(let xx=x;xx<=right;xx++)if(!flat(xx,yy)){plateau=false;break;}
    if(plateau&&side==='innerPocket')for(let yy=y;yy<=bottom&&plateau;yy++)for(let xx=x;xx<=right;xx++) {
      const v=node(xx,yy);
      if(!embroiderySurfacePoint(config,side,v.mx,v.my,v.z,plan.widthMm,plan.heightMm).visible){plateau=false;break;}
    }
    if(!plateau)continue;
    const corners=[node(x,y),node(right,y),node(x,bottom),node(right,bottom)];
    // Do not merge across the bag silhouette or the real pocket opening.
    if(!corners.every(v=>embroiderySurfacePoint(config,side,v.mx,v.my,v.z,plan.widthMm,plan.heightMm).visible))continue;
    triangle(corners[0],corners[2],corners[1]);triangle(corners[1],corners[2],corners[3]);
    for(let yy=y;yy<bottom;yy++)covered.fill(1,yy*a.width+x,yy*a.width+right);
  }
  for(let y=-1;y<a.height;y++)for(let x=-1;x<a.width;x++) {
    if(x>=0&&y>=0&&covered[y*a.width+x])continue;
    const tl=node(x,y),tr=node(x+1,y),bl=node(x,y+1),br=node(x+1,y+1);
    if(!tl.inside&&!tr.inside&&!bl.inside&&!br.inside)continue;
    emit([tl,tr,bl]);emit([tr,br,bl]);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  geometry.setIndex(indices);geometry.computeVertexNormals();geometry.computeBoundingSphere();
  return geometry;
}

export function createEmbroideryContactShadow(config,side,texture,plan) {
  if(!texture)return null;
  const margin=texture.userData.marginMm||3,width=plan.widthMm+margin*2,height=plan.heightMm+margin*2;
  const positions=[],uvs=[],indices=[],valid=[],across=24,down=24;
  for(let y=0;y<=down;y++)for(let x=0;x<=across;x++) {
    const sample=embroiderySurfacePoint(config,side,x/across*width-margin,y/down*height-margin,.18,plan.widthMm,plan.heightMm);
    positions.push(...sample.point.toArray());uvs.push(x/across,1-y/down);
    valid.push(sample.visible);
  }
  for(let y=0;y<down;y++)for(let x=0;x<across;x++) {
    const n=y*(across+1)+x;
    for(const tri of [[n,n+across+1,n+1],[n+1,n+across+1,n+across+2]])if(tri.every(i=>valid[i]))indices.push(...tri);
  }
  const remap=new Map(),compactPositions=[],compactUV=[],compactIndices=[];
  for(const old of indices) {
    if(!remap.has(old)) {
      remap.set(old,compactPositions.length/3);
      compactPositions.push(...positions.slice(old*3,old*3+3));compactUV.push(...uvs.slice(old*2,old*2+2));
    }
    compactIndices.push(remap.get(old));
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(compactPositions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(compactUV,2));geometry.setIndex(compactIndices);
  const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,side:THREE.FrontSide,toneMapped:false}));
  mesh.name=`embroideryContactShadow-${side}`;mesh.renderOrder=.5;
  mesh.raycast=()=>{};
  return mesh;
}
