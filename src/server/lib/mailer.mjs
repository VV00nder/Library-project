// Отправка писем: SMTP (TLS, AUTH LOGIN) без внешних пакетов. Если SMTP не настроен,
// письмо сохраняется в server/outbox как .eml — так стенд работает без почтового ящика.
import tls from 'node:tls';
import { mkdir, writeFile, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from './env.mjs';

const OUTBOX = join(config.root, 'outbox');
const smtp = {
  host: process.env.SMTP_HOST || '',
  port: Number(process.env.SMTP_PORT || 465),
  user: process.env.SMTP_USER || '',
  pass: process.env.SMTP_PASSWORD || '',
  from: process.env.SMTP_FROM || process.env.SMTP_USER || 'biblius@localhost',
};
export const mailMode = () => (smtp.host && smtp.user && smtp.pass ? 'smtp' : 'outbox');

const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
const header = (s) => `=?UTF-8?B?${b64(s)}?=`;

function compose({ to, subject, text }) {
  const id = `<${randomUUID()}@biblius>`;
  return [
    `From: ${header('Библиотека Библиус')} <${smtp.from}>`,
    `To: <${to}>`,
    `Subject: ${header(subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: ${id}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    b64(text).replace(/.{76}/g, '$&\r\n'),
  ].join('\r\n');
}

function smtpSend(to, message) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host: smtp.host, port: smtp.port, servername: smtp.host });
    const steps = [
      [null, 220],
      ['EHLO biblius', 250],
      ['AUTH LOGIN', 334],
      [b64(smtp.user), 334],
      [b64(smtp.pass), 235],
      [`MAIL FROM:<${smtp.from}>`, 250],
      [`RCPT TO:<${to}>`, 250],
      ['DATA', 354],
      [message.replace(/\r\n\./g, '\r\n..') + '\r\n.', 250],
      ['QUIT', 221],
    ];
    let i = 0, buf = '';
    const timer = setTimeout(() => { socket.destroy(); reject(new Error('Почтовый сервер не ответил')); }, 20000);
    const next = () => {
      i += 1;
      if (i >= steps.length) { clearTimeout(timer); socket.end(); resolve(); return; }
      socket.write(steps[i][0] + '\r\n');
    };
    socket.on('data', (d) => {
      buf += d.toString('utf8');
      const lines = buf.split('\r\n').filter(Boolean);
      const last = lines[lines.length - 1] || '';
      if (!/^\d{3} /.test(last)) return; // ждём конец многострочного ответа
      buf = '';
      const code = Number(last.slice(0, 3));
      if (code !== steps[i][1]) { clearTimeout(timer); socket.destroy(); reject(new Error(`SMTP: ${last.slice(0, 120)}`)); return; }
      next();
    });
    socket.on('error', (e) => { clearTimeout(timer); reject(new Error('SMTP: ' + e.message)); });
  });
}

// Возвращает { mode, file? }. Ошибка SMTP пробрасывается — вызывающий решает, повторять ли.
export async function sendMail({ to, subject, text }) {
  const message = compose({ to, subject, text });
  if (mailMode() === 'smtp') {
    await smtpSend(to, message);
    return { mode: 'smtp' };
  }
  await mkdir(OUTBOX, { recursive: true });
  const name = `${new Date().toISOString().replace(/[:.]/g, '-')}_${to.replace(/[^\w.@-]/g, '_')}.eml`;
  await writeFile(join(OUTBOX, name), message, 'utf8');
  return { mode: 'outbox', file: name };
}

// Последние письма из outbox (для демонстрации без почтового ящика)
export async function outboxList(limit = 30) {
  try {
    const files = (await readdir(OUTBOX)).filter((f) => f.endsWith('.eml')).sort().reverse().slice(0, limit);
    const out = [];
    for (const f of files) {
      const raw = await readFile(join(OUTBOX, f), 'utf8');
      const [head, body] = raw.split('\r\n\r\n');
      const get = (h) => (head.match(new RegExp(`^${h}: (.*)$`, 'm')) || [])[1] || '';
      const dec = (s) => s.replace(/=\?UTF-8\?B\?([^?]+)\?=/g, (_, x) => Buffer.from(x, 'base64').toString('utf8'));
      out.push({ file: f, to: get('To').replace(/[<>]/g, ''), subject: dec(get('Subject')), date: get('Date'), text: Buffer.from(body.replace(/\r\n/g, ''), 'base64').toString('utf8') });
    }
    return out;
  } catch { return []; }
}
