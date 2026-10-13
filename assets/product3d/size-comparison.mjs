import * as THREE from '../vendor/three/three.module.js';

export const COMPARISON_HEIGHTS = Object.freeze([130, 140, 150, 160, 170, 180]);
export const COMPARISON_HEIGHT_LIMITS = Object.freeze({ min:130, max:180, step:1 });

export function comparisonHeight(value = 160) {
  const height = Number(value);
  if (!Number.isInteger(height) || height < COMPARISON_HEIGHT_LIMITS.min || height > COMPARISON_HEIGHT_LIMITS.max)
    throw new Error('키는 130~180cm 사이에서 1cm 단위로 조절해 주세요.');
  return height;
}

// All lengths here are metres, exactly like the bag's mm-to-metre boundary.
// These are an illustrative, ordinary build, not population percentile data.
export function holdingPose(heightCm, bag, config) {
  const h = comparisonHeight(heightCm) / 100;
  bag.updateWorldMatrix(true, true);
  const handle = bag.getObjectByName('handlesLoopFront') || bag.getObjectByName('crossStrap');
  let anchor;
  if (handle) {
    const positions = handle.geometry.getAttribute('position');
    let top = -Infinity;
    const local = new THREE.Vector3(), point = new THREE.Vector3();
    for (let i = 0; i < positions.count; i++) {
      point.fromBufferAttribute(positions, i);
      handle.localToWorld(point); bag.worldToLocal(point);
      top = Math.max(top, point.y);
    }
    let count = 0;
    for (let i = 0; i < positions.count; i++) {
      point.fromBufferAttribute(positions, i);
      handle.localToWorld(point); bag.worldToLocal(point);
      if (point.y >= top - 0.0015) { local.add(point); count++; }
    }
    anchor = local.divideScalar(count || 1);
    anchor.y = top;
  } else {
    // Handleless pouches are held at the upper corner instead of inventing a strap.
    anchor = new THREE.Vector3(config.dimensions.width * .00038, config.dimensions.height / 1000, config.dimensions.depth / 2000);
  }
  const body = new THREE.Vector3(-.14 * h, 0, 0);
  const shoulder = body.clone().add(new THREE.Vector3(.108 * h, .804 * h, 0));
  const hand = body.clone().add(new THREE.Vector3(.225 * h, Math.max(.50 * h, anchor.y + .055), .17 * h));
  // The same two-link arm calculation follows a taller bag without stretching its mesh.
  const direction = hand.clone().sub(shoulder), distance = direction.length();
  direction.normalize();
  const upper = .19 * h, lower = .18 * h;
  const along = (upper * upper - lower * lower + distance * distance) / (2 * distance);
  const bend = Math.sqrt(Math.max(0, upper * upper - along * along));
  // The elbow stays behind the wrist: the forearm bends forwards to the bag.
  const normal = new THREE.Vector3(0, 0, -1).addScaledVector(direction, direction.z).normalize();
  const elbow = shoulder.clone().addScaledVector(direction, along).addScaledVector(normal, bend);
  return { heightCm: heightCm, height: h, body, shoulder, elbow, hand, anchor,
    bagPosition: hand.clone().sub(anchor), hasHandle: Boolean(handle), carryMode:'hand' };
}

export function armGeometry(cuff, elbow, wrist, height) {
  const curve=new THREE.CatmullRomCurve3([cuff,cuff.clone().lerp(elbow,.55),elbow,elbow.clone().lerp(wrist,.30),wrist],false,'centripetal');
  const rings=36,sides=16,frames=curve.computeFrenetFrames(rings,false),positions=[],indices=[];
  const elbowT=cuff.distanceTo(elbow)/(cuff.distanceTo(elbow)+elbow.distanceTo(wrist));
  const radius=t=>{
    const knots=[[0,.031],[elbowT,.0225],[elbowT+(1-elbowT)*.30,.025],[1,.0155]];
    for(let i=1;i<knots.length;i++)if(t<=knots[i][0]){
      const [a,ra]=knots[i-1],[b,rb]=knots[i],u=THREE.MathUtils.smoothstep(t,a,b);
      return THREE.MathUtils.lerp(ra,rb,u)*height;
    }
    return .0155*height;
  };
  for(let i=0;i<=rings;i++) {
    const p=curve.getPointAt(i/rings),r=radius(i/rings);
    for(let j=0;j<sides;j++) {
      const a=j/sides*Math.PI*2;
      const v=p.clone().addScaledVector(frames.normals[i],r*Math.cos(a)).addScaledVector(frames.binormals[i],r*Math.sin(a));
      positions.push(v.x,v.y,v.z);
      if(i<rings){const k=i*sides+j,n=i*sides+(j+1)%sides;indices.push(k,n,k+sides,n,n+sides,k+sides);}
    }
  }
  // End caps own their vertices so their flat normals cannot kink the skin.
  for(const ring of [0,rings]) {
    const start=positions.length/3,center=curve.getPointAt(ring/rings);positions.push(center.x,center.y,center.z);
    for(let j=0;j<sides;j++){const k=(ring*sides+j)*3;positions.push(positions[k],positions[k+1],positions[k+2]);}
    for(let j=0;j<sides;j++){const a=start+1+j,b=start+1+(j+1)%sides;if(ring===0)indices.push(start,b,a);else indices.push(start,a,b);}
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);
  geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
  return geometry;
}

export function createComparisonPerson(pose) {
  const group = new THREE.Group();
  group.name = 'sizeComparisonPerson';
  const h = pose.height;
  const materials = {
    skin: new THREE.MeshStandardMaterial({ color: '#d6bca4', roughness: .83 }),
    shirt: new THREE.MeshStandardMaterial({ color: '#bbc7ce', roughness: .96 }),
    pants: new THREE.MeshStandardMaterial({ color: '#616b76', roughness: .97 }),
    shoe: new THREE.MeshStandardMaterial({ color: '#e8e4df', roughness: .95 }),
    sole: new THREE.MeshStandardMaterial({ color: '#cbc7c1', roughness: 1 }),
  };
  const add = (name, geometry, material) => {
    const mesh = new THREE.Mesh(geometry, materials[material]);
    mesh.name = name; mesh.castShadow = true; mesh.receiveShadow = true;
    group.add(mesh); return mesh;
  };
  const ellipsoid = (name, center, radii, material) => {
    const mesh = add(name, new THREE.SphereGeometry(1, 20, 14), material);
    mesh.position.copy(center); mesh.scale.set(...radii); return mesh;
  };
  const segment = (name, a, b, ra, rb, material) => {
    const delta = b.clone().sub(a);
    const mesh = add(name, new THREE.CylinderGeometry(rb, ra, delta.length(), 16, 1), material);
    mesh.position.copy(a).add(b).multiplyScalar(.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
    return mesh;
  };
  const bodyPoint = (x,y,z=0) => pose.body.clone().add(new THREE.Vector3(x*h,y*h,z*h));
  const profiles = [[.109,.535],[.107,.55],[.091,.60],[.087,.655],[.105,.73],[.117,.785],[.108,.815],[.074,.835],[.041,.841]];
  const torso = add('comparisonShirt', new THREE.LatheGeometry(profiles.map(([r,y])=>new THREE.Vector2(r*h,y*h)), 32), 'shirt');
  torso.position.copy(pose.body); torso.scale.z = .63;
  ellipsoid('comparisonPelvis', bodyPoint(0,.534), [.109*h,.065*h,.066*h], 'pants');
  segment('comparisonNeck',bodyPoint(0,.822),bodyPoint(0,.884),.032*h,.034*h,'skin');
  ellipsoid('comparisonHead',bodyPoint(0,.927,.003),[.052*h,.073*h,.054*h],'skin');
  // Subtle ears and nose establish a forward direction without cartoon facial features.
  for(const sign of [-1,1]) ellipsoid(`comparisonEar${sign}`,bodyPoint(sign*.052,.924,.002),[.008*h,.015*h,.007*h],'skin');
  ellipsoid('comparisonNose',bodyPoint(0,.918,.052),[.009*h,.014*h,.009*h],'skin');
  for (const sign of [-1,1]) {
    const hip=bodyPoint(sign*.057,.53),knee=bodyPoint(sign*.066,.28,.008),ankle=bodyPoint(sign*.074,.062,.004);
    segment(`comparisonThigh${sign}`,hip,knee,.056*h,.040*h,'pants');
    ellipsoid(`comparisonKnee${sign}`,knee,[.040*h,.043*h,.039*h],'pants');
    segment(`comparisonShin${sign}`,knee,ankle,.039*h,.026*h,'pants');
    ellipsoid(`comparisonShoe${sign}`,bodyPoint(sign*.074,.027,.033),[.034*h,.026*h,.071*h],'shoe');
    ellipsoid(`comparisonSole${sign}`,bodyPoint(sign*.074,.008,.035),[.035*h,.008*h,.072*h],'sole');
  }
  const arms=[{side:'Left',shoulder:bodyPoint(-.108,.804),elbow:bodyPoint(-.142,.637,.012),hand:bodyPoint(-.158,.472,.025)},
    {side:'Right',shoulder:pose.shoulder,elbow:pose.elbow,hand:pose.hand}];
  for (const {side,shoulder,elbow,hand} of arms) {
    const cuff=shoulder.clone().lerp(elbow,.45),wrist=hand.clone().lerp(elbow,.12);
    ellipsoid(`comparisonShoulder${side}`,shoulder,[.041*h,.041*h,.038*h],'shirt');
    segment(`comparisonSleeve${side}`,shoulder,cuff,.041*h,.037*h,'shirt');
    add(`comparisonArm${side}`,armGeometry(cuff,elbow,wrist,h),'skin');
    const palm=ellipsoid(`comparisonPalm${side}`,hand,[.022*h,.031*h,.012*h],'skin');
    if(side==='Right' && pose.carryMode==='hand') {
      palm.position.y += .008*h; palm.position.z -= .012*h;
      for(let i=0;i<4;i++) {
        const x=hand.x+(i-1.5)*.009*h;
        const points=[[x,hand.y+.018*h,hand.z-.012*h],[x,hand.y+.014*h,hand.z+.012*h],
          [x,hand.y-.002*h,hand.z+.016*h],[x,hand.y-.010*h,hand.z+.004*h]].map(p=>new THREE.Vector3(...p));
        add(`comparisonFinger${i}`,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),8,.0046*h,6,false),'skin');
      }
      ellipsoid('comparisonThumb',hand.clone().add(new THREE.Vector3(-.027*h,.010*h,.003*h)),[.009*h,.015*h,.009*h],'skin');
    }
  }
  // A thin height reference is part of the same scene and rotates with the model.
  const x=pose.body.x-.24*h,z=-.04*h;
  segment('comparisonHeightLine',new THREE.Vector3(x,0,z),new THREE.Vector3(x,h,z),.0012,.0012,'pants');
  for(let y=.1;y<h-.05;y+=.1)segment('comparisonHeightTick',new THREE.Vector3(x-.006,y,z),new THREE.Vector3(x+.006,y,z),.001,.001,'pants');
  for(const y of [.0015,h-.0015])segment('comparisonHeightEnd',new THREE.Vector3(x-.024,y,z),new THREE.Vector3(x+.024,y,z),.0015,.0015,'pants');
  group.userData.heightCm=pose.heightCm;
  return group;
}

export function disposeComparisonPerson(group) {
  const geometries=new Set(),materials=new Set();
  group?.traverse(part=>{ if(part.geometry)geometries.add(part.geometry); if(part.material)materials.add(part.material); });
  geometries.forEach(geometry=>geometry.dispose()); materials.forEach(material=>material.dispose());
}

export function drawComparisonLabel(context, width, heightCm, carryLabel) {
  context.save();
  context.fillStyle='#6b7684'; context.font='12px "Malgun Gothic", sans-serif';
  context.fillText(`키 ${heightCm}cm · 실측 비율`,18,26);
  if(carryLabel && carryLabel!=='손에 들기')context.fillText(carryLabel,18,44);
  context.restore();
}
