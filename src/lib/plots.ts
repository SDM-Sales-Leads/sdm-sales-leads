export function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'; // escaped quote ("")
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

// Returns the URL only when it is http(s); otherwise '' (blocks javascript:, data: ... in hrefs).
export function safeHttpUrl(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const withProto = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : 'https://' + raw;
  try {
    const u = new URL(withProto);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : '';
  } catch {
    return '';
  }
}

// Safe CSV cell for export: always quoted, quotes doubled, and cells that a spreadsheet
// would treat as a formula (= + - @, tab, CR) are prefixed with ' (CSV/Excel injection).
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}

export function parseCSV(csvText: string): any[] {
  csvText = csvText.replace(/^\uFEFF/, '');
  const lines: string[] = [];
  let currentLine = '';
  let inQuotes = false;
  
  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    if (char === '"') {
      inQuotes = !inQuotes;
      currentLine += char;
    } else if (char === '\n' && !inQuotes) {
      lines.push(currentLine);
      currentLine = '';
    } else if (char === '\r' && !inQuotes) {
    } else {
      currentLine += char;
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }

  if (lines.length === 0) return [];

  const headers = parseCSVLine(lines[0]).map(h => h.trim());
  const UNSAFE_KEYS = ['__proto__', 'constructor', 'prototype'];
  const result: any[] = [];

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const values = parseCSVLine(lines[i]);
    const obj: any = Object.create(null);
    headers.forEach((header, index) => {
      if (!header || UNSAFE_KEYS.includes(header)) return;
      obj[header] = values[index] ? values[index].trim() : '';
    });
    result.push(obj);
  }
  return result;
}
