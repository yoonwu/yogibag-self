import { normalizeConfig, serializeConfig, getConsultationSpecs } from './config.mjs?v=1.2.10';

export const KAKAO_CHAT_URL = 'https://pf.kakao.com/_dGxlxlj/chat';

// Start the clipboard operation inside the click gesture, even when a texture
// or embroidery worker must finish before the PNG becomes available.
export function beginCaptureCopy(blobPromise, { clipboard, ClipboardItem } = {}) {
  if (!clipboard?.write || !ClipboardItem || (ClipboardItem.supports && !ClipboardItem.supports('image/png'))) return Promise.resolve(false);
  try {
    return Promise.resolve(clipboard.write([new ClipboardItem({ 'image/png': blobPromise })])).then(() => true, () => false);
  } catch { return Promise.resolve(false); }
}

export async function handoffCapture(blobPromise, environment) {
  const copying = beginCaptureCopy(blobPromise, environment);
  const blob = await blobPromise;
  const copied = await copying;
  let opened = false;
  if (copied) {
    environment.onCopied?.();
    try { opened = Boolean(environment.openChat?.()); } catch { /* Keep the manual chat link available. */ }
  }
  return { blob, copied, opened };
}

function openChat() {
  const chat = window.open('', '_blank');
  if (!chat) return false;
  chat.opener = null;
  chat.location.replace(KAKAO_CHAT_URL);
  return true;
}

function wrapText(context, text, maxWidth) {
  const lines = []; let line = '';
  for (const char of String(text)) {
    if (line && context.measureText(line + char).width > maxWidth) { lines.push(line); line = ''; }
    line += char;
  }
  if (line) lines.push(line);
  return lines;
}

export async function captureChatImage(config, viewer) {
  const c = normalizeConfig(await config);
  const dataURL = await viewer.captureCurrentView();
  if (viewer.config && serializeConfig(viewer.config) !== serializeConfig(c)) throw new Error('시안이 변경되었습니다. 다시 캡쳐해 주세요.');
  const image = new Image(); image.src = dataURL; await image.decode();
  const canvas = document.createElement('canvas');
  const width = Math.min(1200, Math.max(800, image.naturalWidth));
  const imageHeight = Math.round(image.naturalHeight * width / image.naturalWidth);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('시안을 캡쳐할 수 없습니다. 다시 시도해 주세요.');
  const font = '20px "Malgun Gothic", Arial, sans-serif'; ctx.font = font;
  const rows = getConsultationSpecs(c).filter(s => !['상품','상담 확인 사항','샘플 치수 기준','상품 치수 기준','인쇄 좌표 기준'].includes(s.label))
    .flatMap(s => wrapText(ctx, `${s.label}: ${s.value}`, width - 56));
  canvas.width = width; canvas.height = 80 + imageHeight + rows.length * 30 + 64;
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#191f28'; ctx.font = 'bold 28px "Malgun Gothic", Arial, sans-serif';
  ctx.fillText(`요기백 · ${c.productName}`, 28, 48);
  ctx.drawImage(image, 0, 80, width, imageHeight);
  ctx.font = font;
  rows.forEach((line, index) => ctx.fillText(line, 28, 110 + imageHeight + index * 30));
  ctx.fillStyle = '#6b7684'; ctx.font = '18px "Malgun Gothic", Arial, sans-serif';
  ctx.fillText('상담용 시안 · 가격과 제작 가능 여부는 상담에서 확인합니다.', 28, canvas.height - 22);
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('캡쳐 이미지를 만들 수 없습니다.')), 'image/png'));
}

function node(tag, className, text) {
  const n = document.createElement(tag); n.className = className;
  if (text !== undefined) n.textContent = text;
  return n;
}

export function openKakaoConsultation({ config, viewer }) {
  const previousFocus = document.activeElement;
  const editor = viewer.container?.closest('.p3d-dialog') || viewer.container?.closest('.body'), previousInert = editor?.inert;
  if (editor) editor.inert = true;
  const root = node('div', 'p3dc-overlay'), dialog = node('section', 'p3dc-dialog p3dc-chat-dialog');
  dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true'); dialog.setAttribute('aria-label', '카카오톡 시안 상담');
  const header = node('header', 'p3dc-header'), title = node('h2', '', '시안을 캡쳐하고 있습니다…');
  title.setAttribute('role', 'status');
  const close = node('button', 'p3dc-button', '닫기'); close.type = 'button'; close.disabled = true;
  header.append(title, close); dialog.append(header);
  const content = node('div', 'p3dc-content');
  const status = node('p', 'p3dc-intro', '지금 보고 있는 각도와 선택한 옵션을 함께 담아요.'); status.setAttribute('role', 'status');
  const image = node('img', 'p3dc-chat-image'); image.alt = '현재 각도와 선택 사양이 담긴 상담용 캡쳐'; image.hidden = true;
  content.append(status, image); dialog.append(content);
  const footer = node('footer', 'p3dc-footer'), actions = node('div', 'p3dc-actions');
  const copy = node('button', 'p3dc-button', '이미지 다시 복사'); copy.type = 'button'; copy.disabled = true;
  const share = node('button', 'p3dc-button', '캡쳐 이미지 공유'); share.type = 'button'; share.hidden = true;
  const chat = node('a', 'p3dc-button p3dc-kakao', '카카오톡 상담하기');
  chat.href = KAKAO_CHAT_URL; chat.target = '_blank'; chat.rel = 'noopener noreferrer'; chat.hidden = true;
  actions.append(copy, share, chat); footer.append(actions); dialog.append(footer); root.append(dialog); document.body.append(root);
  const controller = new AbortController(), { signal } = controller;
  let blob, imageURL;
  const copiedNotice = () => { title.textContent = '캡쳐되었습니다'; status.textContent = '이미지가 복사되었습니다. 카카오톡 입력창에서 붙여넣기(Ctrl+V 또는 길게 누르기) 후 보내 주세요.'; };
  const dismiss = () => { controller.abort(); root.remove(); if (imageURL) URL.revokeObjectURL(imageURL); if (editor) editor.inert = previousInert; previousFocus?.focus(); };
  close.addEventListener('click', dismiss, { signal });
  root.addEventListener('keydown', event => {
    event.stopPropagation();
    if (event.key === 'Escape' && !close.disabled) { event.preventDefault(); dismiss(); }
    if (event.key === 'Tab') {
      const controls = [...dialog.querySelectorAll('button:not(:disabled):not([hidden]),a:not([hidden])')];
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  }, { signal });
  copy.addEventListener('click', async () => {
    copy.disabled = true;
    const copied = await beginCaptureCopy(blob, { clipboard: navigator.clipboard, ClipboardItem: globalThis.ClipboardItem });
    if (copied) copiedNotice();
    else status.textContent = share.hidden
      ? '이미지 복사가 허용되지 않았습니다. 캡쳐 이미지를 길게 누르거나 우클릭해 복사한 뒤 카카오톡에 첨부해 주세요.'
      : '이미지 복사가 지원되지 않거나 허용되지 않았습니다. 캡쳐 이미지 공유를 눌러 카카오톡에 전달해 주세요.';
    copy.disabled = false;
  }, { signal });
  share.addEventListener('click', async () => {
    try { await navigator.share({ files: [new File([blob], '요기백-상담시안.png', { type: 'image/png' })], title: '요기백 상담 시안' }); }
    catch (error) { if (error.name !== 'AbortError') status.textContent = '이미지 공유를 완료하지 못했습니다. 이미지 복사를 이용해 주세요.'; }
  }, { signal });
  chat.addEventListener('click', () => { status.textContent = '카카오톡에서 붙여넣기 후 보내 주세요. 이미지 복사가 안 됐다면 이 화면의 이미지 공유를 이용해 주세요.'; }, { signal });
  const capture = captureChatImage(config, viewer);
  return handoffCapture(capture, { clipboard: navigator.clipboard, ClipboardItem: globalThis.ClipboardItem, openChat, onCopied: copiedNotice }).then(result => {
    blob = result.blob; imageURL = URL.createObjectURL(blob); image.src = imageURL; image.hidden = false;
    title.textContent = '캡쳐되었습니다'; chat.hidden = false;
    copy.disabled = !navigator.clipboard?.write || !globalThis.ClipboardItem;
    try { share.hidden = !navigator.share || !navigator.canShare?.({ files: [new File([blob], '요기백-상담시안.png', { type: 'image/png' })] }); } catch { share.hidden = true; }
    if (!result.copied) status.textContent = share.hidden
      ? '현재 시안을 캡쳐했습니다. 자동 복사가 지원되지 않거나 허용되지 않았습니다. 캡쳐 이미지를 길게 누르거나 우클릭해 복사한 뒤 카카오톡에 첨부해 주세요.'
      : '현재 시안을 캡쳐했습니다. 자동 복사가 지원되지 않거나 허용되지 않았습니다. 캡쳐 이미지 공유를 눌러 카카오톡에 전달해 주세요.';
    else if (!result.opened) status.textContent += ' 아래 카카오톡 상담하기를 눌러 주세요.';
    close.disabled = false; close.focus();
    return result;
  }).catch(error => { title.textContent = '캡쳐하지 못했습니다'; status.textContent = error.message; close.disabled = false; close.focus(); });
}
