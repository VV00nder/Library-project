// CSV по контракту ТЗ (ПР-04): UTF-8 (BOM допустим), разделитель «;», первая строка — имена полей.

export function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === ';') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((v) => v !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  if (quoted) throw new Error('Незакрытая кавычка в файле');
  row.push(field);
  if (row.some((v) => v !== '')) rows.push(row);
  if (!rows.length) return { header: [], records: [] };
  const header = rows[0].map((h) => h.trim());
  const records = rows.slice(1).map((r, idx) => {
    const obj = { _line: idx + 2 };
    header.forEach((h, j) => { obj[h] = (r[j] ?? '').trim(); });
    obj._extra = r.length > header.length;
    return obj;
  });
  return { header, records };
}

function cell(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(columns, items) {
  const lines = [columns.map((c) => cell(c.title)).join(';')];
  for (const it of items) lines.push(columns.map((c) => cell(it[c.key])).join(';'));
  return '﻿' + lines.join('\r\n') + '\r\n';
}
