import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker as NodeWorker} from 'node:worker_threads';
import {EmbroideryProcessor} from '../assets/product3d/embroidery-processor.mjs';
import {embroideryGeometryConfig,computeEmbroideryJob} from '../assets/product3d/embroidery-job.mjs';
import {MAX_THREAD_TRIANGLES} from '../assets/product3d/embroidery-geometry.mjs';
import {createDefaultConfig} from '../assets/product3d/config.mjs';
import {Product3DViewer} from '../assets/product3d/viewer.mjs';
import {createPrintMesh,disposePrintMesh,disposeEmbroideryTextures} from '../assets/product3d/print.mjs';
import * as THREE from '../assets/vendor/three/three.module.js';

class BrowserWorker {
  constructor(){this.worker=new NodeWorker(new URL('./fixtures/embroidery-worker-node.mjs',import.meta.url));
    this.worker.on('message',data=>this.onmessage?.({data}));this.worker.on('error',error=>this.onerror?.(error));}
  postMessage(message,transfer){this.worker.postMessage(message,transfer);}
  terminate(){this.worker.terminate();}
}
const source=()=>{const pixels=new Uint8ClampedArray(64*64*4);for(let i=0;i<pixels.length;i+=4)pixels.set([80,125,190,255],i);return pixels;};

test('large embroidery prepares in a real worker while the UI event loop remains available and the render budget stays bounded',async t=>{
  const processor=new EmbroideryProcessor({workerFactory:()=>new BrowserWorker()});t.after(()=>processor.dispose());
  const config=createDefaultConfig('daily');Object.assign(config.print.front,{width:200,height:200,appearance:'embroidery'});
  const original=source(),input=original.slice();let heartbeat=false;
  setTimeout(()=>heartbeat=true,0);
  const result=await processor.run({kind:'prepare',source:input,width:64,height:64,print:{widthMm:200,heightMm:200},config:embroideryGeometryConfig(config),side:'front'});
  assert.equal(heartbeat,true,'UI callbacks must run before digitizing and geometry finish');
  assert.deepEqual(original,source(),'Uploaded pixels must stay untouched');
  assert.equal(input.byteLength,0,'Only disposable input data should transfer ownership');
  assert.ok(result.geometry.threads.index.length/3<=MAX_THREAD_TRIANGLES);
  assert.ok(result.geometry.relief.index.length/3<50000,'Flat plateaus should not retain the old 300k triangles');
  assert.ok(result.pixels.plan.stitches.length>18000,'The texture must still represent all physical stitch rows');
  const textures={map:new THREE.Texture(),height:new THREE.Texture(),roughness:new THREE.Texture(),
    plan:result.pixels.plan,geometryData:result.geometry};
  const mesh=createPrintMesh(config,new THREE.Texture(),'front',textures);
  const threads=mesh.getObjectByName('embroideryThreads-front');
  assert.equal(threads.castShadow,false);assert.equal(mesh.castShadow,true);
  const positions=mesh.geometry.attributes.position;
  assert.ok(positions.count>0);assert.ok([...positions.array].every(Number.isFinite));
  disposePrintMesh(mesh);disposeEmbroideryTextures(textures);
});

test('changing a slider cancels the obsolete worker task without delaying the replacement or reviving stale geometry',async t=>{
  const processor=new EmbroideryProcessor({workerFactory:()=>new BrowserWorker()});t.after(()=>processor.dispose());
  const controller=new AbortController();
  const old=processor.run({kind:'preview',source:source(),width:64,height:64,print:{widthMm:200,heightMm:200}},{signal:controller.signal});
  const rejected=assert.rejects(old,{name:'AbortError'});controller.abort();
  const newJob={kind:'preview',source:source(),width:64,height:64,print:{widthMm:4,heightMm:4}};
  const current=await processor.run(newJob);await rejected;
  assert.equal(current.preview.length,64*64*4);
  processor.dispose();await assert.rejects(processor.run(newJob),{name:'AbortError'});
});

test('an asynchronous embroidery rebuild discarded after reverting to print cannot overwrite the original artwork',async t=>{
  const oldDocument=globalThis.document;
  globalThis.document={createElement:()=>({width:0,height:0,getContext(){const canvas=this;return {
    drawImage(){},getImageData(){return {data:new Uint8ClampedArray(canvas.width*canvas.height*4)};}
  };}})};
  t.after(()=>{if(oldDocument===undefined)delete globalThis.document;else globalThis.document=oldDocument;});
  const config=createDefaultConfig('daily');Object.assign(config.print.front,{image:'data:image/png;base64,fixture',appearance:'embroidery',width:20,height:20});
  const uploaded=new THREE.Texture(),jobs=[];
  const viewer=Object.create(Product3DViewer.prototype);
  Object.assign(viewer,{config,scene:new THREE.Scene(),requestRender(){},_embroideryProcessor:{
    run(job,{signal}){return new Promise(resolve=>jobs.push({job,signal,resolve}));},dispose(){}}});
  viewer._ensurePrintStates();Object.assign(viewer._printStates.front,{source:config.print.front.image,texture:uploaded});
  viewer._updatePrint('front');
  const pending=viewer._printStates.front.embroideryPending.promise;
  config.print.front.appearance='print';viewer._updatePrint('front');
  assert.equal(jobs[0].signal.aborted,true);
  jobs[0].resolve(computeEmbroideryJob(jobs[0].job));await pending;
  assert.equal(viewer._printStates.front.embroidery,null);
  assert.equal(viewer.printMesh.material.map,uploaded);
  assert.equal(viewer.printMesh.userData.printAppearance,'print');viewer.dispose();
});
