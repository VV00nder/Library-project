import { useState } from 'react';
import { api, fmtDate } from '../api.js';
import { useLoad, Loading, Alert, Field, Modal, Badge, Search, match } from '../ui.jsx';

export default function Readers() {
  const readers = useLoad(() => api.get('/api/readers'));
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState(null);
  const [card, setCard] = useState(null);
  const [msg, setMsg] = useState('');

  const items = (readers.data?.items || [])
    .filter((r) => match(q, r.reader_id, r.full_name, r.group, r.email))
    .sort((a, b) => a.full_name.localeCompare(b.full_name, 'ru'));

  return (
    <section>
      <header className="page-head">
        <div>
          <h1>Читатели</h1>
          <p className="muted">Реестр читателей и история их выдач.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setEdit({ reader_id: '', full_name: '', group: '', email: '', isNew: true })}>Добавить читателя</button>
      </header>
      <Alert kind="ok" onClose={() => setMsg('')}>{msg}</Alert>
      <div className="toolbar"><Search value={q} onChange={setQ} placeholder="Поиск по ФИО, номеру, группе" /></div>
      <Loading state={readers}>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Номер</th><th>ФИО</th><th>Группа</th><th>E-mail</th><th /></tr></thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.reader_id}>
                  <td className="mono">{r.reader_id}</td>
                  <td><button className="link" onClick={() => setCard(r)}>{r.full_name}</button></td>
                  <td>{r.group}</td>
                  <td>{r.email || '—'}</td>
                  <td className="actions">
                    <button className="btn btn-small" onClick={() => setCard(r)}>История</button>
                    <button className="btn btn-small" onClick={() => setEdit({ ...r })}>Изменить</button>
                  </td>
                </tr>
              ))}
              {!items.length && <tr><td colSpan={5} className="empty">Ничего не найдено</td></tr>}
            </tbody>
          </table>
        </div>
      </Loading>
      {edit && <ReaderForm reader={edit} onClose={() => setEdit(null)} onSaved={(t) => { setEdit(null); setMsg(t); readers.reload(); }} />}
      {card && <ReaderCard reader={card} onClose={() => setCard(null)} />}
    </section>
  );
}

function ReaderForm({ reader, onClose, onSaved }) {
  const [f, setF] = useState(reader);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    const body = { full_name: f.full_name.trim(), group: f.group.trim(), email: (f.email || '').trim() };
    try {
      if (f.isNew) await api.post('/api/readers', { reader_id: f.reader_id.trim(), ...body });
      else await api.patch(`/api/readers/${encodeURIComponent(f.reader_id)}`, body);
      onSaved(`Читатель ${f.reader_id} сохранён`);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <Modal title={f.isNew ? 'Новый читатель' : `Читатель ${f.reader_id}`} onClose={onClose}>
      <form onSubmit={save} className="form-grid">
        <Field label="Номер читательского билета"><input value={f.reader_id} onChange={set('reader_id')} required disabled={!f.isNew} maxLength={40} /></Field>
        <Field label="Группа"><input value={f.group} onChange={set('group')} required maxLength={80} /></Field>
        <Field label="ФИО" wide><input value={f.full_name} onChange={set('full_name')} required maxLength={200} /></Field>
        <Field label="E-mail" wide hint="Нужен для уведомлений о сроке возврата"><input type="email" value={f.email || ''} onChange={set('email')} maxLength={254} /></Field>
        <div className="field-wide"><Alert>{error}</Alert></div>
        <div className="form-actions field-wide">
          <button type="button" className="btn" onClick={onClose}>Отмена</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Сохранение…' : 'Сохранить'}</button>
        </div>
      </form>
    </Modal>
  );
}

function ReaderCard({ reader, onClose }) {
  const loans = useLoad(() => api.get(`/api/loans?reader_id=${encodeURIComponent(reader.reader_id)}`), [reader.reader_id]);
  const items = (loans.data?.items || []).sort((a, b) => b.issue_date.localeCompare(a.issue_date));
  const active = items.filter((l) => l.active);
  return (
    <Modal title={reader.full_name} onClose={onClose}>
      <p className="muted">{reader.reader_id} · {reader.group}{reader.email ? ` · ${reader.email}` : ''}</p>
      <Loading state={loans}>
        <p>Текущих выдач: <b>{active.length}</b>, всего в истории: <b>{items.length}</b></p>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Книга</th><th>Выдана</th><th>Срок</th><th>Закрыта</th><th>Статус</th><th className="num">Просрочка</th></tr></thead>
            <tbody>
              {items.map((l) => (
                <tr key={l.loan_id}>
                  <td><span className="mono">{l.book_code}</span> {l.title}</td>
                  <td>{fmtDate(l.issue_date)}</td>
                  <td>{fmtDate(l.due_date)}</td>
                  <td>{fmtDate(l.return_date || l.lost_date)}</td>
                  <td><Badge>{l.active && l.days_overdue > 0 ? 'Просрочена' : l.status}</Badge></td>
                  <td className="num">{l.days_overdue > 0 ? `${l.days_overdue} дн.` : '—'}</td>
                </tr>
              ))}
              {!items.length && <tr><td colSpan={6} className="empty">Выдач не было</td></tr>}
            </tbody>
          </table>
        </div>
      </Loading>
    </Modal>
  );
}
