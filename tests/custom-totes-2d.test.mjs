import test from 'node:test';
import assert from 'node:assert/strict';
import {alphaBounds,customParts,CUSTOM_2D_IDS} from '../assets/product3d/custom-totes-2d.mjs';
import {createDefaultConfig} from '../assets/product3d/config.mjs';

test('photo measurement follows opaque textile rather than the transparent handle frame or faint detached specks',()=>{
  const width=9,height=12,pixels=new Uint8ClampedArray(width*height*4);
  for(let y=6;y<11;y++)for(let x=2;x<7;x++)pixels[(y*width+x)*4+3]=255;
  pixels[3]=80;pixels[(2*width+4)*4+3]=255;
  assert.deepEqual(alphaBounds(pixels,width,height,6),{left:2,top:6,width:5,height:5});
});

test('photo controls enforce the same color policy and removable outer pocket as 3D without mutating drafts',()=>{
  for(const id of CUSTOM_2D_IDS){
    const config=createDefaultConfig(id);config.handle.color='#345678';config.bottomPanel.color='#abcdef';
    config.options.pocket=false;
    const before=structuredClone(config),parts=customParts(config);
    assert.deepEqual(config,before);
    assert.equal(parts.bottomPanel.color,id==='two-tone-kids'?'#abcdef':'#345678');
    if(id==='two-tone-kids')assert.equal(parts.pocket,undefined);
    else assert.equal(parts.pocketEnabled,false);
  }
});
