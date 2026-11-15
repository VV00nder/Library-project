// Обращения к серверу приложения. Сессия хранится в HttpOnly-cookie.
export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function request(method, url, body, raw = false) {
  const opts = { method, credentials: 'same-origin', headers: {} };
  if (body !== undefined) {
    if (raw) { opts.headers['Content-Type'] = 'text/csv; charset=utf-8'; opts.body = body; }
    else { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  }
  let res;
  try { res = await fetch(url, opts); } catch { throw new ApiError(0, 'Сервер приложения недоступен'); }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.message || `Ошибка ${res.status}`);
  return data;
}

export const api = {
  get: (u) => request('GET', u),
  post: (u, b) => request('POST', u, b ?? {}),
  patch: (u, b) => request('PATCH', u, b),
  del: (u) => request('DELETE', u),
  upload: (u, text) => request('POST', u, text, true),
};

export const qs = (o) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== '' && v !== null && v !== undefined) p.set(k, v);
  const s = p.toString();
  return s ? '?' + s : '';
};

export const today = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
export const addDays = (iso, n) => {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const fmtDate = (iso) => (iso ? iso.split('-').reverse().join('.') : '—');
export const fmtMoney = (v) => (v === undefined || v === null ? '—' : Number(v).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₽');
