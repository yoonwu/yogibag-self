import * as THREE from '../../assets/vendor/three/three.module.js';

export function ribbonRings(geometry) {
  return (geometry.attributes.position.count-8)/8;
}

export function ribbonCenter(geometry,ring) {
  const p=geometry.attributes.position;
  return new THREE.Vector3().fromBufferAttribute(p,ring*8)
    .add(new THREE.Vector3().fromBufferAttribute(p,ring*8+4)).multiplyScalar(.5);
}

// Projected ribbon boundaries can overlap when the tape turns edge-on.
// Check the actual three-dimensional shell instead: an edge must not pass
// through a non-neighbouring cloth triangle. Boundary contact is allowed.
export function ribbonSelfIntersections(geometry) {
  const p=geometry.attributes.position,indices=geometry.index.array,triangles=[];
  for(let i=0;i<indices.length-12;i+=3){
    const points=[0,1,2].map(k=>new THREE.Vector3().fromBufferAttribute(p,indices[i+k]).multiplyScalar(1000));
    triangles.push({points,ring:Math.floor(Math.min(indices[i],indices[i+1],indices[i+2])/8),box:new THREE.Box3().setFromPoints(points)});
  }
  const ray=new THREE.Ray(),direction=new THREE.Vector3(),hit=new THREE.Vector3(),bary=new THREE.Vector3(),crossings=[];
  const edgeThrough=(a,b,triangle)=>{
    direction.subVectors(b,a);const length=direction.length();
    if(length<1e-7)return false;
    ray.set(a,direction.divideScalar(length));
    if(!ray.intersectTriangle(...triangle.points,false,hit))return false;
    const distance=hit.distanceTo(a);
    if(distance<1e-4||distance>length-1e-4)return false;
    THREE.Triangle.getBarycoord(hit,...triangle.points,bary);
    return Math.min(bary.x,bary.y,bary.z)>1e-5;
  };
  for(let i=0;i<triangles.length;i++)for(let j=i+1;j<triangles.length;j++){
    const a=triangles[i],b=triangles[j];
    if(Math.abs(a.ring-b.ring)<=1||!a.box.intersectsBox(b.box))continue;
    if([0,1,2].some(k=>edgeThrough(a.points[k],a.points[(k+1)%3],b)||edgeThrough(b.points[k],b.points[(k+1)%3],a))){
      crossings.push([a.ring,b.ring]);if(crossings.length>=8)return crossings;
    }
  }
  return crossings;
}
