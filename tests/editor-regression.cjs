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

test('the actual 2D bridge forwards controlled product draft restoration options', async () => {
  const calls = [], api = { applyDesign: async (...args) => { calls.push(args); return 'applied'; }, isReady: () => true };
  const context = vm.createContext({ window: {}, legacyDesignReady: Promise.resolve(api), legacyDesignAPI: api });
  vm.runInContext(section('window.yogibagDesignBridge=Object.freeze({', 'updateDesignViewToggle();'), context);
  const snapshot = { productId: 'daily' }, options = { restoreProductDraft: true };
  assert.equal(await context.window.yogibagDesignBridge.applyDesign(snapshot, options), 'applied');
  assert.equal(calls[0][0], snapshot); assert.equal(calls[0][1], options);
  await context.window.yogibagDesignBridge.applyDesign(snapshot);
  assert.equal(calls[1][1], undefined);
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
    linkedCrossStrapSettings:new Map([['daily',{length:800}]]),
    linkedDesignDimensions:new Map([['daily',{width:360,height:360,depth:100}],['poly_v',{width:330,height:360,depth:30}]]),
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

test('per-side embroidery appearance survives actual undo, redo and saved-state restoration',()=>{
  const c=editor();
  vm.runInContext(section('function normalizePrintAppearances(value) {','function artworkAppearancePart(object) {'),c);
  c.printAppearances={front:'print',back:'embroidery',innerPocket:'print'};
  vm.runInContext('saveState()',c);
  c.printAppearances.front='embroidery';c.printAppearances.innerPocket='embroidery';
  vm.runInContext('saveState();undo()',c);
  assert.equal(c.printAppearances.front,'print');assert.equal(c.printAppearances.back,'embroidery');
  assert.equal(c.printAppearances.innerPocket,'print');
  vm.runInContext('redo()',c);
  const saved=c.captureDesignState();
  assert.equal(saved.printAppearances.front,'embroidery');assert.equal(saved.printAppearances.innerPocket,'embroidery');
  c.printAppearances={front:'print',back:'print',innerPocket:'print'};
  c.restore(saved);
  assert.equal(c.printAppearances.front,'embroidery');assert.equal(c.printAppearances.back,'embroidery');
  const old=c.captureDesignState();delete old.printAppearances;c.restore(old);
  assert.equal(c.printAppearances.front,'print');assert.equal(c.printAppearances.back,'print');
  assert.equal(c.sideDesigns.back[0].text,'BACK');
});

test('undo and saved history preserve independent measurements for different products',()=>{
  const c=editor();vm.runInContext('saveState()',c);
  c.linkedDesignDimensions.set('daily',{width:420,height:360,depth:120});
  c.linkedDesignDimensions.set('poly_v',{width:335,height:365,depth:35});
  vm.runInContext('saveState();undo()',c);
  assert.equal(c.linkedDesignDimensions.get('daily').width,360);
  assert.equal(c.linkedDesignDimensions.get('poly_v').width,330);
  vm.runInContext('redo()',c);
  assert.equal(c.linkedDesignDimensions.get('daily').width,420);
  assert.equal(c.linkedDesignDimensions.get('poly_v').width,335);
  const state=c.captureDesignState();
  c.linkedDesignDimensions.clear();c.restore(JSON.parse(JSON.stringify(state)));
  assert.equal(c.linkedDesignDimensions.get('daily').depth,120);
  assert.equal(c.linkedDesignDimensions.get('poly_v').depth,35);
});

test('the actual 2D size and 3D-toggle functions cover every live SKU, measured poly sizes and custom dimensions',async()=>{
  const {PRODUCT3D_PROFILES}=await import('../assets/product3d/config.mjs');
  const nodes=new Map(),context={currentBag:null,canvas:{},drawBagPending:false,isRestoring:false,
    window:{yogibagDesignBridge:{isReady:()=>true}},document:{getElementById:id=>{
      if(!nodes.has(id))nodes.set(id,{dataset:{}});return nodes.get(id);
    }}};
  vm.createContext(context);
  vm.runInContext(section('const BAG_MODELS =','/* Cafe24 상품번호'),context);
  context.findBagById=id=>vm.runInContext('Object.values(BAG_MODELS).flat()',context).find(bag=>bag.id===id);
  vm.runInContext(section('// Linked 3D measurements','const CW ='),context);
  const bags=vm.runInContext('Object.values(BAG_MODELS).flat()',context);
  assert.equal(bags.length,12);
  for(const bag of bags) {
    context.currentBag=bag;
    const dimensions=vm.runInContext('getBagRealSize()',context);
    assert.deepEqual(JSON.parse(JSON.stringify(dimensions)),PRODUCT3D_PROFILES[bag.id].dimensions,bag.id);
    vm.runInContext('updateDesignViewToggle()',context);
    assert.equal(nodes.get('product3dCanvasToggle').disabled,false,bag.id);
    assert.equal(nodes.get('product3dLaunch').disabled,false,bag.id);
  }
  context.currentBag=context.findBagById('poly_h');
  vm.runInContext("linkedDesignDimensions.set('poly_h',{width:405,height:325,depth:40})",context);
  assert.equal(vm.runInContext('getBagRealSize().width',context),405);
  context.currentBag=context.findBagById('poly_v');assert.equal(vm.runInContext('getBagRealSize().width',context),330);
  context.currentBag={id:'unknown-sku'};vm.runInContext('updateDesignViewToggle()',context);
  assert.equal(nodes.get('product3dCanvasToggle').disabled,true);
});

test('the actual poly appearance callback preserves PNG palette keys, custom colors and product option locks',()=>{
  const code=section('    applyAppearance:','    installArtwork:').trim().replace(/^applyAppearance:/,'').replace(/,\s*$/,'');
  const context={currentBag:{id:'poly_v'},bagFabricId:'basic',bagTexture:null,bagBodyColor:null,polyBodyKey:'black',webbingColor:null,
    FABRICS:[{id:'basic'}],POLY_BODY:{poly_v:{black:'black.png',navy:'navy.png',green:'green.png'}},BAG_IMAGES:{},activeOptions:new Set(),twoSided:false,
    bagCategory:bag=>bag.id.startsWith('poly')?'poly':bag.id==='minja'?'pouch':'ecobag',drawBag(){},applyFabricColor(fab,color){this.bagBodyColor=color.hex;}};
  vm.createContext(context);
  vm.runInContext(section('const POLY_COLORS =','// 원단(질감)'),context);
  vm.runInContext(section('const OPTIONS =','const IMG_BASE'),context);
  vm.runInContext(section('const BAG_OPT_CONF =','/* 현재 가방에'),context);
  const apply=vm.runInContext(`(${code})`,context);
  for(const [key,color] of [['black','#1a1a1a'],['navy','#1a2a4a'],['green','#104727']]) {
    apply({body:{color,fabricId:'basic'},handle:{color:'#040000'},options:['지퍼','안주머니인쇄','이름표','크로스끈','OPP개별포장'],twoSided:true});
    assert.equal(context.polyBodyKey,key);assert.equal(context.bagBodyColor,null);assert.equal(context.BAG_IMAGES.poly_v_body,`${key}.png`);
    assert.equal(context.webbingColor,'#040000');assert.equal(context.activeOptions.has('지퍼'),false);
    assert.ok(context.activeOptions.has('이름표'));assert.equal(context.activeOptions.has('안주머니'),false);
  }
  apply({body:{color:'#ff8800',fabricId:'basic'},handle:{color:'#ffffff'},options:[],twoSided:false});
  assert.equal(context.bagBodyColor,'#ff8800');assert.ok(context.activeOptions.has('이름표'));
  apply({body:{color:'#104727',fabricId:'basic'},handle:{color:'#040000'},options:[],twoSided:false,
    preserveBody:true,preserveHandle:true,originalAppearance:{polyBodyKey:'green',bodyColor:null,handleColor:null}});
  assert.equal(context.polyBodyKey,'green');assert.equal(context.bagBodyColor,null);assert.equal(context.webbingColor,null);
  context.currentBag={id:'minja'};
  apply({body:{color:'#ece6d9',fabricId:'basic'},handle:{color:'#ece6d9'},options:['자석','크로스끈','안주머니','OPP개별포장'],twoSided:false});
  assert.deepEqual([...context.activeOptions].sort(),['OPP개별포장','지퍼'].sort());
});

test('startup bag selection agrees with 3D product URLs and keeps Cafe24 SKU links',()=>{
  const supported=new Set(['small','sgak_s','kids','sgak_m','daily','market','sgak_l','minja','mitdan','tumbler','poly_v','poly_h']);
  const context={URLSearchParams,location:{search:''},PRODUCT_BAG_MAP:{'397':'daily','719':'poly_v'},findBagById:id=>supported.has(id)?{id}:null};
  vm.createContext(context);vm.runInContext(section('function resolveStartBagId() {','const FONTS ='),context);
  for(const id of supported) for(const query of [`?bag=${id}`,`?mode=3d&product=${id}`,`?mode=3d&product=${id}&bag=daily`]) {
    context.location.search=query;assert.equal(vm.runInContext('resolveStartBagId()',context),id,query);
  }
  context.location.search='?product_no=719';assert.equal(vm.runInContext('resolveStartBagId()',context),'poly_v');
  context.location.search='?mode=3d&product=unsupported';assert.equal(vm.runInContext('resolveStartBagId()',context),null);
});

test('the actual 2D print hint matches each SKU 3D guide on separate physical axes and custom dimensions',async()=>{
  const {PRODUCT3D_PROFILES,createDefaultConfig,getProductPrintArea}=await import('../assets/product3d/config.mjs');
  const hint={},context={document:{getElementById:()=>hint},currentBag:null,bagBodyRect:null,printArea:null,
    getOpaqueBBox(){return context.opaque;},getBagRealSize(){return context.dimensions;}};
  vm.createContext(context);vm.runInContext(section('function updatePrintSizeHint() {','/* 캔버스 1px'),context);
  for(const [id,profile] of Object.entries(PRODUCT3D_PROFILES).filter(([,p])=>p.category!=='sample')) {
    const {image,body,print}=profile.referenceLayout;
    context.currentBag={id};context.opaque={w:body.width,h:body.height};
    context.bagBodyRect={scaleX:.42,scaleY:.63,getElement:()=>({})};
    context.printArea={getBoundingRect:()=>({width:image.width*print.width*.42,height:image.height*print.height*.63})};
    for(const custom of [false,true]) {
      const config=createDefaultConfig(id);
      if(custom) {config.dimensions.width+=10;config.dimensions.height+=20;}
      context.dimensions=config.dimensions;const expected=getProductPrintArea(config);
      vm.runInContext('updatePrintSizeHint()',context);
      assert.equal(hint.textContent,`인쇄 가능 영역: 약 ${(expected.width/10).toFixed(1)} × ${(expected.height/10).toFixed(1)} cm`,`${id}/${custom?'custom':'default'}`);
    }
  }
  context.dimensions={width:360,height:360};context.bagBodyRect=null;context.printArea=null;
  vm.runInContext('updatePrintSizeHint()',context);
  assert.equal(hint.textContent,'인쇄 가능 영역: 약 34.0 × 34.0 cm','loading uses the previous body-minus-margin fallback');
});

test('cross strap length survives undo, redo and loading a saved 2D design',()=>{
  const c=editor();
  vm.runInContext('saveState()',c);
  c.linkedCrossStrapSettings.set('daily',{length:925.5});
  vm.runInContext('saveState();undo()',c);
  assert.equal(c.linkedCrossStrapSettings.get('daily').length,800);
  vm.runInContext('redo()',c);
  assert.equal(c.linkedCrossStrapSettings.get('daily').length,925.5);
  c.savedDesignsReady=true;c.savedDesigns=[];c.originalUploads=new Map();
  c.canvas.discardActiveObject=()=>{};c.canvas.requestRenderAll=()=>{};c.canvas.toDataURL=()=> 'thumbnail';
  c.renderSaved=()=>{};c.persistSavedDesigns=()=>{};c.showToast=()=>{};
  vm.runInContext(section('function saveCurrentDesign() {','// IndexedDB also'),c);
  vm.runInContext(section('function loadDesign(i) {','function deleteDesign(i)'),c);
  vm.runInContext('saveCurrentDesign()',c);
  c.linkedCrossStrapSettings.set('daily',{length:600});
  vm.runInContext('loadDesign(0)',c);
  assert.equal(c.linkedCrossStrapSettings.get('daily').length,925.5);
  assert.equal(c.undoStack.length,1);
  const legacy=JSON.parse(JSON.stringify(c.savedDesigns[0].state));delete legacy.linkedCrossStraps;
  c.restore(legacy);
  assert.equal(c.linkedCrossStrapSettings.size,0,'older saved drafts discard the previous design length and use the default');
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

test('the actual work-order export includes the selected custom cross length and keeps ordinary handles intact',async()=>{
  const block=section('async function generateWorkOrderExcel(orderData) {',"document.getElementById('orderSubmit')");
  for(const selected of [true,false]){
    const cells=new Map(),rows=new Map(),merges=[];
    const ws={getCell(address){if(!cells.has(address))cells.set(address,{});return cells.get(address);},
      getRow(row){if(!rows.has(row))rows.set(row,{});return rows.get(row);},mergeCells(address){merges.push(address);},addImage(){}};
    const c={currentBag:{id:'daily',name:'데일리',size:'36×36cm'},STRAP_SIZE:{daily:'57cm(두른길이, 시접제외)'},
      linkedCrossStrapSettings:new Map([['daily',{length:925.5}]]),activeOptions:new Set(selected?['크로스끈']:[]),
      ExcelJS:{Workbook:class{constructor(){this.xlsx={writeBuffer:async()=>new Uint8Array([1,2,3])};}addWorksheet(){return ws;}addImage(){return 1;}}},
      calcSidePrintInfo:()=>[{label:'앞면',size:'10 × 10 cm',pos:'중앙'}],bagCategory:()=> 'ecobag',bagFabricId:'basic',FABRICS:[],
      bagColorName:()=> '아이보리',webbingColorName:()=> '아이보리',twoSided:false,OPTION_IMAGES:{},BAG_IMAGES:{},
      captureAllSides:()=>[{data:'data:image/png;base64,AA=='}],CW:560,CH:720,btoa:value=>Buffer.from(value,'binary').toString('base64')};
    vm.createContext(c);
    vm.runInContext(section('function getCrossStrapSettings() {','let legacySyncBusy'),c);
    vm.runInContext(block,c);
    const output=await c.generateWorkOrderExcel({name:'TEST',qty:10,opp:false,orderNum:'TEST',orderDate:'2026-10-06',request:''});
    assert.ok(output.fileName.endsWith('.xlsx'));assert.equal(output.base64,'AQID');
    assert.equal(cells.get('D9').value,'57cm(두른길이, 시접제외)');
    const crossEntry=[...cells].find(([,cell])=>cell.value==='크로스끈 길이');
    assert.equal(Boolean(crossEntry),selected);
    if(selected){
      const row=crossEntry[0].slice(1);
      assert.equal(cells.get(`B${row}`).value,'925.5 mm');
      assert.ok(merges.includes(`B${row}:D${row}`));
      assert.equal(rows.get(Number(row)).height,22);
    }else assert.ok(![...cells.values()].some(cell=>cell.value==='925.5 mm'));
  }
});
