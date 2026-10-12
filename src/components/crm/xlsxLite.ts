// Tiny .xlsx reader / writer with no dependency (the project has no spreadsheet library).
// Reads: zip central directory + DecompressionStream('deflate-raw') + DOMParser. Writes: a "stored" zip with inline strings.
// Cells are returned as text; numbers keep their raw text (dates arrive as Excel serial numbers: see normDate in importEngine).

export interface SheetData { name: string; rows: string[][] }

const MAX_ENTRY_BYTES = 120 * 1024 * 1024; // zip-bomb guard

const u16 = (v: DataView, o: number) => v.getUint16(o, true);
const u32 = (v: DataView, o: number) => v.getUint32(o, true);
const dec = new TextDecoder('utf-8');

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

interface ZipEntry { name: string; method: number; comp: number; size: number; offset: number }

function listZip(buf: ArrayBuffer): Map<string, ZipEntry> {
  const v = new DataView(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 66000); i--) {
    if (u32(v, i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('This is not a valid .xlsx file.');
  const count = u16(v, eocd + 10);
  let p = u32(v, eocd + 16);
  const out = new Map<string, ZipEntry>();
  for (let n = 0; n < count; n++) {
    if (p + 46 > buf.byteLength || u32(v, p) !== 0x02014b50) break;
    const method = u16(v, p + 10), comp = u32(v, p + 20), size = u32(v, p + 24);
    const nl = u16(v, p + 28), el = u16(v, p + 30), cl = u16(v, p + 32), off = u32(v, p + 42);
    const name = dec.decode(new Uint8Array(buf, p + 46, nl));
    out.set(name, { name, method, comp, size, offset: off });
    p += 46 + nl + el + cl;
  }
  return out;
}

async function readEntry(buf: ArrayBuffer, e: ZipEntry): Promise<string> {
  if (e.size > MAX_ENTRY_BYTES) throw new Error('The workbook is too large to read.');
  const v = new DataView(buf);
  if (u32(v, e.offset) !== 0x04034b50) throw new Error('This is not a valid .xlsx file.');
  const start = e.offset + 30 + u16(v, e.offset + 26) + u16(v, e.offset + 28);
  const raw = new Uint8Array(buf, start, e.comp);
  if (e.method === 0) return dec.decode(raw);
  if (e.method === 8) return dec.decode(await inflateRaw(raw));
  throw new Error('Unsupported compression in the workbook.');
}

const NS = '*';
const colIndex = (ref: string): number => {
  let n = 0;
  for (let i = 0; i < ref.length; i++) {
    const c = ref.charCodeAt(i);
    if (c < 65 || c > 90) break;
    n = n * 26 + (c - 64);
  }
  return n - 1;
};
const tText = (el: Element): string => {
  let s = '';
  for (const t of Array.from(el.getElementsByTagNameNS(NS, 't'))) {
    if (t.parentElement && t.parentElement.localName === 'rPh') continue; // phonetic hints
    s += t.textContent || '';
  }
  return s;
};
const parseXml = (s: string) => new DOMParser().parseFromString(s, 'application/xml');

/** Returns the sheet called `prefer` (case-insensitive) or the first sheet. */
export async function readXlsx(buf: ArrayBuffer, prefer = 'Leads'): Promise<SheetData> {
  const zip = listZip(buf);
  const get = async (n: string) => { const e = zip.get(n); return e ? readEntry(buf, e) : ''; };

  const wb = parseXml(await get('xl/workbook.xml'));
  const sheets = Array.from(wb.getElementsByTagNameNS(NS, 'sheet')).map((s) => {
    let rid = '';
    for (const a of Array.from(s.attributes)) if (a.localName === 'id') rid = a.value;
    return { name: s.getAttribute('name') || '', rid };
  });
  if (!sheets.length) throw new Error('The workbook has no sheets.');
  const pick = sheets.find((s) => s.name.toLowerCase() === prefer.toLowerCase()) || sheets[0];

  const rels = parseXml(await get('xl/_rels/workbook.xml.rels'));
  let target = '';
  for (const r of Array.from(rels.getElementsByTagNameNS(NS, 'Relationship'))) {
    if (r.getAttribute('Id') === pick.rid) target = r.getAttribute('Target') || '';
  }
  if (!target) target = 'worksheets/sheet1.xml';
  const path = target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '');
  const sheetXml = await get(path);
  if (!sheetXml) throw new Error('The sheet could not be found in the workbook.');

  const ss: string[] = [];
  const ssXml = await get('xl/sharedStrings.xml');
  if (ssXml) for (const si of Array.from(parseXml(ssXml).getElementsByTagNameNS(NS, 'si'))) ss.push(tText(si));

  const doc = parseXml(sheetXml);
  const rows: string[][] = [];
  for (const row of Array.from(doc.getElementsByTagNameNS(NS, 'row'))) {
    const ri = Number(row.getAttribute('r')) - 1;
    const cells: string[] = [];
    let seq = 0;
    for (const c of Array.from(row.children)) {
      if (c.localName !== 'c') continue;
      const ref = c.getAttribute('r') || '';
      const ci = ref ? colIndex(ref) : seq;
      seq = ci + 1;
      const t = c.getAttribute('t');
      let val = '';
      if (t === 'inlineStr') val = tText(c);
      else {
        const ve = c.getElementsByTagNameNS(NS, 'v')[0];
        const raw = ve?.textContent ?? '';
        if (t === 's') val = ss[Number(raw)] ?? '';
        else if (t === 'b') val = raw === '1' ? 'TRUE' : 'FALSE';
        else if (t === 'str' || t === 'e') val = raw;
        else val = /e/i.test(raw) && isFinite(Number(raw)) ? String(Number(raw)) : raw;
      }
      cells[ci] = val;
    }
    const at = Number.isFinite(ri) && ri >= 0 ? ri : rows.length;
    while (rows.length < at) rows.push([]);
    rows[at] = Array.from(cells, (x) => x ?? '');
  }
  return { name: pick.name, rows };
}

// ---------------------------------------------------------------------------------------------
// writer
// ---------------------------------------------------------------------------------------------
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
const crc32 = (d: Uint8Array) => { let c = 0xffffffff; for (let i = 0; i < d.length; i++) c = CRC[(c ^ d[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

function zipStore(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, f.data.length, true); lh.setUint32(22, f.data.length, true); lh.setUint16(26, name.length, true);
    parts.push(new Uint8Array(lh.buffer), name, f.data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
    ch.setUint32(16, crc, true); ch.setUint32(20, f.data.length, true); ch.setUint32(24, f.data.length, true);
    ch.setUint16(28, name.length, true); ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), name);
    offset += 30 + name.length + f.data.length;
  }
  const cdSize = central.reduce((s, p) => s + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((s, p) => s + p.length, 0));
  let o = 0; for (const p of all) { out.set(p, o); o += p.length; }
  return out;
}

const xmlEsc = (s: string) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const colName = (i: number) => { let s = ''; for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };

/** Text that a spreadsheet could read as a formula is prefixed with an apostrophe (phone numbers like +2010… stay as they are). */
export function safeCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  if (/^[=@\t\r]/.test(s)) return "'" + s;
  if (/^[+-]/.test(s) && !/^[+-]?[\d\s().-]+$/.test(s)) return "'" + s;
  return s;
}

export interface OutSheet { name: string; rows: (string | number | null | undefined)[][]; widths?: number[] }

export function buildXlsx(sheets: OutSheet[]): Blob {
  const enc = new TextEncoder();
  const sheetXml = (sh: OutSheet) => {
    let x = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>';
    if (sh.widths) x += '<cols>' + sh.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('') + '</cols>';
    x += '<sheetData>';
    sh.rows.forEach((r, ri) => {
      x += `<row r="${ri + 1}">`;
      r.forEach((v, ci) => {
        if (v === null || v === undefined || v === '') return;
        const ref = colName(ci) + (ri + 1);
        const st = ri === 0 ? ' s="1"' : '';
        if (typeof v === 'number' && Number.isFinite(v)) x += `<c r="${ref}"${st}><v>${v}</v></c>`;
        else x += `<c r="${ref}"${st} t="inlineStr"><is><t xml:space="preserve">${xmlEsc(safeCell(v))}</t></is></c>`;
      });
      x += '</row>';
    });
    return x + '</sheetData></worksheet>';
  };
  const files: { name: string; data: Uint8Array }[] = [];
  const add = (name: string, text: string) => files.push({ name, data: enc.encode(text) });
  add('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' + sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') + '</Types>');
  add('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
  add('xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' + sheets.map((s, i) => `<sheet name="${xmlEsc(s.name.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets></workbook>');
  add('xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') + `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  add('xl/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>');
  sheets.forEach((s, i) => add(`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s)));
  return new Blob([zipStore(files) as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
