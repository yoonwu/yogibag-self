import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../assets/vendor/three/three.module.js';
import { createDefaultConfig, MM_TO_SCENE } from '../assets/product3d/config.mjs';
import { buildBagModel, disposeBagModel, frontSurfaceMM } from '../assets/product3d/model.mjs';

for(const id of ['sample-two-line-large','sample-two-line-small','two-tone-kids']) {
  test(`${id}: sewn mouth stays straight while curved cloth sides and lower folds remain natural`,()=>{
    const config=createDefaultConfig(id);
    const material=new THREE.MeshBasicMaterial();
    const bag=buildBagModel(config,{body:material});
    const rim=bag.getObjectByName('openTopRim').geometry.boundingBox;
    assert.ok(rim.max.y-rim.min.y<.01*MM_TO_SCENE,'the sewn mouth does not ripple between handle roots');
    assert.ok(Math.abs(rim.max.y-config.dimensions.height*MM_TO_SCENE)<1e-6,'sewn roots keep the measured body height');
    for(const pair of [['bodyFront','sideLeft',0],['bodyFront','sideRight',32],
      ['bottomFrontPanel','bottomSideLeftPanel',0],['bottomFrontPanel','bottomSideRightPanel',32]]) {
      const panel=bag.getObjectByName(pair[0]).geometry.attributes.position;
      const side=bag.getObjectByName(pair[1]).geometry.attributes.position;
      assert.equal(panel.count/33,side.count/23);
      for(let row=0;row<panel.count/33;row++) {
        const a=new THREE.Vector3().fromBufferAttribute(panel,row*33+pair[2]);
        const b=new THREE.Vector3().fromBufferAttribute(side,row*23);
        assert.ok(a.distanceTo(b)<.02*MM_TO_SCENE,'cloth folds remain sealed along panel edges');
      }
    }
    const floor=bag.getObjectByName('bottom').geometry.boundingBox;
    assert.ok(floor.max.y-floor.min.y>3*MM_TO_SCENE,'lower corners lift with the gusset');
    const point=frontSurfaceMM(0,0,config);
    assert.equal(point.x,0);assert.equal(point.y,config.dimensions.height/2*MM_TO_SCENE);
    assert.ok(bag.userData.metrics.triangleCount<25_000,'soft shapes stay within the existing rendering budget');
    assert.equal(bag.userData.metrics.bottomPanelHeight,config.bottomPanel.height);
    disposeBagModel(bag);material.dispose();
  });
}
