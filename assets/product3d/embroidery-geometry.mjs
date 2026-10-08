import * as THREE from '../vendor/three/three.module.js';
import { MM_TO_SCENE } from './config.mjs?v=1.2.12';
import * as surfaces from './model.mjs?v=1.2.12';
import { stitchLift } from './embroidery-plan.mjs?v=1.2.12';
import { sampleEmbroideryElevation } from './embroidery-relief.mjs?v=1.2.12';

export const MAX_THREAD_TRIANGLES = 120000;

export function createEmbroideryThreadMesh(config,side,plan,roughnessMap=null) {
  if(!plan?.stitches?.length)return null;
  const print=config.print[side],surface=(x,y,c)=>surfaces.printSurfaceMM(x,y,c,side);
  const angle=print.rotation*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),bounds=side==='innerPocket'?print.partDimensions:config.dimensions;
  const positions=[],normals=[],colors=[],tangents=[],uvs=[],indices=[],valid=[];
  const radial=4;
  const maxStitches=Math.floor(MAX_THREAD_TRIANGLES/(2*radial*2));
  const count=Math.min(plan.stitches.length,maxStitches);
  const maxSteps=Math.max(2,Math.min(6,Math.floor(MAX_THREAD_TRIANGLES/(count*2*radial))));
  const mapped=(mx,my,z)=>{
    const lx=mx-plan.widthMm/2,ly=plan.heightMm/2-my,x=print.x+lx*c-ly*s,y=print.y+lx*s+ly*c;
    const p=surface(x,y,config),n=side==='innerPocket'?new THREE.Vector3(0,0,1):new THREE.Vector3(p.normal?.x||0,p.normal?.y||0,p.normal?.z??(side==='back'?-1:1)).normalize();
    const point=new THREE.Vector3(p.x,p.y,p.z).addScaledVector(n,z*MM_TO_SCENE);
    return {point,normal:n,visible:p.visible!==false&&p.contourVisible!==false&&Math.abs(x)<=bounds.width/2&&Math.abs(y)<=bounds.height/2};
  };
  const sampleVisible=(mx,my,id)=>{
    const a=plan.analysis;if(!a)return true;
    const x=Math.floor(mx/a.dx),y=Math.floor(my/a.dy);
    return x>=0&&y>=0&&x<a.width&&y<a.height&&a.labels[y*a.width+x]===id;
  };
  // The shaded yarn texture carries every stitch. Close-view cylinders add
  // cross-section detail within a fixed budget, evenly across the design.
  for(let number=0;number<count;number++) {
    const stitch=plan.stitches[Math.floor(number*plan.stitches.length/count)];
    const vx=stitch.b[0]-stitch.a[0],vy=stitch.b[1]-stitch.a[1],length=Math.hypot(vx,vy);
    const steps=Math.max(2,Math.min(maxSteps,Math.ceil(length/1.8))),start=positions.length/3;
    const color=new THREE.Color().setRGB(...stitch.color.map(v=>Math.min(1,v/255*stitch.variation)),THREE.SRGBColorSpace);
    const center=t=>{
      const mx=stitch.a[0]+vx*t,my=stitch.a[1]+vy*t;
      return mapped(mx,my,sampleEmbroideryElevation(plan,mx,my)+.10+stitchLift(stitch,t)*.15);
    };
    for(let row=0;row<=steps;row++) {
      const t=row/steps,mx=stitch.a[0]+vx*t,my=stitch.a[1]+vy*t,sample=center(t);
      const tangent=center(Math.min(1,t+.02)).point.sub(center(Math.max(0,t-.02)).point).normalize();
      const normal=sample.normal.clone().addScaledVector(tangent,-sample.normal.dot(tangent)).normalize();
      const across=new THREE.Vector3().crossVectors(tangent,normal).normalize();
      const endTaper=.45+.55*Math.pow(Math.sin(Math.PI*t),.25),radius=stitch.radius*endTaper;
      for(let ring=0;ring<=radial;ring++) {
        const theta=ring/radial*Math.PI*2,co=Math.cos(theta),si=Math.sin(theta);
        const localNormal=across.clone().multiplyScalar(co).addScaledVector(normal,si).normalize();
        const vertex=sample.point.clone().addScaledVector(localNormal,radius*MM_TO_SCENE);
        positions.push(...vertex.toArray());normals.push(...localNormal.toArray());colors.push(color.r,color.g,color.b);
        tangents.push(tangent.x,tangent.y,tangent.z,1);uvs.push(mx/plan.widthMm,1-my/plan.heightMm);
        valid.push(sample.visible&&sampleVisible(mx-vy/length*radius*co,my+vx/length*radius*co,stitch.region));
      }
    }
    for(let row=0;row<steps;row++)for(let ring=0;ring<radial;ring++) {
      const a=start+row*(radial+1)+ring,b=a+radial+1;
      for(const tri of [[a,b,a+1],[b,b+1,a+1]])if(tri.every(i=>valid[i]))indices.push(...tri);
    }
  }
  // Remove unused clipped vertices too: the geometry bounds and zoom focus
  // must never include hidden stitches outside the bag or pocket mouth.
  const remap=new Int32Array(valid.length).fill(-1),compact={position:[],normal:[],color:[],tangent:[],uv:[]},compactIndices=[];
  const attributes={position:[positions,3],normal:[normals,3],color:[colors,3],tangent:[tangents,4],uv:[uvs,2]};
  for(const old of indices) {
    if(remap[old]===-1) {
      remap[old]=compact.position.length/3;
      for(const [name,[data,size]]of Object.entries(attributes))for(let channel=0;channel<size;channel++)compact[name].push(data[old*size+channel]);
    }
    compactIndices.push(remap[old]);
  }
  if(!compactIndices.length)return null;
  const geometry=new THREE.BufferGeometry();
  for(const [name,[,size]]of Object.entries(attributes))geometry.setAttribute(name,new THREE.Float32BufferAttribute(compact[name],size));
  geometry.setIndex(compactIndices);geometry.computeBoundingSphere();
  return createEmbroideryThreadObject(geometry,side,plan,roughnessMap,{stitchCount:count});
}

export function createEmbroideryThreadObject(geometry,side,plan,roughnessMap=null,data={}) {
  if(!geometry)return null;
  const material=new THREE.MeshPhysicalMaterial({vertexColors:true,roughness:roughnessMap?1:.62,roughnessMap,metalness:0,
    sheen:.4,sheenColor:new THREE.Color('#ffffff'),sheenRoughness:.68,side:THREE.FrontSide});
  const mesh=new THREE.Mesh(geometry,material);mesh.name=`embroideryThreads-${side}`;
  // The padded body and alpha contact shadow supply the sewn-layer shadow.
  // Re-rendering thousands of micro tubes into a whole-bag shadow is wasteful.
  mesh.castShadow=false;mesh.receiveShadow=false;mesh.renderOrder=2;
  mesh.userData={stitchCount:plan.stitches.length,sourceStitchCount:plan.stitches.length,threadDiameterMm:plan.threadDiameter,...data};
  return mesh;
}
