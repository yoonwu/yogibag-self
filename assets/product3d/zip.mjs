// Small ZIP writer using STORE. Images and XLSX are already compressed.
// UTF-8 filenames, CRC-32 and standard local/central/end records; no dependency.
const encoder = new TextEncoder();
const crcTable = Uint32Array.from({ length: 256 }, (_, i) => {
  let n = i;
  for (let bit = 0; bit < 8; bit++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
export function crc32(bytes) {
  let n = 0xffffffff;
  for (const b of bytes) n = crcTable[(n ^ b) & 255] ^ (n >>> 8);
  return (n ^ 0xffffffff) >>> 0;
}
export function dataURLBytes(url) {
  if (typeof url !== 'string' || !/^data:image\/(png|jpeg);base64,/i.test(url)) throw new Error('올바른 이미지 데이터가 아닙니다.');
  try {
    const decoded = atob(url.slice(url.indexOf(',') + 1));
    if (!decoded.length) throw new Error('empty');
    return Uint8Array.from(decoded, c => c.charCodeAt(0));
  } catch {
    throw new Error('이미지 데이터를 읽지 못했습니다. 이미지를 다시 올려 주세요.');
  }
}
export function makeZip(files) {
  if (!Array.isArray(files) || !files.length || files.length > 100) throw new Error('첨부 파일 수를 확인해 주세요.');
  const chunks = [], records = [];
  const names = new Set();
  let offset = 0;
  for (const file of files) {
    if (!file || typeof file.name !== 'string' || !file.name || /[\/\\\u0000-\u001f]/.test(file.name)
        || file.name === '.' || file.name === '..' || names.has(file.name)) throw new Error('첨부 파일 이름을 확인해 주세요.');
    names.add(file.name);
    if (typeof file.data !== 'string' && !(file.data instanceof ArrayBuffer) && !ArrayBuffer.isView(file.data)) throw new Error('첨부 파일 데이터를 확인해 주세요.');
    const name = encoder.encode(file.name);
    const bytes = typeof file.data === 'string' ? encoder.encode(file.data)
      : ArrayBuffer.isView(file.data) ? new Uint8Array(file.data.buffer, file.data.byteOffset, file.data.byteLength) : new Uint8Array(file.data);
    if (name.length > 65535 || offset + bytes.length > 80 * 1024 * 1024) throw new Error('상담 자료 용량이 너무 큽니다.');
    const crc = crc32(bytes);
    const header = new Uint8Array(30 + name.length), view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true); view.setUint16(4, 20, true);
    view.setUint16(6, 0x0800, true); view.setUint16(12, 0x0021, true);
    view.setUint32(14, crc, true); view.setUint32(18, bytes.length, true); view.setUint32(22, bytes.length, true);
    view.setUint16(26, name.length, true); header.set(name, 30);
    chunks.push(header, bytes);
    records.push({ name, bytes, crc, offset });
    offset += header.length + bytes.length;
  }
  const centralOffset = offset;
  for (const record of records) {
    const header = new Uint8Array(46 + record.name.length), view = new DataView(header.buffer);
    view.setUint32(0, 0x02014b50, true); view.setUint16(4, 20, true); view.setUint16(6, 20, true);
    view.setUint16(8, 0x0800, true); view.setUint16(14, 0x0021, true);
    view.setUint32(16, record.crc, true); view.setUint32(20, record.bytes.length, true); view.setUint32(24, record.bytes.length, true);
    view.setUint16(28, record.name.length, true); view.setUint32(42, record.offset, true);
    header.set(record.name, 46); chunks.push(header); offset += header.length;
  }
  const end = new Uint8Array(22), view = new DataView(end.buffer);
  view.setUint32(0, 0x06054b50, true); view.setUint16(8, records.length, true); view.setUint16(10, records.length, true);
  view.setUint32(12, offset - centralOffset, true); view.setUint32(16, centralOffset, true);
  chunks.push(end);
  const result = new Uint8Array(offset + end.length);
  let writeAt = 0;
  for (const chunk of chunks) { result.set(chunk, writeAt); writeAt += chunk.length; }
  return result;
}
export function downloadFile(name, data, type = 'application/octet-stream') {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name;
  try {
    document.body.append(a);
    a.click();
  } finally {
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
