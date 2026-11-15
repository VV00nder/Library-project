// Публичный каталог: экземпляры из 1С группируются в издания (по ISBN, иначе по названию, автору и году).
import { createHash } from 'node:crypto';
import { call1c } from './onec.mjs';

// Раздел по УДК, если в карточке он не указан.
const UDC_SECTIONS = [
  [/^82/, 'Художественная литература'],
  [/^004/, 'Информатика и программирование'],
  [/^005/, 'Менеджмент и управление проектами'],
  [/^51/, 'Математика'],
  [/^53/, 'Физика'],
  [/^33/, 'Экономика'],
  [/^81/, 'Языки и лингвистика'],
  [/^9/, 'История'],
  [/^1(\D|$)/, 'Философия'],
];
export function sectionOf(book) {
  if (book.section) return book.section;
  const hit = UDC_SECTIONS.find(([re]) => re.test(book.udc || ''));
  return hit ? hit[1] : 'Другое';
}

export function editionKey(b) {
  const isbn = (b.isbn || '').replace(/[^0-9Xx]/g, '');
  if (isbn) return 'isbn-' + isbn;
  return 'e-' + createHash('sha1').update(`${b.title}|${b.author}|${b.publication_year}`).digest('hex').slice(0, 12);
}

let cache = { at: 0, data: null };

export async function publicCatalog({ fresh = false } = {}) {
  if (!fresh && cache.data && Date.now() - cache.at < 15000) return cache.data;
  const { items } = await call1c('GET', 'public-catalog');
  const map = new Map();
  for (const b of items) {
    const key = editionKey(b);
    let e = map.get(key);
    if (!e) {
      e = { key, title: b.title, author: b.author, year: b.publication_year, udc: b.udc, section: sectionOf(b), publisher: '', isbn: '', pages: 0, annotation: '', cover_url: '', copies: 0, available: 0, received_date: '', loans_count: 0, codes: [], available_codes: [] };
      map.set(key, e);
    }
    for (const [f, src] of [['publisher', 'publisher'], ['isbn', 'isbn'], ['annotation', 'annotation'], ['cover_url', 'cover_url']]) if (!e[f] && b[src]) e[f] = b[src];
    if (!e.pages && b.pages) e.pages = b.pages;
    e.copies += 1;
    e.loans_count += Number(b.loans_count || 0);
    if ((b.received_date || '') > e.received_date) e.received_date = b.received_date;
    e.codes.push(b.book_code);
    if (b.status === 'Доступен') { e.available += 1; e.available_codes.push(b.book_code); }
  }
  const editions = [...map.values()].sort((a, b) => a.title.localeCompare(b.title, 'ru'));
  cache = { at: Date.now(), data: editions };
  return editions;
}

// Для посетителя скрываем внутренние коды экземпляров.
export const publicView = ({ codes, available_codes, ...e }) => e;
