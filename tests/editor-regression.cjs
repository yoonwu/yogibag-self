// Run: node --test tests/editor-regression.cjs
// Exercise the actual inline functions without making network/order requests.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(require('node:path').join(__dirname, '../index.html'), 'utf8');
const source = html.replace(/\r\n/g, '\n');
function section(from, to) {
  const a = source.indexOf(from), b = source.indexOf(to, a + from.length);
  assert.ok(a >= 0 && b > a, 'source section exists');
  return source.slice(a,b);
}
test('all inline scripts parse', () => {
  for (const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) new vm.Script(m[1]);
});

function editor() {
  const nodes = new Map();
  const node = () => ({textContent:'',style:{},classList:{toggle(){}},disabled:false});
  const hydrate = data => ({...structuredClone(data),toObject(){
    return Object.fromEntries(Object.entries(this).filter(([,v])=>typeof v !== 'function'));
  }});
  let objects = [hydrate({bagPart:'body'}),hydrate({bagPart:'handle'}),hydrate({bagPart:'print'}),hydrate({isOptionVisual:true,optName:'똑딱이'}),hydrate({isUserObject:true,text:'FRONT',uploadId:'front-original'})];
  const c = {
    currentBag:{id:'daily',name:'Daily'},bagBodyColor:'#111',webbingColor:'#abc',bagTexture:null,bagFabricId:'denim',polyBodyKey:'navy',
    bagScale:1,bagOffX:10,bagOffY:20,activeOptions:new Set(['똑딱이']),
    currentSide:'front',twoSided:true,sideDesigns:{front:[],back:[hydrate({isUserObject:true,text:'BACK',uploadId:'back-original'})]},sideMeasured:{front:null,back:{width:12,height:8}},
    isRestoring:false,drawBagPending:false,drawBagToken:0,undoStack:[],redoStack:[],
    optionVisuals:{},POLY_BODY:{},BAG_IMAGES:{},optButtons:{},dualBtn:node(),sideTabs:node(),
    document:{getElementById(id){if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);}},
    canvas:{toJSON(){return {objects:objects.map(o=>o.toObject())};},getObjects(){return objects;},loadFromJSON(data,callback){objects=data.objects.map(hydrate);callback();},renderAll(){}},
    fabric:{util:{enlivenObjects(data,cb){cb(data.map(hydrate));}}},
    measurePrintObjs:()=>({width:23,height:8}),isInnerPocketObj:()=>false,
    webbingColorName:()=> 'test',
  };
  for (const name of ['reapplyBodyStyle','renderColorGridForBag','updateOptionsForBag','updateSideTabUI','syncColorSwatches','renderOptionChips','renderOptionPreviews','updatePrintSizeHint','updatePrintSizePill','updatePriceBar','addOptionVisual']) c[name]=()=>{};
  vm.createContext(c);
  vm.runInContext(section('const DESIGN_PROPS =', '/* =========================================================\n   TOOL SWITCHING'),c);
  return c;
}
test('undo/redo restores product, colors, options, opposite artwork and layer identities',()=>{
  const c=editor();
  vm.runInContext('saveState()',c);
  c.currentBag={id:'poly1',name:'Poly'};c.bagBodyColor='#fff';c.bagFabricId='basic';c.polyBodyKey='green';c.activeOptions.clear();c.twoSided=false;c.sideDesigns.back=[];
  vm.runInContext('saveState(); undo()',c);
  assert.equal(c.currentBag.id,'daily');assert.equal(c.bagFabricId,'denim');assert.equal(c.bagBodyColor,'#111');assert.equal(c.polyBodyKey,'navy');
  assert.ok(c.activeOptions.has('똑딱이'));assert.equal(c.twoSided,true);assert.equal(c.sideDesigns.back[0].text,'BACK');
  assert.equal(c.sideDesigns.back[0].uploadId,'back-original');assert.equal(c.bagBodyRect.bagPart,'body');assert.ok(c.optionVisuals['똑딱이']);
  vm.runInContext('redo()',c);
  assert.equal(c.currentBag.id,'poly1');assert.equal(c.twoSided,false);assert.equal(c.activeOptions.size,0);
});
test('pending bag drawings do not record empty intermediate history',()=>{
  const c=editor();c.drawBagPending=true;vm.runInContext('saveState()',c);assert.equal(c.undoStack.length,0);
  c.drawBagPending=false;vm.runInContext('saveState()',c);assert.equal(c.undoStack.length,1);
});
test('saved designs retain both artwork originals but exclude unrelated uploads',()=>{
  const c=editor();c.savedDesignsReady=true;c.savedDesigns=[];
  c.originalUploads=new Map([['front-original',{dataURL:'front'}],['back-original',{dataURL:'back'}],['unused',{dataURL:'unused'}]]);
  c.canvas.discardActiveObject=()=>{};c.canvas.requestRenderAll=()=>{};c.canvas.toDataURL=()=> 'thumbnail';
  c.renderSaved=()=>{};c.persistSavedDesigns=()=>{};c.showToast=()=>{};
  vm.runInContext(section('function saveCurrentDesign() {','// IndexedDB also'),c);
  vm.runInContext('saveCurrentDesign()',c);
  const saved=JSON.parse(JSON.stringify(c.savedDesigns[0]));
  assert.deepEqual(saved.uploads.map(([id])=>id).sort(),['back-original','front-original']);
  assert.equal(saved.state.hiddenObjects[0].text,'BACK');
  assert.equal(saved.state.json.objects.find(o=>o.text).text,'FRONT');
  assert.equal(saved.state.bagFabricId,'denim');
});
test('both sides supply unique originals regardless of selected side',()=>{
  const block=section('    const seenUploads = new Set();','    // 작업지시서 첨부');
  for (const currentSide of ['front','back']) {
    const c={currentSide,twoSided:true,sideDesigns:{front:[{uploadId:'A'}],back:[{uploadId:'B'},{uploadId:'B'}]},attachments:[],orderNum:'TEST',originalUploads:new Map([['A',{name:'A.png',dataURL:'data:image/png;base64,QQ=='}],['B',{name:'B.png',dataURL:'data:image/png;base64,Qg=='}]])};
    c.canvas={getObjects:()=>c.sideDesigns[currentSide]};vm.createContext(c);vm.runInContext(block,c);
    assert.equal(c.attachments.length,2);assert.deepEqual(c.attachments.map(a=>a.content).sort(),['QQ==','Qg==']);
  }
});
test('consultation fabrics do not expose numeric order quotes',()=>{
  const box={};const c={document:{getElementById:()=>box},isConsultFabric:()=>true,currentPrice(){throw Error('must not calculate a quote')}};
  vm.createContext(c);vm.runInContext(section('function renderOrdQuote(){','(function(){'),c);vm.runInContext('renderOrdQuote()',c);
  assert.match(box.textContent,/상담/);
});
test('minimum quantities and integer quantities are enforced before submission',()=>{
  const block=section('  if (!/^\\d+$/.test(qty)',"  if (name.length < 2)");
  for (const min of [1,20,50]) for (const qty of ['0','1','19','20','49','50','1.5','20abc','NaN','9007199254740992']) {
    const c={qty,errs:[],currentPrice:()=>({min,baseMin:min})};vm.createContext(c);vm.runInContext(block,c);
    assert.equal(c.errs.length===0,/^\d+$/.test(qty)&&Number.isSafeInteger(Number(qty))&&Number(qty)>=min,`${min}: ${qty}`);
  }
});
test('work order uses selected fabric instead of hardcoded 10수',()=>{
  const block=source.split('\n').find(l=>l.includes("L('A5','원단명')"));
  for (const [category,fabric,expected] of [['poly','basic','폴리'],['ecobag','denim','데님'],['ecobag','basic','기본 원단 (상담 확인)']]) {
    const cells={};const c={L(){},V(k,v){cells[k]=v},bag:{},bagCategory:()=>category,bagFabricId:fabric,FABRICS:[{id:'denim',name:'데님'}],packType:'test'};
    vm.createContext(c);vm.runInContext(block,c);assert.equal(cells.B5,expected);
  }
});
