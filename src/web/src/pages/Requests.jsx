import { useState } from 'react';
import { api, today, addDays, fmtDate } from '../api.js';
import { useLoad, Loading, Alert, Field, Modal } from '../ui.jsx';

const FILTERS = [['Новая', 'Новые'], ['', 'Все'], ['Выдана', 'Выданные'], ['Отклонена', 'Отклонённые'], ['Отменена', 'Отменённые']];

export default function Requests() {
  const [status, setStatus] = useState('Новая');
  const data = useLoad(() => Promise.all([api.get('/api/requests' + (status ? `?status=${encodeURIComponent(status)}` : '')), api.get('/api/public/catalog')]), [status]);
  const [act, setAct] = useState(null);
  const [msg, setMsg] = useState('');

  const [reqs, catalog] = data.data ? [data.data[0].items, data.data[1].items] : [[], []];
  const items = [...reqs].sort((a, b) => a.created.localeCompare(b.created));
  const edition = (r) => catalog.find((e) => e.key === r.edition_key);

  return (
    <section>
      <header className="page-head">
        <div>
          <h1>Заявки читателей</h1>
          <p className="muted">Читатели оставляют заявки на сайте кнопкой «Взять почитать». Подготовьте книгу и оформите выдачу, когда читатель придёт.</p>
        </div>
      </header>
      <Alert kind="ok" onClose={() => setMsg('')}>{msg}</Alert>
      <div className="toolbar">
        <div className="seg" role="group" aria-label="Состояние">
          {FILTERS.map(([k, t]) => <button key={k} className={status === k ? 'on' : ''} onClick={() => setStatus(k)}>{t}</button>)}
        </div>
      </div>
      <Loading state={data}>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Заявка</th><th>Книга</th><th>Читатель</th><th>Создана</th><th>Свободно</th><th>Состояние</th><th /></tr></thead>
            <tbody>
              {items.map((r) => {
                const e = edition(r);
                return (
                  <tr key={r.request_id}>
                    <td className="mono">{r.request_id}</td>
                    <td><b>{r.title}</b><div className="muted small">{r.author}</div></td>
                    <td>{r.full_name}<div className="muted small">{r.reader_id} · {r.group}</div></td>
                    <td>{fmtDate(r.created.slice(0, 10))} {r.created.slice(11, 16)}</td>
                    <td>{e ? `${e.available} из ${e.copies}` : '—'}</td>
                    <td>{r.status}{r.loan_id && <div className="muted small mono">{r.loan_id}</div>}{r.comment && <div className="muted small">{r.comment}</div>}</td>
                    <td className="actions">
                      {r.status === 'Новая' && <>
                        <button className="btn btn-small btn-primary" disabled={!e || e.available === 0} title={e && e.available === 0 ? 'Нет свободных экземпляров' : ''} onClick={() => setAct({ r, mode: 'issue' })}>Выдать</button>
                        <button className="btn btn-small" onClick={() => setAct({ r, mode: 'reject' })}>Отклонить</button>
                      </>}
                    </td>
                  </tr>
                );
              })}
              {!items.length && <tr><td colSpan={7} className="empty">{status === 'Новая' ? 'Новых заявок нет' : 'Заявок нет'}</td></tr>}
            </tbody>
          </table>
        </div>
      </Loading>
      {act && <RequestAction {...act} onClose={() => setAct(null)} onDone={(t) => { setAct(null); setMsg(t); data.reload(); }} />}
    </section>
  );
}

function RequestAction({ r, mode, onClose, onDone }) {
  const [due, setDue] = useState(addDays(today(), 14));
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const issue = mode === 'issue';
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      if (issue) {
        const res = await api.post(`/api/requests/${encodeURIComponent(r.request_id)}/issue`, { due_date: due });
        onDone(`Выдача ${res.loan.loan_id} оформлена: экземпляр ${res.loan.book_code} «${res.loan.title}» — ${res.loan.full_name}, вернуть до ${fmtDate(res.loan.due_date)}`);
      } else {
        await api.post(`/api/requests/${encodeURIComponent(r.request_id)}/reject`, { comment });
        onDone(`Заявка ${r.request_id} отклонена`);
      }
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <Modal title={issue ? 'Выдача по заявке' : 'Отклонить заявку'} onClose={onClose}>
      <form onSubmit={submit}>
        <p><b>{r.title}</b>, {r.author}<br /><span className="muted">{r.full_name} ({r.reader_id}), заявка {r.request_id}</span></p>
        {issue
          ? <Field label="Вернуть до" hint="Будет выдан первый свободный экземпляр этого издания"><input type="date" value={due} min={today()} onChange={(e) => setDue(e.target.value)} required /></Field>
          : <Field label="Причина (увидит читатель)"><input value={comment} onChange={(e) => setComment(e.target.value)} maxLength={200} placeholder="Например: издание есть только в читальном зале" /></Field>}
        <Alert>{error}</Alert>
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Отмена</button>
          <button className={`btn ${issue ? 'btn-primary' : 'btn-danger'}`} disabled={busy}>{busy ? 'Сохранение…' : issue ? 'Оформить выдачу' : 'Отклонить заявку'}</button>
        </div>
      </form>
    </Modal>
  );
}
