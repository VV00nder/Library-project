// FR-20: напоминание за N дней до срока и письмо о наступившей просрочке.
// Ключ защиты от повторов — loan_id, вид письма и due_date (ПР-06); отметки хранятся в 1С (регистр ОтправкиУведомлений).
import { call1c } from './onec.mjs';
import { sendMail } from './mailer.mjs';

export const REMIND_DAYS = Number(process.env.REMIND_DAYS || 3);
const RUN_AT = process.env.NOTIFY_TIME || '09:00';
const fmt = (iso) => iso.split('-').reverse().join('.');

const nowMsk = () => new Date(Date.now() + 3 * 3600_000).toISOString().replace('T', ' ').slice(0, 19);

function letter(kind, l) {
  if (kind === 'reminder') {
    return {
      subject: `Срок возврата книги «${l.title}» — ${fmt(l.due_date)}`,
      text: `Здравствуйте, ${l.full_name}!\n\nНапоминаем: книгу «${l.title}» (${l.author}) нужно вернуть в библиотеку до ${fmt(l.due_date)}.\n\nЕсли книга уже возвращена, не обращайте внимания на это письмо.\n\nБиблиотека РТУ МИРЭА`,
    };
  }
  return {
    subject: `Книга «${l.title}» не возвращена в срок`,
    text: `Здравствуйте, ${l.full_name}!\n\nСрок возврата книги «${l.title}» (${l.author}) истёк ${fmt(l.due_date)}. Пожалуйста, верните её на абонемент.\n\nБиблиотека РТУ МИРЭА`,
  };
}

let running = false;
export let lastRun = null;

export async function runNotifications() {
  if (running) return { skipped: true, message: 'Рассылка уже выполняется' };
  running = true;
  const result = { started: nowMsk(), sent: 0, skipped: 0, failed: 0, noEmail: 0, details: [] };
  try {
    const [{ items, date }, log] = await Promise.all([call1c('GET', 'notify-due'), call1c('GET', 'notify-log')]);
    const done = new Set(log.items.filter((x) => x.status === 'Отправлено' || x.status === 'Нет адреса').map((x) => x.key));
    for (const l of items) {
      const kind = l.days_overdue > 0 ? 'overdue' : l.days_left === REMIND_DAYS ? 'reminder' : null;
      if (!kind) continue;
      const key = `${l.loan_id}|${kind}|${l.due_date}`;
      if (done.has(key)) { result.skipped += 1; continue; }
      const base = { key, loan_id: l.loan_id, kind, due_date: l.due_date, email: l.email || '', time: nowMsk() };
      if (!l.email) {
        await call1c('POST', 'notify-log', { body: { ...base, status: 'Нет адреса' } });
        result.noEmail += 1;
        result.details.push({ key, status: 'Нет адреса' });
        continue;
      }
      try {
        const m = letter(kind, l);
        const r = await sendMail({ to: l.email, ...m });
        await call1c('POST', 'notify-log', { body: { ...base, status: 'Отправлено' } });
        result.sent += 1;
        result.details.push({ key, status: 'Отправлено', mode: r.mode });
      } catch (e) {
        await call1c('POST', 'notify-log', { body: { ...base, status: 'Ошибка: ' + e.message.slice(0, 30) } }).catch(() => {});
        result.failed += 1;
        result.details.push({ key, status: 'Ошибка', message: e.message });
      }
    }
    result.date = date;
  } catch (e) {
    result.error = e.message;
  } finally {
    running = false;
    result.finished = nowMsk();
    lastRun = result;
  }
  return result;
}

// Запуск раз в сутки в NOTIFY_TIME (по Москве) и через минуту после старта сервера
export function scheduleNotifications() {
  const plan = () => {
    const [h, m] = RUN_AT.split(':').map(Number);
    const now = new Date(Date.now() + 3 * 3600_000);
    const next = new Date(now); next.setUTCHours(h, m, 0, 0);
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
    setTimeout(async () => { await runNotifications(); plan(); }, next - now);
  };
  setTimeout(() => runNotifications().catch(() => {}), 60_000);
  plan();
}
