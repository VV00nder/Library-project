// Пароли: scrypt с солью. Сессии: случайный токен в HttpOnly-cookie, хранится в памяти сервера.
import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { config } from './env.mjs';

const N = 16384, R = 8, P = 1, LEN = 32;

export function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, LEN, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, saltB64, hashB64] = parts;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = scryptSync(password, Buffer.from(saltB64, 'base64'), expected.length, { N: +n, r: +r, p: +p });
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export const ROLE_FROM_1C = { 'Библиотекарь': 'librarian', 'Читатель': 'reader', 'Бухгалтер': 'accountant' };

const sessions = new Map();
const COOKIE = 'bsid';

export function createSession(user) {
  const token = randomBytes(32).toString('base64url');
  sessions.set(token, { ...user, expires: Date.now() + config.sessionHours * 3600_000 });
  return token;
}

export function sessionCookie(token) {
  return `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${config.sessionHours * 3600}`;
}

export function clearCookie() {
  return `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`;
}

function tokenFrom(req) {
  const m = (req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  return m ? m[1] : null;
}

export function getSession(req) {
  const token = tokenFrom(req);
  if (!token) return null;
  const s = sessions.get(token);
  if (!s) return null;
  if (s.expires < Date.now()) { sessions.delete(token); return null; }
  return s;
}

export function dropSession(req) {
  const token = tokenFrom(req);
  if (token) sessions.delete(token);
}
