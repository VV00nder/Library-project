// Клиент HTTP-сервиса 1С BibliusAPI. Учётные данные 1С остаются на сервере и не попадают в браузер.
import { config } from './env.mjs';

const auth = 'Basic ' + Buffer.from(`${config.onecUser}:${config.onecPassword}`, 'utf8').toString('base64');

export class OneCError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// Вызов ресурса /data/{resource}. Возвращает разобранный JSON или бросает OneCError.
export async function call1c(method, resource, { query = {}, body, actor } = {}) {
  const url = new URL(`${config.onecUrl}/data/${encodeURIComponent(resource)}`);
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }
  const headers = { Authorization: auth, Accept: 'application/json' };
  if (actor) headers['X-Biblius-Actor'] = actor;
  if (body !== undefined) headers['Content-Type'] = 'application/json; charset=utf-8';
  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
  } catch (e) {
    throw new OneCError(503, 'ONEC_UNAVAILABLE', '1С недоступна: проверьте публикацию на IIS');
  }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* не JSON */ }
  if (!res.ok) {
    if (res.status === 401 && !data) throw new OneCError(503, 'ONEC_AUTH', 'Сервер не смог войти в 1С: проверьте ONEC_USER и ONEC_PASSWORD');
    throw new OneCError(res.status, data?.code || 'ONEC_ERROR', data?.message || `Ошибка 1С (${res.status})`);
  }
  return data;
}

export async function ping1c() {
  const res = await fetch(`${config.onecUrl}/ping`, { headers: { Authorization: auth }, signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new OneCError(503, 'ONEC_UNAVAILABLE', `1С ответила ${res.status}`);
  return res.json();
}
