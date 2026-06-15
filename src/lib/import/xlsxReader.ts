import type { SheetMatrices } from './parseWorkbook';

/**
 * 零依賴 .xlsx 讀取器（瀏覽器端）。
 *
 * .xlsx 其實是一個 ZIP，內含 XML。這裡用瀏覽器內建能力直接拆解：
 *   - ZIP：手解中央目錄 + DecompressionStream('deflate-raw') 解壓。
 *   - XML：DOMParser。
 *
 * 產出 { sheetName: string[][] }（列 × 欄的字串矩陣）餵給 parseWorkbook。
 * 僅支援 store(0) 與 deflate(8) 兩種壓縮（標準匯出工具都是這兩種）。
 */

const SIG_EOCD = 0x06054b50;
const SIG_CDIR = 0x02014b50;

/** Top-level: ArrayBuffer of a .xlsx → per-sheet string matrices. */
export async function readXlsxMatrices(buf: ArrayBuffer): Promise<SheetMatrices> {
  const files = await unzip(buf);
  const dec = new TextDecoder('utf-8');
  const xml = (path: string): Document | null => {
    const bytes = files.get(path);
    if (!bytes) return null;
    return new DOMParser().parseFromString(dec.decode(bytes), 'application/xml');
  };

  // shared strings
  const shared: string[] = [];
  const ssDoc = xml('xl/sharedStrings.xml');
  if (ssDoc) {
    for (const si of Array.from(ssDoc.getElementsByTagName('si'))) {
      shared.push(textOf(si));
    }
  }

  // sheet name → relationship id, and rel id → target path
  const wbDoc = xml('xl/workbook.xml');
  const relDoc = xml('xl/_rels/workbook.xml.rels');
  if (!wbDoc || !relDoc) throw new Error('不是有效的 .xlsx（缺少 workbook 結構）');

  const relTarget = new Map<string, string>();
  for (const rel of Array.from(relDoc.getElementsByTagName('Relationship'))) {
    const id = rel.getAttribute('Id');
    const target = rel.getAttribute('Target');
    if (id && target) relTarget.set(id, target);
  }

  const out: SheetMatrices = {};
  for (const sheetEl of Array.from(wbDoc.getElementsByTagName('sheet'))) {
    const name = sheetEl.getAttribute('name');
    const rid =
      sheetEl.getAttribute('r:id') ??
      sheetEl.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    if (!name || !rid) continue;
    const target = relTarget.get(rid);
    if (!target) continue;
    const path = normalizeTarget(target);
    const sheetDoc = files.has(path) ? xml(path) : (files.has(target) ? xml(target) : null);
    if (sheetDoc) out[name] = parseSheet(sheetDoc, shared);
  }

  if (Object.keys(out).length === 0) throw new Error('讀不到任何工作表，請確認檔案為 .xlsx 格式。');
  return out;
}

/* --------------------------------- XML ----------------------------------- */

/** Concatenate every <t> descendant (handles rich-text runs in shared strings). */
function textOf(el: Element): string {
  const ts = el.getElementsByTagName('t');
  if (ts.length === 0) return el.textContent ?? '';
  let s = '';
  for (const t of Array.from(ts)) s += t.textContent ?? '';
  return s;
}

function parseSheet(doc: Document, shared: string[]): string[][] {
  const rowsOut: string[][] = [];
  const rowEls = Array.from(doc.getElementsByTagName('row'));
  for (const rowEl of rowEls) {
    const rIdx = parseInt(rowEl.getAttribute('r') ?? '0', 10) - 1;
    const cells: string[] = [];
    for (const c of Array.from(rowEl.getElementsByTagName('c'))) {
      const col = colFromRef(c.getAttribute('r') ?? '');
      const t = c.getAttribute('t');
      let val = '';
      if (t === 's') {
        const vEl = c.getElementsByTagName('v')[0];
        const i = parseInt(vEl?.textContent ?? '-1', 10);
        val = shared[i] ?? '';
      } else if (t === 'inlineStr') {
        const isEl = c.getElementsByTagName('is')[0];
        val = isEl ? textOf(isEl) : '';
      } else if (t === 'str') {
        val = c.getElementsByTagName('v')[0]?.textContent ?? '';
      } else if (t === 'b') {
        val = c.getElementsByTagName('v')[0]?.textContent === '1' ? 'TRUE' : 'FALSE';
      } else {
        val = c.getElementsByTagName('v')[0]?.textContent ?? '';
      }
      if (col >= 0) cells[col] = val;
    }
    for (let i = 0; i < cells.length; i++) if (cells[i] === undefined) cells[i] = '';
    if (rIdx >= 0) rowsOut[rIdx] = cells;
  }
  for (let i = 0; i < rowsOut.length; i++) if (rowsOut[i] === undefined) rowsOut[i] = [];
  return rowsOut;
}

/** "B7" → 1 (0-based column index). */
function colFromRef(ref: string): number {
  const mt = ref.match(/^([A-Z]+)/);
  if (!mt) return -1;
  let n = 0;
  for (const ch of mt[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function normalizeTarget(target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  return 'xl/' + target.replace(/^\.\//, '');
}

/* --------------------------------- ZIP ----------------------------------- */

async function unzip(buf: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const dv = new DataView(buf);
  const u8 = new Uint8Array(buf);
  const eocd = findEOCD(dv);
  const cdCount = dv.getUint16(eocd + 10, true);
  const cdOffset = dv.getUint32(eocd + 16, true);

  const files = new Map<string, Uint8Array>();
  const nameDec = new TextDecoder('utf-8');
  let p = cdOffset;
  for (let i = 0; i < cdCount; i++) {
    if (dv.getUint32(p, true) !== SIG_CDIR) break;
    const method = dv.getUint16(p + 10, true);
    const compSize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const localOff = dv.getUint32(p + 42, true);
    const name = nameDec.decode(u8.subarray(p + 46, p + 46 + nameLen));

    // local header → real data offset (its name/extra lengths can differ from CD)
    const lhNameLen = dv.getUint16(localOff + 26, true);
    const lhExtraLen = dv.getUint16(localOff + 28, true);
    const dataStart = localOff + 30 + lhNameLen + lhExtraLen;
    const comp = u8.subarray(dataStart, dataStart + compSize);

    let data: Uint8Array;
    if (method === 0) data = comp.slice();
    else if (method === 8) data = await inflateRaw(comp);
    else throw new Error(`不支援的壓縮方式 (${method})，請以標準工具另存為 .xlsx。`);

    files.set(name, data);
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

function findEOCD(dv: DataView): number {
  const len = dv.byteLength;
  const min = Math.max(0, len - 22 - 0xffff);
  for (let i = len - 22; i >= min; i--) {
    if (dv.getUint32(i, true) === SIG_EOCD) return i;
  }
  throw new Error('找不到 ZIP 結尾（檔案可能不是 .xlsx 或已損毀）。');
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  // Copy into a fresh ArrayBuffer so we never hand a subarray view to Response.
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Response(data.slice()).body!.pipeThrough(ds);
  const ab = await new Response(stream).arrayBuffer();
  return new Uint8Array(ab);
}
