import * as THREE from '../vendor/three/three.module.js';
import { holdingPose } from './size-comparison.mjs?v=1.2.17';

export const CARRY_LABELS = Object.freeze({hand:'손에 들기',shoulder:'어깨에 메기',cross:'크로스끈으로 메기'});
const savedDrapes=new WeakMap(),projectionCache=new WeakMap();
const pointMM=p=>new THREE.Vector3(p.x/1000,p.y/1000,p.z/1000);

export function availableCarryModes(bag) {
  return ['hand',...(bag?.getObjectByName('handlesLoopBack')?['shoulder']:[]),...(bag?.getObjectByName('crossStrap')?['cross']:[])];
}

function length(points) {let total=0;for(let i=1;i<points.length;i++)total+=points[i].distanceTo(points[i-1]);return total;}

// Each cloth ring owns eight face vertices; recover its centre and tape frame.
// Keeping this correspondence avoids projecting folded tape onto the wrong leg.
function handleData(mesh) {
  const positions=mesh.geometry.getAttribute('position'),count=(positions.count-8)/8,points=[],frames=[];
  const v=i=>new THREE.Vector3().fromBufferAttribute(positions,i);
  for(let i=0;i<count;i++) {
    const k=i*8,center=new THREE.Vector3();
    for(let j=0;j<8;j++)center.add(v(k+j));
    points.push(center.divideScalar(8));
    const lateral=v(k+1).sub(v(k)).normalize(),normal=v(k).sub(v(k+6)).normalize();
    frames.push({lateral,normal,tangent:new THREE.Vector3().crossVectors(normal,lateral).normalize()});
  }
  return {points,frames};
}

export function wornHandleRoutes(bag,config,height) {
  const routes={};
  const backRoot=handleData(bag.getObjectByName('handlesLoopBack')).points[0];
  const radius=height*.045,crownZ=backRoot.z-height*.020;
  for(const name of ['handlesLoopFront','handlesLoopBack']) {
    const mesh=bag.getObjectByName(name),original=handleData(mesh),a=original.points[0],b=original.points.at(-1);
    const base=(a.y+b.y)/2,target=length(original.points),z=crownZ+(name.endsWith('Front')?-.003:.003);
    const pathAt=rise=>new THREE.CatmullRomCurve3([
      a,a.clone().add(new THREE.Vector3(0,.018,0)),
      new THREE.Vector3(-radius,base+rise-radius*.65,z),
      new THREE.Vector3(-radius*.55,base+rise-radius*.12,z),
      new THREE.Vector3(0,base+rise,z),
      new THREE.Vector3(radius*.55,base+rise-radius*.12,z),
      new THREE.Vector3(radius,base+rise-radius*.65,z),
      b.clone().add(new THREE.Vector3(0,.018,0)),b],false,'centripetal').getSpacedPoints(192);
    let lo=height*.105+.008,hi=Math.max(target,height);
    if(length(pathAt(lo))>target+.001)
      throw new Error('이 손잡이는 어깨에 메기에는 짧아요. 손잡이 길이를 늘리거나 크로스끈을 선택해 주세요.');
    for(let i=0;i<32;i++){const rise=(lo+hi)/2;if(length(pathAt(rise))<target)lo=rise;else hi=rise;}
    const path=pathAt((lo+hi)/2),data=pathData(path);
    routes[name]={original,data,lengthMm:data.total*1000};
  }
  const back=routes.handlesLoopBack.data.entries;
  const anchor=back.reduce((highest,p)=>p.point.y>highest.y?p.point:highest,back[0].point).clone();
  return {routes,anchor};
}

export function wornCrossPath(strap,config,height) {
  const original=strap.userData.centerlineMm.map(pointMM),a=original[0],b=original.at(-1);
  const target=length(original),width=b.x-a.x,mid=(a.x+b.x)/2,base=(a.y+b.y)/2;
  const shoulderRadius=Math.min(width*.20,height*.038),depth=-config.dimensions.depth/2000-.008;
  const pathAt=rise=>new THREE.CatmullRomCurve3([
    a,new THREE.Vector3(a.x+width*.16,base+rise*.47,depth*.36),
    new THREE.Vector3(mid-shoulderRadius,base+rise-height*.022,depth),
    new THREE.Vector3(mid,base+rise,depth),
    new THREE.Vector3(mid+shoulderRadius,base+rise-height*.022,depth),
    new THREE.Vector3(b.x-width*.16,base+rise*.47,depth*.36),b],false,'centripetal').getSpacedPoints(128);
  let lo=height*.035,hi=Math.max(target,height);
  if(length(pathAt(lo))>target+.001) throw new Error('어깨에 메려면 크로스끈 길이를 조금 늘려 주세요.');
  for(let i=0;i<32;i++){const m=(lo+hi)/2;if(length(pathAt(m))<target)lo=m;else hi=m;}
  const path=pathAt((lo+hi)/2);
  let anchor=path[0];for(const p of path)if(p.y>anchor.y)anchor=p;
  return {original,path,anchor:anchor.clone(),lengthMm:length(path)*1000};
}

export function wearingPose(heightCm,bag,config,mode='hand') {
  const pose=holdingPose(heightCm,bag,config);
  if(mode==='hand'||!availableCarryModes(bag).includes(mode))return pose;
  const h=pose.height,rotation=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI/2);
  const route=mode==='cross'?wornCrossPath(bag.getObjectByName('crossStrap'),config,h):wornHandleRoutes(bag,config,h);
  const anchor=route.anchor;
  const contact=pose.body.clone().add(new THREE.Vector3(mode==='cross'?.14*h:.105*h,.837*h,mode==='cross'?.025*h:-.035*h));
  const elbow=pose.body.clone().add(new THREE.Vector3(.14*h,.638*h,.10*h));
  const hand=pose.body.clone().add(new THREE.Vector3(.145*h,.473*h,.16*h));
  return {...pose,carryMode:mode,anchor,shoulderContact:contact,bagRotation:rotation,
    bagPosition:contact.clone().sub(anchor.clone().applyQuaternion(rotation)),elbow,hand,route};
}

function cloneDeform(mesh,bag,mapper,state) {
  mesh.updateWorldMatrix(true,false);
  const transform=bag.matrixWorld.clone().invert().multiply(mesh.matrixWorld),inverse=transform.clone().invert();
  const original=mesh.geometry,geometry=original.clone(),position=geometry.getAttribute('position'),p=new THREE.Vector3();
  for(let i=0;i<position.count;i++){p.fromBufferAttribute(position,i).applyMatrix4(transform);mapper(p,i,original,transform);p.applyMatrix4(inverse);position.setXYZ(i,p.x,p.y,p.z);}
  geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
  state.push({mesh,original});mesh.geometry=geometry;
}

function pathData(points,frames) {
  const cumulative=[0],entries=[];
  for(let i=1;i<points.length;i++)cumulative[i]=cumulative[i-1]+points[i].distanceTo(points[i-1]);
  for(let i=0;i<points.length;i++) {
    const tangent=points[Math.min(i+1,points.length-1)].clone().sub(points[Math.max(0,i-1)]).normalize();
    const lateral=frames?.[i]?.lateral?new THREE.Vector3(...Object.values(frames[i].lateral)).normalize():new THREE.Vector3(tangent.y,-tangent.x,0).normalize();
    if(!frames) {
      const roll=Math.sin(Math.PI*cumulative[i]/cumulative.at(-1))*Math.PI/2;
      lateral.multiplyScalar(Math.cos(roll)).addScaledVector(new THREE.Vector3(0,0,1),Math.sin(roll));
      lateral.addScaledVector(tangent,-lateral.dot(tangent)).normalize();
    }
    const normal=new THREE.Vector3().crossVectors(lateral,tangent).normalize();
    entries.push({point:points[i],tangent,lateral,normal,u:cumulative[i]/cumulative.at(-1)});
  }
  return {entries,cumulative,total:cumulative.at(-1)};
}

function crossProjection(geometry,transform,data) {
  let cached=projectionCache.get(geometry);if(cached)return cached;
  cached=[];const position=geometry.getAttribute('position'),p=new THREE.Vector3();
  for(let i=0;i<position.count;i++) {
    p.fromBufferAttribute(position,i).applyMatrix4(transform);let closest;
    for(let j=0;j<data.entries.length-1;j++) {
      const a=data.entries[j],b=data.entries[j+1],v=b.point.clone().sub(a.point),t=THREE.MathUtils.clamp(p.clone().sub(a.point).dot(v)/v.lengthSq(),0,1);
      const q=a.point.clone().lerp(b.point,t),distance=p.distanceToSquared(q);
      if(!closest||distance<closest.distance)closest={distance,a,b,t,q};
    }
    const {a,b,t,q}=closest,tangent=a.tangent.clone().lerp(b.tangent,t).normalize(),lateral=a.lateral.clone().lerp(b.lateral,t).normalize();
    const normal=new THREE.Vector3().crossVectors(lateral,tangent).normalize(),delta=p.clone().sub(q);
    cached.push({u:THREE.MathUtils.lerp(a.u,b.u,t),side:delta.dot(lateral),normal:delta.dot(normal),along:delta.dot(tangent)});
  }
  projectionCache.set(geometry,cached);return cached;
}

export function applyWearingDrape(bag,config,pose) {
  if(pose.carryMode==='hand')return;
  const state=[];savedDrapes.set(bag,state);bag.updateWorldMatrix(true,true);
  if(pose.carryMode==='shoulder') {
    for(const [name,route] of Object.entries(pose.route.routes)) {
      const mesh=bag.getObjectByName(name),{original,data}=route,count=original.points.length;
      const cumulative=pathData(original.points).cumulative,total=cumulative.at(-1);
      cloneDeform(mesh,bag,(p,index)=>{
        const ring=index<count*8?Math.floor(index/8):index<count*8+4?0:count-1;
        const u=cumulative[ring]/total,source=original.frames[ring],delta=p.clone().sub(original.points[ring]);
        let j=Math.min(data.entries.length-2,Math.floor(u*(data.entries.length-1)));
        while(j>0&&data.entries[j].u>u)j--;
        while(j<data.entries.length-2&&data.entries[j+1].u<u)j++;
        const a=data.entries[j],b=data.entries[j+1],t=(u-a.u)/(b.u-a.u||1);
        // Preserve exact sewn endpoints and their original frames.
        if(ring===0||ring===count-1)return;
        p.copy(a.point).lerp(b.point,t)
          .addScaledVector(a.lateral.clone().lerp(b.lateral,t).normalize(),delta.dot(source.lateral))
          .addScaledVector(a.normal.clone().lerp(b.normal,t).normalize(),delta.dot(source.normal));
      },state);
    }
  } else {
    const strap=bag.getObjectByName('crossStrap'),old=pathData(pose.route.original,strap.userData.centerlineFramesMm),next=pathData(pose.route.path);
    bag.traverse(mesh=>{
      if(!mesh.isMesh||!mesh.name.startsWith('crossStrap')||/(?:Tab|Ring|Hook|Gate|Swivel)$/.test(mesh.name))return;
      let projection;
      cloneDeform(mesh,bag,(p,i,geometry,transform)=>{
        projection ||= crossProjection(geometry,transform,old);
        const r=projection[i];let j=Math.min(next.entries.length-2,Math.floor(r.u*(next.entries.length-1)));
        while(j>0&&next.entries[j].u>r.u)j--;
        while(j<next.entries.length-2&&next.entries[j+1].u<r.u)j++;
        const a=next.entries[j],b=next.entries[j+1],t=(r.u-a.u)/(b.u-a.u||1);
        p.copy(a.point).lerp(b.point,t).addScaledVector(a.lateral.clone().lerp(b.lateral,t).normalize(),r.side)
          .addScaledVector(a.normal.clone().lerp(b.normal,t).normalize(),r.normal)
          .addScaledVector(a.tangent.clone().lerp(b.tangent,t).normalize(),r.along);
      },state);
    });
  }
}

export function restoreWearingDrape(bag) {
  for(const {mesh,original} of savedDrapes.get(bag)||[]) {mesh.geometry.dispose();mesh.geometry=original;}
  savedDrapes.delete(bag);
}
