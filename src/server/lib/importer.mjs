// Импорт CSV (FR-11): Node.js проверяет структуру и формат, 1С — права, ссылки, уникальность и бизнес-правила.
// Повтор идентичной строки пропускается, совпадение ключа с другими данными — конфликт без перезаписи.
import { parseCsv } from './csv.mjs';
import { call1c, OneCError } from './onec.mjs';

export const KINDS = {
  books: {
    key: 'book_code',
    fields: ['book_code', 'title', 'author', 'publication_year', 'udc', 'cost', 'received_date', 'source', 'section', 'publisher', 'isbn', 'pages', 'cover_url', 'annotation'],
    required: ['book_code', 'title', 'author', 'publication_year', 'udc', 'cost', 'received_date', 'source'],
    // Описательные поля можно дополнять повторным импортом: учётные поля при этом не меняются
    meta: ['section', 'publisher', 'isbn', 'pages', 'cover_url', 'annotation'],
    resource: 'books',
  },
  readers: {
    key: 'reader_id',
    fields: ['reader_id', 'full_name', 'group', 'email'],
    required: ['reader_id', 'full_name', 'group'],
    resource: 'readers',
  },
  loans: {
    key: 'loan_id',
    fields: ['loan_id', 'book_code', 'reader_id', 'issue_date', 'due_date', 'return_date'],
    required: ['loan_id', 'book_code', 'reader_id', 'issue_date', 'due_date'],
    resource: 'loans',
  },
};

export const MAX_BYTES = 5 * 1024 * 1024;
export const MAX_ROWS = 10000;

const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z')) && new Date(s + 'T00:00:00Z').toISOString().startsWith(s);
const money = (v) => Number(v).toFixed(2);

function validate(kind, r) {
  const spec = KINDS[kind];
  if (r._extra) return 'Лишние значения в строке';
  for (const f of spec.required) if (!r[f]) return `Не заполнено поле ${f}`;
  if (kind === 'books') {
    if (!/^\d{1,4}$/.test(r.publication_year) || +r.publication_year < 1 || +r.publication_year > new Date().getFullYear()) return 'Некорректный год издания';
    if (!/^\d+(\.\d{1,2})?$/.test(r.cost)) return 'Стоимость — неотрицательное число с точкой, не более двух знаков';
    if (!isDate(r.received_date)) return 'Дата поступления должна быть в формате YYYY-MM-DD';
    if (r.pages && !/^\d{1,5}$/.test(r.pages)) return 'Число страниц — целое число';
    if (r.isbn && !/^[0-9Xx-]{10,17}$/.test(r.isbn)) return 'Некорректный ISBN';
    if (r.cover_url && !/^https:\/\//.test(r.cover_url)) return 'Ссылка на обложку должна начинаться с https://';
  }
  if (kind === 'readers' && r.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.email)) return 'Некорректный e-mail';
  if (kind === 'loans') {
    for (const f of ['issue_date', 'due_date']) if (!isDate(r[f])) return `Поле ${f} должно быть в формате YYYY-MM-DD`;
    if (r.return_date && !isDate(r.return_date)) return 'Поле return_date должно быть в формате YYYY-MM-DD';
    if (r.due_date < r.issue_date) return 'Плановый возврат раньше даты выдачи';
    if (r.return_date && r.return_date < r.issue_date) return 'Возврат раньше даты выдачи';
  }
  return null;
}

function same(kind, r, x) {
  if (kind === 'books') {
    return x.title === r.title && x.author === r.author && String(x.publication_year) === String(+r.publication_year) &&
      x.udc === r.udc && money(x.cost) === money(r.cost) && x.received_date === r.received_date && x.source === r.source;
  }
  if (kind === 'readers') return x.full_name === r.full_name && x.group === r.group && (x.email || '') === (r.email || '');
  return x.book_code === r.book_code && x.reader_id === r.reader_id && x.issue_date === r.issue_date &&
    x.due_date === r.due_date && (x.return_date || '') === (r.return_date || '');
}

function metaDiff(r, x) {
  const d = {};
  for (const f of KINDS.books.meta) {
    if (!(f in r) || r[f] === '') continue;
    const v = f === 'pages' ? +r[f] : r[f];
    if (String(x[f] ?? '') !== String(v)) d[f] = v;
  }
  return d;
}

function payload(kind, r) {
  if (kind === 'books') {
    const p = { ...pick(r, KINDS.books.fields), publication_year: +r.publication_year, cost: money(r.cost), pages: +(r.pages || 0) };
    for (const f of KINDS.books.meta) if (!(f in r)) delete p[f];
    return p;
  }
  if (kind === 'readers') return pick(r, KINDS.readers.fields);
  const p = pick(r, KINDS.loans.fields);
  if (!p.return_date) delete p.return_date;
  return p;
}

function pick(r, fields) {
  const o = {};
  for (const f of fields) o[f] = r[f] ?? '';
  return o;
}

export async function importCsv(kind, text, actor) {
  const spec = KINDS[kind];
  if (!spec) throw new OneCError(404, 'NOT_FOUND', 'Неизвестный тип импорта');
  let parsed;
  try { parsed = parseCsv(text); } catch (e) { throw new OneCError(400, 'BAD_CSV', e.message); }
  const missing = spec.required.filter((f) => !parsed.header.includes(f));
  const unknown = parsed.header.filter((f) => !spec.fields.includes(f));
  if (missing.length || unknown.length) {
    throw new OneCError(400, 'BAD_HEADER', `Заголовок не соответствует формату ${kind}.csv: ${[...missing.map((f) => 'нет ' + f), ...unknown.map((f) => 'лишнее ' + f)].join(', ')}`);
  }
  if (parsed.records.length > MAX_ROWS) throw new OneCError(400, 'TOO_MANY_ROWS', `Не более ${MAX_ROWS} строк в файле`);

  const rows = [];
  const seen = new Set();
  for (const r of parsed.records) {
    const key = r[spec.key];
    const res = { line: r._line, key, result: 'accepted', message: '' };
    const err = validate(kind, r) || (seen.has(key) ? 'Ключ повторяется в файле' : null);
    seen.add(key);
    if (err) { Object.assign(res, { result: 'rejected', message: err }); rows.push(res); continue; }
    try {
      let existing = null;
      try { existing = await call1c('GET', spec.resource, { query: { id: key }, actor }); } catch (e) { if (e.status !== 404) throw e; }
      if (existing) {
        const diff = kind === 'books' && same(kind, r, existing) ? metaDiff(r, existing) : {};
        if (Object.keys(diff).length) {
          await call1c('PATCH', spec.resource, { query: { id: key }, body: diff, actor });
          Object.assign(res, { result: 'updated', message: 'Дополнено описание: ' + Object.keys(diff).join(', ') });
        } else if (same(kind, r, existing)) Object.assign(res, { result: 'skipped', message: 'Запись уже есть, данные совпадают' });
        else Object.assign(res, { result: 'rejected', message: 'Конфликт: запись с этим ключом уже есть с другими данными' });
      } else {
        await call1c('POST', spec.resource, { body: payload(kind, r), actor });
      }
    } catch (e) {
      if (e.status === 503) throw e;
      Object.assign(res, { result: 'rejected', message: e.message });
    }
    rows.push(res);
  }
  const count = (k) => rows.filter((x) => x.result === k).length;
  return { kind, total: rows.length, accepted: count('accepted'), updated: count('updated'), skipped: count('skipped'), rejected: count('rejected'), rows };
}
