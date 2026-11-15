// Начальное заполнение стенда: справочники, учётные записи веб-приложения и демонстрационные данные из data/*.csv.
// Запуск: node scripts/seed.mjs  (повторный запуск безопасен: совпадающие записи пропускаются).
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from '../lib/env.mjs';
import { call1c, ping1c } from '../lib/onec.mjs';
import { hashPassword } from '../lib/auth.mjs';
import { importCsv } from '../lib/importer.mjs';

const DATA = join(config.root, '..', 'data');

const SOURCES = [
  { code: 'PURCHASE', name: 'Закупка' },
  { code: 'DONATION', name: 'Дар' },
  { code: 'DEMO', name: 'Демонстрационное поступление' },
];
const REASONS = [
  { code: 'LOSS', name: 'Утеря' },
  { code: 'DAMAGE', name: 'Порча' },
  { code: 'OBSOLETE', name: 'Устаревание' },
];

let accounts;
try { accounts = JSON.parse(await readFile(join(DATA, 'demo-accounts.json'), 'utf8')); }
catch { console.error('Нет data/demo-accounts.json: скопируйте demo-accounts.example.json и задайте пароли.'); process.exit(1); }
if (accounts.some((a) => !a.password || a.password === 'задайте-пароль')) { console.error('Задайте пароли в data/demo-accounts.json'); process.exit(1); }
const toAccount = (a) => ({ id: a.login, name: a.name, role: a.role, reader_id: a.reader_id || '', password_hash: hashPassword(a.password) });

console.log('1С:', (await ping1c()).message);

const staff = accounts.filter((a) => a.role !== 'reader');
let r = await call1c('POST', 'setup', { body: { sources: SOURCES, reasons: REASONS, accounts: staff.map(toAccount) } });
console.log(`Справочники и сотрудники: учётных записей ${r.accounts}, источников ${r.sources}, причин ${r.reasons}`);

const actor = staff.find((a) => a.role === 'librarian').login;
for (const kind of ['readers', 'books', 'loans']) {
  const text = await readFile(join(DATA, `${kind}.csv`), 'utf8');
  const res = await importCsv(kind, text, actor);
  console.log(`${kind}.csv: принято ${res.accepted}, дополнено ${res.updated || 0}, пропущено ${res.skipped}, отклонено ${res.rejected}`);
  for (const row of res.rows.filter((x) => x.result === 'rejected')) console.log(`  строка ${row.line} (${row.key}): ${row.message}`);
}

const readers = accounts.filter((a) => a.role === 'reader');
r = await call1c('POST', 'setup', { body: { accounts: readers.map(toAccount) } });
console.log(`Учётные записи читателей: ${r.accounts}`);
for (const e of r.errors || []) console.log('  ' + e);
console.log('Готово. Логины и пароли — в data/demo-accounts.json');
