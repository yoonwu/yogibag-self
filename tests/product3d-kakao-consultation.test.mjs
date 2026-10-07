import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PRODUCT3D_PROFILES, createDefaultConfig } from '../assets/product3d/config.mjs';
import { beginCaptureCopy, handoffCapture, KAKAO_CHAT_URL } from '../assets/product3d/kakao-consultation.mjs';

class Item { constructor(data) { this.data = data; } static supports(type) { return type === 'image/png'; } }

test('only the three unpriced custom bags route to Kakao while all twelve original bags retain email',()=>{
  const chatIds=['sample-two-line-large','sample-two-line-small','two-tone-kids'];
  for(const [id,profile] of Object.entries(PRODUCT3D_PROFILES))assert.equal(profile.consultationMode,chatIds.includes(id)?'kakao':'email',id);
  assert.equal(KAKAO_CHAT_URL,'https://pf.kakao.com/_dGxlxlj/chat');
});

test('clipboard write begins during the click, and chat opens only after the exact pending capture was copied',async()=>{
  const events=[];let complete;const capture=new Promise(resolve=>complete=resolve);
  const environment={ClipboardItem:Item,clipboard:{write:async items=>{
    events.push('copy-start');assert.deepEqual(Object.keys(items[0].data),['image/png']);
    assert.equal(await items[0].data['image/png'],blob);events.push('copy-finished');
  }},onCopied:()=>events.push('notice'),openChat:()=>{events.push('chat');return true;}};
  const blob=new Blob(['visible flattened preview'],{type:'image/png'});
  const pending=handoffCapture(capture,environment);
  assert.deepEqual(events,['copy-start']);complete(blob);
  const result=await pending;assert.equal(result.blob,blob);assert.equal(result.copied,true);assert.equal(result.opened,true);
  assert.deepEqual(events,['copy-start','copy-finished','notice','chat']);
});

test('unsupported, rejected and synchronously failing image copies preserve the captured image without opening an empty chat',async()=>{
  const blob=new Blob(['PNG'],{type:'image/png'});
  for(const copyEnvironment of [{},{ClipboardItem:Item,clipboard:{write:()=>Promise.reject(new Error('permission denied'))}},
    {ClipboardItem:Item,clipboard:{write:()=>{throw new Error('unsupported');}}}]){
    let opened=false;
    const result=await handoffCapture(Promise.resolve(blob),{...copyEnvironment,openChat:()=>{opened=true;return true;}});
    assert.equal(result.blob,blob);assert.equal(result.copied,false);assert.equal(opened,false);
  }
  assert.equal(await beginCaptureCopy(blob,{ClipboardItem:class{static supports(){return false;}},clipboard:{write(){assert.fail('unsupported PNG must not be written');}}}),false);
});

test('capture failure never claims success or opens chat, while a popup block leaves a successful copy available',async()=>{
  let opened=false;
  await assert.rejects(()=>handoffCapture(Promise.reject(new Error('WebGL lost')),{openChat:()=>{opened=true;}}),/WebGL lost/);
  assert.equal(opened,false);
  const blob=new Blob(['PNG'],{type:'image/png'});
  const blocked=await handoffCapture(Promise.resolve(blob),{ClipboardItem:Item,clipboard:{write:async()=>{}},openChat:()=>false});
  assert.equal(blocked.copied,true);assert.equal(blocked.opened,false);assert.equal(blocked.blob,blob);
});

test('the existing email form and attachments remain available, while custom chat exposes no customer form or file exports',async()=>{
  const email=await readFile(new URL('../assets/product3d/consultation.mjs',import.meta.url),'utf8');
  const chat=await readFile(new URL('../assets/product3d/kakao-consultation.mjs',import.meta.url),'utf8');
  assert.match(email,/consultationMode === 'kakao'/);assert.match(email,/EMAIL_ENDPOINT/);
  assert.match(email,/상담 접수하기/);assert.match(email,/buildConsultationFiles\(c,views,value,reference\)/);
  assert.doesNotMatch(chat,/EMAIL_ENDPOINT|buildConsultationFiles|download\s*=|node\('form'/);
  assert.match(chat,/navigator\.share/);assert.match(chat,/URL\.revokeObjectURL/);
  assert.equal(createDefaultConfig('daily').productId,'daily');
});
