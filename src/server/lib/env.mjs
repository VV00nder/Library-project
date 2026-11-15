// Чтение настроек из файла .env рядом с server.mjs (без внешних зависимостей).
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const file = join(root, '.env');

if (existsSync(file)) {
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
}

function need(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Не задан параметр ${name} в server/.env (см. .env.example)`);
  return v;
}

export const config = {
  port: Number(process.env.PORT || 3001),
  onecUrl: need('ONEC_URL').replace(/\/+$/, ''),
  onecUser: need('ONEC_USER'),
  onecPassword: need('ONEC_PASSWORD'),
  sessionHours: Number(process.env.SESSION_HOURS || 8),
  root,
};
