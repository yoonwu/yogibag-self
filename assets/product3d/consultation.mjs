import { normalizeConfig, serializeConfig, getConsultationSpecs, getPrintBoundsWarnings, getProductProfile } from './config.mjs?v=1.2.7';
import { dataURLBytes } from './zip.mjs?v=1.2.7';
import { openKakaoConsultation } from './kakao-consultation.mjs?v=1.2.7';

const EMAIL_ENDPOINT = 'https://cnfgzjmgdwuaywqaufkt.supabase.co/functions/v1/resend-email';
const STAFF_EMAIL = 'thdghkstlr@gmail.com';
const encoder = new TextEncoder();
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeName = value => String(value || '이미지').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 100);
function node(tag, className, text) {
  const n = document.createElement(tag); n.className = className;
  if (text !== undefined) n.textContent = text;
  return n;
}
function identifier() {
  const now = new Date(), day = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Seoul', year:'numeric', month:'2-digit', day:'2-digit'}).format(now).replace(/\D/g,'');
  return `YG3D-${day}-${crypto.randomUUID().slice(0, 8)}`;
}
function base64(bytes) {
  let result = '';
  for (let i = 0; i < bytes.length; i += 0x8000) result += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(result);
}

function pngDimensions(dataURL) {
  const bytes = dataURLBytes(dataURL);
  if (bytes.length < 24 || ![137,80,78,71,13,10,26,10].every((value,index)=>bytes[index]===value)
      || String.fromCharCode(...bytes.subarray(12,16)) !== 'IHDR') throw new Error('시안 미리보기 이미지가 올바른 PNG 파일이 아닙니다.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16), height = view.getUint32(20);
  if (!width || !height) throw new Error('시안 미리보기 이미지 크기를 확인할 수 없습니다.');
  return {width,height};
}

async function workbook(config, views, customer, reference) {
  if (!window.ExcelJS) throw new Error('상담표 생성 도구를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.');
  const book = new window.ExcelJS.Workbook();
  book.creator = '요기백';
  const sheet = book.addWorksheet('상담 희망 시안', {pageSetup:{paperSize:9, orientation:'portrait', fitToPage:true, fitToWidth:1, fitToHeight:0}});
  sheet.columns = [{width:31}, {width:67}];
  sheet.mergeCells('A1:B1'); sheet.getCell('A1').value = '요기백 · 3D 커스텀 상담 시안';
  sheet.getCell('A1').font = {name:'맑은 고딕',size:18,bold:true,color:{argb:'FF1B64DA'}};
  sheet.getRow(1).height = 34;
  const rows = [{label:'시안 번호',value:reference},
    {label:'상담자',value:customer.name || '(미입력)'}, {label:'연락처',value:customer.phone || '(미입력)'},
    {label:'이메일',value:customer.email || '(미입력)'}, {label:'희망 수량',value:customer.quantity || '(미입력)'},
    ...getConsultationSpecs(config), ...getPrintBoundsWarnings(config).map(value => ({label:'인쇄 위치 확인',value})),
    {label:'추가 요청',value:customer.request || '(없음)'}];
  for (const spec of rows) {
    const row = sheet.addRow([spec.label, spec.value]);
    row.height = spec.value.length > 45 ? 42 : 25;
    row.eachCell(cell => {
      cell.font = {name:'맑은 고딕',size:10}; cell.alignment = {vertical:'middle',wrapText:true};
      cell.border = {bottom:{style:'hair',color:{argb:'FFE5E8EB'}}};
    });
    row.getCell(1).font = {name:'맑은 고딕',size:10,bold:true};
    row.getCell(1).fill = {type:'pattern',pattern:'solid',fgColor:{argb:'FFF2F4F6'}};
  }
  for (const view of views) {
    sheet.addRow([view.label, '']);
    const image = book.addImage({base64:view.dataURL,extension:'png'});
    const row = sheet.rowCount;
    const size = pngDimensions(view.dataURL), scale = Math.min(510 / size.width, 365 / size.height);
    const width = size.width * scale, height = size.height * scale;
    sheet.addImage(image,{tl:{col:0,row},ext:{width,height}});
    for (let i = 0; i < Math.ceil(height * 0.75 / 20) + 1; i++) sheet.addRow(['','']).height = 20;
  }
  return new Uint8Array(await book.xlsx.writeBuffer());
}

export async function buildConsultationFiles(config, views, customer = {}, reference = identifier()) {
  if (!Array.isArray(views) || !views.length || views.length > 10) throw new Error('상담 시안 미리보기를 다시 생성해 주세요.');
  for (const view of views) pngDimensions(view?.dataURL);
  const c = normalizeConfig(config);
  const specs = getConsultationSpecs(c);
  const customerInfo = {name:customer.name || '',phone:customer.phone || '',email:customer.email || '',quantity:customer.quantity || '',request:customer.request || ''};
  const files = [
    {name:`${reference}_시안설정.json`,data:encoder.encode(serializeConfig(c))},
    {name:`${reference}_상담정보.json`,data:encoder.encode(JSON.stringify({reference,customer:customerInfo,specs,warnings:getPrintBoundsWarnings(c)},null,2))},
    {name:`${reference}_상담표.xlsx`,data:await workbook(c,views,customerInfo,reference)},
  ];
  for (const view of views) files.push({name:`${reference}_시안_${safeName(view.label)}.png`,data:dataURLBytes(view.dataURL)});
  const sides = ['front', ...(c.options.doubleSided ? ['back'] : []), ...(c.options.innerPocketPrint ? ['innerPocket'] : [])];
  for (const side of sides) {
    const p = c.print[side], sideName = { front: '앞면', back: '뒷면', innerPocket: '안주머니' }[side];
    if (!p.image) continue;
    const ext = /^data:image\/png;/i.test(p.image) ? '.png' : '.jpg';
    files.push({name:`${reference}_${sideName}_인쇄원본_${safeName(p.imageName || 'logo').replace(/\.(png|jpe?g)$/i,'')}${ext}`,data:dataURLBytes(p.image)});
    // Keep the original artwork in the planar SVG; its metadata records the selected preview expression.
    if (p.enabled) {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${p.width}mm" height="${p.height}mm" viewBox="0 0 ${p.width} ${p.height}" data-preview-appearance="${p.appearance}"><metadata>${p.appearance === 'embroidery' ? '자수' : '인쇄'} 미리보기 · 도안 원본</metadata><image href="${escape(p.image)}" width="${p.width}" height="${p.height}" preserveAspectRatio="none"/></svg>`;
      files.push({name:`${reference}_평면인쇄_${sideName}.svg`,data:encoder.encode(svg)});
    }
  }
  return {reference,config:c,files};
}

export async function openConsultation({config,viewer}) {
  if (getProductProfile(config).consultationMode === 'kakao') return openKakaoConsultation({config,viewer});
  const c = normalizeConfig(config), reference = identifier();
  const previousFocus = document.activeElement;
  const editorDialog = viewer.container?.closest('.p3d-dialog');
  const previousInert = editorDialog?.inert;
  if (editorDialog) editorDialog.inert = true;
  let views;
  try {
    await viewer.setConfig(c);
    views = await viewer.captureViews();
    if (viewer.config && serializeConfig(viewer.config) !== serializeConfig(c)) {
      throw new Error('이미지나 설정이 변경되었습니다. 시안을 확인한 뒤 다시 상담 자료를 열어 주세요.');
    }
  } catch (error) {
    if (editorDialog) editorDialog.inert = previousInert;
    throw error;
  }
  const root = node('div','p3dc-overlay'), dialog = node('section','p3dc-dialog');
  dialog.setAttribute('role','dialog'); dialog.setAttribute('aria-modal','true'); dialog.setAttribute('aria-label','이 시안으로 상담하기');
  const header = node('header','p3dc-header');
  const title = node('h2','', '이 시안으로 상담하기');
  const close = node('button','p3dc-button','닫기'); close.type = 'button';
  header.append(title,close); dialog.append(header);
  const content = node('div','p3dc-content'), preview = node('div','p3dc-preview');
  for (const view of views) {
    const figure = node('figure','p3dc-figure'), image = new Image(); image.src = view.dataURL; image.alt = `${view.label} 희망 시안`;
    figure.append(image,node('figcaption','',view.label)); preview.append(figure);
  }
  content.append(node('p','p3dc-intro','원하는 치수와 시안을 함께 전달합니다. 제작 가능 여부와 가격은 상담 후 안내합니다.'),preview);
  const specs = node('dl','p3dc-specs');
  for (const spec of getConsultationSpecs(c).filter(spec => !['상담 확인 사항','샘플 치수 기준'].includes(spec.label))) specs.append(node('dt','',spec.label),node('dd','',spec.value));
  content.append(specs);
  const form = node('form','p3dc-form');
  const fields = {};
  for (const [key,label,type] of [['name','성함','text'],['phone','연락처','tel'],['email','이메일','email'],['quantity','희망 수량','number']]) {
    const wrap = node('label','p3dc-field',label), input = document.createElement('input');
    input.type = type; input.setAttribute('aria-label',`상담 ${label}`); input.autocomplete = {name:'name',phone:'tel',email:'email'}[key] || 'off';
    input.maxLength = 120; if (type === 'number') {input.min = '1'; input.step = '1';}
    fields[key] = input; wrap.append(input); form.append(wrap);
  }
  const request = node('label','p3dc-field p3dc-wide','추가 요청 사항'), textarea = document.createElement('textarea');
  textarea.maxLength = 3000; textarea.setAttribute('aria-label','상담 추가 요청 사항'); request.append(textarea); fields.request = textarea; form.append(request);
  const localSample = !['self.yogibag.co.kr','yoonwu.github.io'].includes(location.hostname);
  const note = node('p','p3dc-note',localSample ? '로컬 샘플에서는 상담 시안을 확인할 수 있습니다. 상담 접수는 운영 사이트에서 진행해 주세요.' : '상담 접수 시 성함과 연락처를 입력해 주세요.');
  content.append(form,note); dialog.append(content);
  const footer = node('footer','p3dc-footer'), status = node('p','p3dc-status'); status.setAttribute('role','status');
  const actions = node('div','p3dc-actions');
  const submit = node('button','p3dc-button p3dc-primary','상담 접수하기'); submit.disabled = localSample;
  actions.append(submit); footer.append(status,actions); dialog.append(footer); root.append(dialog); document.body.append(root);
  const controller = new AbortController(), signal = controller.signal;
  let busy = false, lastBundle, lastCustomer = '';
  const customer = () => Object.fromEntries(Object.entries(fields).map(([key,input]) => [key,input.value.trim()]));
  const bundle = async () => {
    const value = customer(), key = JSON.stringify(value);
    if (!lastBundle || key !== lastCustomer) {lastBundle = await buildConsultationFiles(c,views,value,reference); lastCustomer = key;}
    return lastBundle;
  };
  const dismiss = () => {if(busy)return;controller.abort();root.remove();if(editorDialog)editorDialog.inert=previousInert;previousFocus?.focus();};
  close.addEventListener('click',dismiss,{signal});
  root.addEventListener('click',e => {if(e.target === root)dismiss();},{signal});
  root.addEventListener('keydown',e => {
    e.stopPropagation();
    if(e.key === 'Escape'){e.preventDefault();e.stopPropagation();dismiss();}
    if(e.key === 'Tab') {
      const focusable = [...dialog.querySelectorAll('button:not(:disabled),input,textarea')];
      const first = focusable[0],last=focusable.at(-1);
      if(e.shiftKey && document.activeElement===first){e.preventDefault();last.focus();}
      else if(!e.shiftKey && document.activeElement===last){e.preventDefault();first.focus();}
    }
  },{signal});
  form.addEventListener('submit',e=>e.preventDefault(),{signal});
  const work = async action => {
    if(busy)return;busy=true;submit.disabled=true;close.disabled=true;
    status.textContent='상담 자료를 준비하고 있습니다…';
    try {await action();} catch(error){status.textContent=error.message;}
    finally {busy=false;submit.disabled=localSample || submit.dataset.completed === 'true';close.disabled=false;}
  };
  submit.addEventListener('click',()=>work(async()=>{
    if(localSample) throw new Error('상담 접수는 운영 사이트에서 진행해 주세요.');
    const value=customer();
    if(value.name.length<2 || !/^01\d-?\d{3,4}-?\d{4}$/.test(value.phone)) throw new Error('성함과 올바른 연락처를 입력해 주세요.');
    if(value.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value.email)) throw new Error('이메일 형식을 확인해 주세요.');
    if(value.quantity && (!/^\d+$/.test(value.quantity)||!Number.isSafeInteger(Number(value.quantity))||Number(value.quantity)<1)) throw new Error('희망 수량은 1 이상의 정수로 입력해 주세요.');
    const data=await bundle();
    if(data.files.reduce((sum,file)=>sum+file.data.length,0)>38*1024*1024) throw new Error('첨부 용량이 너무 큽니다. 이미지 크기를 줄여 주세요.');
    const html=`<h2>요기백 3D 시안 상담 요청</h2><p>${escape(reference)}</p><p>성함: ${escape(value.name)}<br>연락처: ${escape(value.phone)}<br>이메일: ${escape(value.email)}<br>희망 수량: ${escape(value.quantity)}</p><table>${getConsultationSpecs(c).map(s=>`<tr><th>${escape(s.label)}</th><td>${escape(s.value)}</td></tr>`).join('')}</table><p style="white-space:pre-wrap">${escape(value.request)}</p>`;
    const response=await fetch(EMAIL_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({to:STAFF_EMAIL,subject:`[요기백 3D 상담] ${reference} · ${value.name}`,html,attachments:data.files.map(file=>({filename:file.name,content:base64(file.data)}))})});
    const result=await response.json();
    if(!response.ok || result.error) throw new Error(result.error || '상담 접수를 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    status.textContent=`상담 요청이 접수되었습니다. 시안 번호 ${reference}`;
    submit.textContent='상담 접수 완료'; submit.dataset.completed='true';
  }),{signal});
  close.focus();
}
