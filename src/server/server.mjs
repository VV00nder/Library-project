// Сервер приложения «Библиус»: единый API для React, авторизация, CSV, обращение к HTTP-сервисам 1С.
// Запуск: node server.mjs (Node.js 20+; внешние пакеты не нужны).
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from './lib/env.mjs';
import { call1c, ping1c, OneCError } from './lib/onec.mjs';
import { verifyPassword, createSession, sessionCookie, clearCookie, getSession, dropSession, ROLE_FROM_1C } from './lib/auth.mjs';
import { importCsv, MAX_BYTES } from './lib/importer.mjs';
import { toCsv } from './lib/csv.mjs';
import { publicCatalog, publicView } from './lib/catalog.mjs';
import { hashPassword } from './lib/auth.mjs';
import { sendMail, mailMode, outboxList } from './lib/mailer.mjs';
import { runNotifications, scheduleNotifications, REMIND_DAYS, lastRun } from './lib/notifier.mjs';
import { randomInt } from 'node:crypto';

const WEB = join(config.root, '..', 'web', 'dist');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };

class HttpError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

function send(res, status, data, headers = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}

async function readBody(req, limit = 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw new HttpError(413, 'TOO_LARGE', `Размер запроса больше ${Math.round(limit / 1024 / 1024)} МБ`);
    chunks.push(c);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function readJson(req) {
  if (!(req.headers['content-type'] || '').includes('application/json')) throw new HttpError(415, 'BAD_CONTENT_TYPE', 'Ожидается JSON');
  const text = await readBody(req);
  try { return text ? JSON.parse(text) : {}; } catch { throw new HttpError(400, 'BAD_JSON', 'Некорректный JSON'); }
}

function need(session, ...roles) {
  if (!session) throw new HttpError(401, 'UNAUTHORIZED', 'Войдите в систему');
  if (roles.length && !roles.includes(session.role)) throw new HttpError(403, 'FORBIDDEN', 'Недостаточно прав');
}

// Пагинация списков (ТЗ 7.2): ?page=1&per_page=50; без page отдаётся весь список
function paginate(data, url) {
  const page = Number(url.searchParams.get('page') || 0);
  if (!page || !data || !Array.isArray(data.items)) return data;
  const per = Math.min(200, Math.max(1, Number(url.searchParams.get('per_page') || 50)));
  const total = data.items.length;
  return { ...data, items: data.items.slice((page - 1) * per, page * per), total, page, per_page: per, pages: Math.max(1, Math.ceil(total / per)) };
}

const today = () => {
  const d = new Date(Date.now() + 3 * 3600_000); // Europe/Moscow
  return d.toISOString().slice(0, 10);
};

const OVERDUE_COLUMNS = [
  { key: 'reader_id', title: 'reader_id' }, { key: 'full_name', title: 'full_name' }, { key: 'group', title: 'group' },
  { key: 'book_code', title: 'book_code' }, { key: 'title', title: 'title' }, { key: 'author', title: 'author' },
  { key: 'udc', title: 'udc' }, { key: 'issue_date', title: 'issue_date' }, { key: 'due_date', title: 'due_date' },
  { key: 'days_overdue', title: 'days_overdue' }, { key: 'report_date', title: 'report_date' },
];
const REPORT_FILTERS = ['date', 'from', 'to', 'group', 'author', 'udc', 'min_days', 'max_days'];

// ---------------- маршруты API ----------------
const routes = [];
const route = (method, pattern, handler) => routes.push({ method, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), handler });

route('GET', '/api/health', async () => {
  try { const p = await ping1c(); return { ok: true, onec: p }; } catch (e) { return { ok: false, message: e.message }; }
});

route('POST', '/api/auth/login', async ({ req, res }) => {
  const { login, password } = await readJson(req);
  if (typeof login !== 'string' || typeof password !== 'string' || !login || !password) throw new HttpError(400, 'BAD_DATA', 'Введите логин и пароль');
  let acc;
  try { acc = await call1c('GET', 'account', { query: { login } }); } catch (e) {
    if (e.status === 401 || e.status === 404) throw new HttpError(401, 'UNAUTHORIZED', 'Неверный логин или пароль');
    throw e;
  }
  if (!verifyPassword(password, acc.password_hash)) throw new HttpError(401, 'UNAUTHORIZED', 'Неверный логин или пароль');
  const role = ROLE_FROM_1C[acc.role] || 'reader';
  if (role === 'accountant') throw new HttpError(403, 'FORBIDDEN', 'Бухгалтер работает в клиенте 1С');
  const user = { login: acc.id, role, reader_id: acc.reader_id || null };
  return { reply: true, status: 200, data: user, headers: { 'Set-Cookie': sessionCookie(createSession(user)) } };
});

route('POST', '/api/auth/logout', async ({ req }) => {
  dropSession(req);
  return { reply: true, status: 200, data: { ok: true }, headers: { 'Set-Cookie': clearCookie() } };
});

route('GET', '/api/auth/me', async ({ session }) => {
  need(session);
  const me = { login: session.login, role: session.role, reader_id: session.reader_id };
  if (session.role === 'reader' && session.reader_id) {
    try { const r = await call1c('GET', 'link', { query: { reader_id: session.reader_id } }); me.full_name = r.full_name; me.email_masked = maskEmail(r.email); } catch { /* сведения необязательны */ }
  }
  return me;
});

// ----- Регистрация и привязка читательского билета (ЗИ-05) -----
const maskEmail = (e) => (e ? e.replace(/^(.)(.*)(@.*)$/, (_, a, b, c) => a + '*'.repeat(Math.max(1, b.length)) + c) : '');
const attempts = new Map(); // защита от перебора: не больше 10 попыток с одного адреса за 10 минут
function limit(req, key) {
  const k = `${key}:${req.socket.remoteAddress}`;
  const now = Date.now();
  const list = (attempts.get(k) || []).filter((t) => now - t < 600_000);
  if (list.length >= 10) throw new HttpError(429, 'TOO_MANY', 'Слишком много попыток, повторите через 10 минут');
  list.push(now); attempts.set(k, list);
}

route('POST', '/api/auth/register', async ({ req }) => {
  limit(req, 'register');
  const { login, password, name } = await readJson(req);
  if (typeof login !== 'string' || !/^[A-Za-z0-9._-]{3,40}$/.test(login)) throw new HttpError(400, 'BAD_DATA', 'Логин: от 3 до 40 латинских букв, цифр, точек, дефисов или подчёркиваний');
  if (typeof password !== 'string' || password.length < 8) throw new HttpError(400, 'BAD_DATA', 'Пароль должен быть не короче 8 символов');
  const acc = await call1c('POST', 'register', { body: { id: login, name: String(name || login).slice(0, 200), password_hash: hashPassword(password) } });
  const user = { login: acc.id, role: 'reader', reader_id: null };
  return { reply: true, status: 200, data: user, headers: { 'Set-Cookie': sessionCookie(createSession(user)) } };
});

const linkCodes = new Map(); // login → { reader_id, code, expires, tries }
route('POST', '/api/me/link/start', async ({ session, req }) => {
  need(session, 'reader');
  limit(req, 'link');
  if (session.reader_id) throw new HttpError(409, 'CONFLICT', 'Читательский билет уже привязан');
  const { reader_id } = await readJson(req);
  const info = await call1c('GET', 'link', { query: { reader_id: String(reader_id || '').trim() } });
  if (info.linked) throw new HttpError(409, 'CONFLICT', 'Этот билет уже привязан к другой учётной записи. Обратитесь в библиотеку.');
  if (!info.email) throw new HttpError(409, 'NO_EMAIL', 'В карточке читателя нет e-mail. Обратитесь в библиотеку, чтобы его добавили.');
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  linkCodes.set(session.login, { reader_id: info.reader_id, code, expires: Date.now() + 600_000, tries: 0 });
  const r = await sendMail({ to: info.email, subject: 'Код подтверждения читательского билета', text: `Здравствуйте!\n\nКод для привязки читательского билета ${info.reader_id} к учётной записи ${session.login}: ${code}\n\nКод действует 10 минут. Если вы не запрашивали код, просто удалите это письмо.\n\nБиблиотека РТУ МИРЭА` });
  return { sent_to: maskEmail(info.email), mode: r.mode };
});
route('POST', '/api/me/link/confirm', async ({ session, req }) => {
  need(session, 'reader');
  const { code } = await readJson(req);
  const c = linkCodes.get(session.login);
  if (!c || c.expires < Date.now()) throw new HttpError(400, 'CODE_EXPIRED', 'Код устарел. Запросите новый.');
  c.tries += 1;
  if (c.tries > 5) { linkCodes.delete(session.login); throw new HttpError(400, 'CODE_EXPIRED', 'Слишком много попыток. Запросите новый код.'); }
  if (String(code || '').trim() !== c.code) throw new HttpError(400, 'BAD_CODE', 'Неверный код');
  await call1c('POST', 'link', { body: { account: session.login, reader_id: c.reader_id } });
  linkCodes.delete(session.login);
  session.reader_id = c.reader_id;
  return { login: session.login, role: 'reader', reader_id: c.reader_id };
});

// ----- FR-19 и FR-20 для рабочего места -----
route('GET', '/api/reports/overdue/stats', async ({ session, url }) => {
  need(session, 'librarian');
  const q = {};
  for (const k of [...REPORT_FILTERS, 'top']) { const v = url.searchParams.get(k); if (v) q[k] = v; }
  return call1c('GET', 'overdue-stats', { query: q, actor: session.login });
});
route('GET', '/api/notifications', async ({ session }) => {
  need(session, 'librarian');
  const log = await call1c('GET', 'notifications', { actor: session.login });
  log.items.sort((a, b) => String(b.time).localeCompare(String(a.time)));
  return { ...log, mode: mailMode(), remind_days: REMIND_DAYS, last_run: lastRun, outbox: mailMode() === 'outbox' ? await outboxList() : [] };
});
route('POST', '/api/notifications/run', async ({ session }) => { need(session, 'librarian'); return runNotifications(); });

// Каталог (FR-01). Читатель видит каталог без изменений.
route('GET', '/api/books', async ({ session, url }) => { need(session, 'librarian', 'reader'); return paginate(await call1c('GET', 'books', { actor: session.login }), url); });
route('GET', '/api/books/:code', async ({ session, p }) => { need(session, 'librarian', 'reader'); return call1c('GET', 'books', { query: { id: p.code }, actor: session.login }); });
route('POST', '/api/books', async ({ session, req }) => {
  need(session, 'librarian');
  const b = await readJson(req);
  return call1c('POST', 'books', { body: { ...b, publication_year: Number(b.publication_year), pages: Number(b.pages || 0), cost: Number(b.cost).toFixed(2) }, actor: session.login });
});
route('PATCH', '/api/books/:code', async ({ session, req, p }) => {
  need(session, 'librarian');
  const b = await readJson(req);
  if ('publication_year' in b) b.publication_year = Number(b.publication_year);
  if ('pages' in b) b.pages = Number(b.pages || 0);
  return call1c('PATCH', 'books', { query: { id: p.code }, body: b, actor: session.login });
});
route('DELETE', '/api/books/:code', async ({ session, p }) => { need(session, 'librarian'); return call1c('DELETE', 'books', { query: { id: p.code }, actor: session.login }); });

// Публичный каталог для посетителей сайта (без входа)
route('GET', '/api/public/catalog', async ({ url }) => {
  const items = (await publicCatalog()).map(publicView);
  return paginate({ items, total: items.length }, url);
});
route('GET', '/api/public/catalog/:key', async ({ p }) => {
  const e = (await publicCatalog()).find((x) => x.key === p.key);
  if (!e) throw new HttpError(404, 'NOT_FOUND', 'Книга не найдена');
  return publicView(e);
});

// Заявки «Взять почитать»: читатель оставляет, библиотекарь выдаёт по заявке или отклоняет (ЗИ-04)
route('GET', '/api/requests', async ({ session, url }) => {
  need(session, 'librarian', 'reader');
  return call1c('GET', 'requests', { query: { status: url.searchParams.get('status') }, actor: session.login });
});
route('POST', '/api/requests', async ({ session, req }) => {
  need(session, 'reader');
  if (!session.reader_id) throw new HttpError(409, 'NOT_LINKED', 'Чтобы брать книги, привяжите читательский билет в разделе «Мои книги»');
  const { edition_key } = await readJson(req);
  const e = (await publicCatalog({ fresh: true })).find((x) => x.key === edition_key);
  if (!e) throw new HttpError(404, 'NOT_FOUND', 'Книга не найдена');
  const id = `Z-${today().replace(/-/g, '')}-${randomUUID().slice(0, 6).toUpperCase()}`;
  return call1c('POST', 'requests', { body: { request_id: id, edition_key: e.key, title: e.title, author: e.author }, actor: session.login });
});
route('POST', '/api/requests/:id/cancel', async ({ session, p }) => {
  need(session, 'reader');
  return call1c('POST', 'requests', { query: { id: p.id, action: 'cancel' }, body: {}, actor: session.login });
});
route('POST', '/api/requests/:id/reject', async ({ session, req, p }) => {
  need(session, 'librarian');
  const b = await readJson(req);
  return call1c('POST', 'requests', { query: { id: p.id, action: 'reject' }, body: { comment: String(b.comment || '') }, actor: session.login });
});
route('POST', '/api/requests/:id/issue', async ({ session, req, p }) => {
  need(session, 'librarian');
  const b = await readJson(req);
  const r = await call1c('GET', 'requests', { actor: session.login });
  const z = r.items.find((x) => x.request_id === p.id);
  if (!z) throw new HttpError(404, 'NOT_FOUND', 'Заявка не найдена');
  if (z.status !== 'Новая') throw new HttpError(409, 'CONFLICT', 'Заявка уже обработана');
  const e = (await publicCatalog({ fresh: true })).find((x) => x.key === z.edition_key);
  const bookCode = b.book_code || e?.available_codes[0];
  if (!bookCode) throw new HttpError(409, 'CONFLICT', 'Свободных экземпляров этой книги сейчас нет');
  const loanId = `L-${today().replace(/-/g, '')}-${randomUUID().slice(0, 6).toUpperCase()}`;
  const loan = await call1c('POST', 'loans', { body: { loan_id: loanId, book_code: bookCode, reader_id: z.reader_id, issue_date: today(), due_date: b.due_date }, actor: session.login });
  const done = await call1c('POST', 'requests', { query: { id: p.id, action: 'done' }, body: { loan_id: loan.loan_id }, actor: session.login });
  return { request: done, loan };
});

// Читатели (FR-02)
route('GET', '/api/readers', async ({ session, url }) => { need(session, 'librarian'); return paginate(await call1c('GET', 'readers', { actor: session.login }), url); });
route('GET', '/api/readers/:id', async ({ session, p }) => { need(session, 'librarian'); return call1c('GET', 'readers', { query: { id: p.id }, actor: session.login }); });
route('POST', '/api/readers', async ({ session, req }) => {
  need(session, 'librarian');
  const b = await readJson(req);
  return call1c('POST', 'readers', { body: { reader_id: String(b.reader_id || ''), full_name: String(b.full_name || ''), group: String(b.group || ''), email: String(b.email || '') }, actor: session.login });
});
route('PATCH', '/api/readers/:id', async ({ session, req, p }) => {
  need(session, 'librarian');
  const b = await readJson(req);
  const body = {};
  for (const k of ['full_name', 'group', 'email']) if (k in b) body[k] = String(b[k] ?? '');
  return call1c('PATCH', 'readers', { query: { id: p.id }, body, actor: session.login });
});
route('DELETE', '/api/readers/:id', async ({ session, p }) => { need(session, 'librarian'); return call1c('DELETE', 'readers', { query: { id: p.id }, actor: session.login }); });

// Выдачи и возвраты (FR-03, FR-04, FR-15 — отметка утери)
route('GET', '/api/loans', async ({ session, url }) => {
  need(session, 'librarian');
  return paginate(await call1c('GET', 'loans', { query: { reader_id: url.searchParams.get('reader_id'), date: url.searchParams.get('date') }, actor: session.login }), url);
});
route('POST', '/api/loans', async ({ session, req }) => {
  need(session, 'librarian');
  const b = await readJson(req);
  const loanId = b.loan_id || `L-${today().replace(/-/g, '')}-${randomUUID().slice(0, 6).toUpperCase()}`;
  return call1c('POST', 'loans', { body: { loan_id: loanId, book_code: b.book_code, reader_id: b.reader_id, issue_date: b.issue_date || today(), due_date: b.due_date }, actor: session.login });
});
route('POST', '/api/loans/:id/return', async ({ session, req, p }) => {
  need(session, 'librarian');
  const b = await readJson(req);
  return call1c('POST', 'loans', { query: { id: p.id, action: 'return' }, body: { return_date: b.return_date || today() }, actor: session.login });
});
route('POST', '/api/loans/:id/loss', async ({ session, req, p }) => {
  need(session, 'librarian');
  const b = await readJson(req);
  return call1c('POST', 'loans', { query: { id: p.id, action: 'loss' }, body: { lost_date: b.lost_date || today() }, actor: session.login });
});

// Кабинет читателя (FR-13): только собственные выдачи, читатель определяется по сессии
route('GET', '/api/me/loans', async ({ session }) => {
  need(session, 'reader');
  if (!session.reader_id) return { items: [], total: 0, not_linked: true };
  return call1c('GET', 'me-loans', { actor: session.login });
});

// Отчёт «Просрочки» и KPI (FR-05, FR-06, FR-09, FR-10)
function reportQuery(url) {
  const q = {};
  for (const k of REPORT_FILTERS) { const v = url.searchParams.get(k); if (v) q[k] = v; }
  return q;
}
route('GET', '/api/reports/overdue', async ({ session, url }) => { need(session, 'librarian'); return call1c('GET', 'overdue', { query: reportQuery(url), actor: session.login }); });
route('GET', '/api/reports/overdue/export', async ({ session, url }) => {
  need(session, 'librarian');
  const r = await call1c('GET', 'overdue', { query: reportQuery(url), actor: session.login });
  const items = r.items.map((x) => ({ ...x, report_date: r.date }));
  const csv = toCsv(OVERDUE_COLUMNS, items);
  return { raw: csv, headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="overdue_${r.date}.csv"` } };
});

// Импорт CSV (FR-11)
route('POST', '/api/import/:kind', async ({ session, req, p }) => {
  need(session, 'librarian');
  const text = await readBody(req, MAX_BYTES);
  return importCsv(p.kind, text, session.login);
});

// Журнал операций (FR-18)
route('GET', '/api/audit', async ({ session, url }) => {
  need(session, 'librarian');
  const r = await call1c('GET', 'audit', { actor: session.login });
  r.items.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return paginate(r, url);
});

// ---------------- HTTP-сервер ----------------
async function serveStatic(req, res, pathname) {
  let file = normalize(join(WEB, decodeURIComponent(pathname)));
  if (!file.startsWith(WEB)) { res.writeHead(403); return res.end(); }
  try {
    const st = await stat(file);
    if (st.isDirectory()) file = join(file, 'index.html');
  } catch {
    file = join(WEB, 'index.html'); // SPA: все маршруты отдают index.html
  }
  try {
    const data = await readFile(file);
    const ext = extname(file);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': ext === '.html' ? 'no-cache' : 'max-age=3600' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Интерфейс не собран: нет web/dist');
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const requestId = randomUUID().slice(0, 8);
  if (!url.pathname.startsWith('/api/')) return serveStatic(req, res, url.pathname);
  try {
    for (const r of routes) {
      if (r.method !== req.method) continue;
      const m = url.pathname.match(r.re);
      if (!m) continue;
      const p = Object.fromEntries(Object.entries(m.groups || {}).map(([k, v]) => [k, decodeURIComponent(v)]));
      const out = await r.handler({ req, res, url, p, session: getSession(req) });
      if (out && out.raw !== undefined) { res.writeHead(200, out.headers); return res.end(out.raw); }
      if (out && out.reply === true) return send(res, out.status, out.data, out.headers);
      return send(res, 200, out);
    }
    throw new HttpError(404, 'NOT_FOUND', 'Метод API не найден');
  } catch (e) {
    const status = e instanceof HttpError || e instanceof OneCError ? e.status : 500;
    if (status >= 500) console.error(`[${requestId}] ${req.method} ${url.pathname}:`, e.message);
    send(res, status, { code: e.code || 'INTERNAL', message: status === 500 ? 'Внутренняя ошибка сервера' : e.message, request_id: requestId });
  }
});

scheduleNotifications();

server.listen(config.port, '127.0.0.1', () => {
  console.log(`Библиус: http://localhost:${config.port}  (1С: ${config.onecUrl})`);
});
