import { useState } from 'react';
import { api, fmtDate } from '../api.js';
import { useLoad, Loading, Alert, usePaged, TablePager } from '../ui.jsx';

const KIND = { reminder: 'Напоминание о сроке', overdue: 'Уведомление о просрочке' };

// Уведомления читателям (FR-20): журнал отправок, ручной запуск, письма в папке outbox
export default function Notifications() {
  const data = useLoad(() => api.get('/api/notifications'));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [open, setOpen] = useState(null);
  const d = data.data;
  const pg = usePaged(d?.items || [], 50);

  const run = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await api.post('/api/notifications/run', {});
      if (r.skipped === true) setMsg({ kind: 'warn', text: r.message });
      else if (r.error) setMsg({ kind: 'error', text: 'Рассылка прервана: ' + r.error });
      else setMsg({ kind: 'ok', text: `Отправлено писем: ${r.sent}. Уже отправлялись раньше: ${r.skipped}. Без адреса: ${r.noEmail}. Ошибок: ${r.failed}.` });
      data.reload();
    } catch (e) { setMsg({ kind: 'error', text: e.message }); }
    setBusy(false);
  };

  const last = d?.last_run;
  return (
    <section>
      <header className="page-head">
        <div>
          <h1>Уведомления читателям</h1>
          <p className="muted">Письмо за {d?.remind_days ?? 3} дн. до срока возврата и письмо о просрочке. Рассылка запускается каждый день автоматически; одно и то же письмо по выдаче повторно не отправляется.</p>
        </div>
        <button className="btn btn-primary" onClick={run} disabled={busy}>{busy ? 'Рассылка…' : 'Запустить рассылку'}</button>
      </header>
      {msg && <Alert kind={msg.kind} onClose={() => setMsg(null)}>{msg.text}</Alert>}
      <Loading state={data}>
        {d && <>
          <div className="kpis">
            <div className="kpi"><div className="kpi-value">{d.mode === 'smtp' ? 'Почта' : 'Папка outbox'}</div><div className="kpi-label">{d.mode === 'smtp' ? 'письма уходят через SMTP-сервер' : 'SMTP не настроен: письма сохраняются в server\\outbox'}</div></div>
            <div className="kpi"><div className="kpi-value">{d.items.filter((x) => x.status === 'Отправлено').length}</div><div className="kpi-label">писем отправлено всего</div></div>
            <div className="kpi"><div className="kpi-value">{last ? last.finished?.slice(11, 16) || '—' : '—'}</div><div className="kpi-label">{last ? 'последний запуск ' + (last.finished || '').slice(0, 10).split('-').reverse().join('.') : 'запусков после старта сервера не было'}</div></div>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Время</th><th>Выдача</th><th>Вид</th><th>Срок возврата</th><th>Адрес</th><th>Состояние</th></tr></thead>
              <tbody>
                {pg.rows.map((x) => (
                  <tr key={x.key}>
                    <td>{String(x.time).replace('T', ' ').slice(0, 16)}</td>
                    <td className="mono">{x.loan_id}</td>
                    <td>{KIND[x.kind] || x.kind}</td>
                    <td>{fmtDate(x.due_date)}</td>
                    <td>{x.email || '—'}</td>
                    <td><span className={`badge badge-${x.status === 'Отправлено' ? 'ok' : x.status === 'Нет адреса' ? 'warn' : 'bad'}`}>{x.status}</span></td>
                  </tr>
                ))}
                {!d.items.length && <tr><td colSpan={6} className="empty">Писем ещё не было. Нажмите «Запустить рассылку», чтобы проверить выдачи сейчас.</td></tr>}
              </tbody>
            </table>
          </div>
          <TablePager p={pg} />
          {d.mode === 'outbox' && d.outbox.length > 0 && <>
            <h2 className="section-title">Последние письма в папке outbox</h2>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Кому</th><th>Тема</th><th>Дата</th><th></th></tr></thead>
                <tbody>
                  {d.outbox.map((m) => (
                    <tr key={m.file}>
                      <td>{m.to}</td>
                      <td>{m.subject}{open === m.file && <pre className="mail-preview">{m.text}</pre>}</td>
                      <td className="small">{m.date}</td>
                      <td className="actions"><button className="btn btn-small" onClick={() => setOpen(open === m.file ? null : m.file)}>{open === m.file ? 'Скрыть' : 'Показать'}</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>}
        </>}
      </Loading>
    </section>
  );
}
