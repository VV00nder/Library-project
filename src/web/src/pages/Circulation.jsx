import { useState } from 'react';
import { api, today, addDays, fmtDate } from '../api.js';
import { useLoad, Loading, Alert, Field, Modal, Badge, Search, match } from '../ui.jsx';

export default function Circulation() {
  const data = useLoad(() => Promise.all([api.get('/api/readers'), api.get('/api/books'), api.get('/api/loans')]));
  const [msg, setMsg] = useState('');
  const [close, setClose] = useState(null);
  const [q, setQ] = useState('');

  const [readers, books, loans] = data.data ? data.data.map((x) => x.items) : [[], [], []];
  const active = loans.filter((l) => l.active)
    .filter((l) => match(q, l.loan_id, l.book_code, l.title, l.full_name, l.reader_id))
    .sort((a, b) => b.days_overdue - a.days_overdue || a.due_date.localeCompare(b.due_date));

  return (
    <section>
      <header className="page-head">
        <div>
          <h1>Выдача и возврат</h1>
          <p className="muted">1С проверяет читателя, экземпляр и даты; при нарушении правил операция не сохраняется.</p>
        </div>
      </header>
      <Alert kind="ok" onClose={() => setMsg('')}>{msg}</Alert>
      <Loading state={data}>
        <IssueForm readers={readers} books={books} onDone={(t) => { setMsg(t); data.reload(); }} />
        <h2 className="section-title">Книги на руках <span className="muted">({loans.filter((l) => l.active).length})</span></h2>
        <div className="toolbar"><Search value={q} onChange={setQ} placeholder="Поиск по книге или читателю" /></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Выдача</th><th>Книга</th><th>Читатель</th><th>Выдана</th><th>Срок</th><th className="num">Просрочка</th><th /></tr></thead>
            <tbody>
              {active.map((l) => (
                <tr key={l.loan_id} className={l.days_overdue > 0 ? 'row-bad' : ''}>
                  <td className="mono">{l.loan_id}</td>
                  <td><span className="mono">{l.book_code}</span> {l.title}</td>
                  <td>{l.full_name}<div className="muted small">{l.reader_id} · {l.group}</div></td>
                  <td>{fmtDate(l.issue_date)}</td>
                  <td>{fmtDate(l.due_date)}</td>
                  <td className="num">{l.days_overdue > 0 ? <Badge>Просрочена</Badge> : null} {l.days_overdue > 0 ? `${l.days_overdue} дн.` : '—'}</td>
                  <td className="actions">
                    <button className="btn btn-small btn-primary" onClick={() => setClose({ loan: l, mode: 'return' })}>Возврат</button>
                    <button className="btn btn-small" onClick={() => setClose({ loan: l, mode: 'loss' })}>Утеря</button>
                  </td>
                </tr>
              ))}
              {!active.length && <tr><td colSpan={7} className="empty">Активных выдач нет</td></tr>}
            </tbody>
          </table>
        </div>
      </Loading>
      {close && <CloseLoan {...close} onClose={() => setClose(null)} onDone={(t) => { setClose(null); setMsg(t); data.reload(); }} />}
    </section>
  );
}

function IssueForm({ readers, books, onDone }) {
  const [reader, setReader] = useState('');
  const [book, setBook] = useState('');
  const [issue, setIssue] = useState(today());
  const [due, setDue] = useState(addDays(today(), 14));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const available = books.filter((b) => b.status === 'Доступен').sort((a, b) => a.book_code.localeCompare(b.book_code));
  const readerId = (reader.match(/^([^ ]+) —/) || [])[1] || reader.trim();
  const bookCode = (book.match(/^([^ ]+) —/) || [])[1] || book.trim();

  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const l = await api.post('/api/loans', { reader_id: readerId, book_code: bookCode, issue_date: issue, due_date: due });
      onDone(`Выдача ${l.loan_id} оформлена: «${l.title}» — ${l.full_name}, вернуть до ${fmtDate(l.due_date)}`);
      setBook('');
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <form className="card issue" onSubmit={submit}>
      <h2>Оформить выдачу</h2>
      <div className="form-row">
        <Field label="Читатель">
          <input list="readers-list" value={reader} onChange={(e) => setReader(e.target.value)} placeholder="ФИО или номер" required />
          <datalist id="readers-list">{readers.map((r) => <option key={r.reader_id} value={`${r.reader_id} — ${r.full_name}, ${r.group}`} />)}</datalist>
        </Field>
        <Field label={`Экземпляр (доступно ${available.length})`}>
          <input list="books-list" value={book} onChange={(e) => setBook(e.target.value)} placeholder="Код или название" required />
          <datalist id="books-list">{available.map((b) => <option key={b.book_code} value={`${b.book_code} — ${b.title}, ${b.author}`} />)}</datalist>
        </Field>
        <Field label="Дата выдачи"><input type="date" value={issue} max={today()} onChange={(e) => setIssue(e.target.value)} required /></Field>
        <Field label="Вернуть до"><input type="date" value={due} min={issue} onChange={(e) => setDue(e.target.value)} required /></Field>
        <div className="field field-btn"><button className="btn btn-primary" disabled={busy}>{busy ? 'Оформление…' : 'Выдать'}</button></div>
      </div>
      <Alert>{error}</Alert>
    </form>
  );
}

function CloseLoan({ loan, mode, onClose, onDone }) {
  const [date, setDate] = useState(today());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const isReturn = mode === 'return';
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const url = `/api/loans/${encodeURIComponent(loan.loan_id)}/${mode}`;
      const l = await api.post(url, isReturn ? { return_date: date } : { lost_date: date });
      onDone(isReturn ? `Книга «${l.title}» возвращена${l.days_overdue > 0 ? `, просрочка ${l.days_overdue} дн.` : ' в срок'}` : `Утеря отмечена: «${l.title}». Списание оформляет бухгалтер в 1С.`);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <Modal title={isReturn ? 'Возврат книги' : 'Отметка утери'} onClose={onClose}>
      <form onSubmit={submit}>
        <p><b>{loan.title}</b> ({loan.book_code})<br /><span className="muted">{loan.full_name}, выдана {fmtDate(loan.issue_date)}, срок {fmtDate(loan.due_date)}</span></p>
        {!isReturn && <Alert kind="warn">Экземпляр будет недоступен для выдачи до списания. Стоимость фонда уменьшится только при проведении списания в 1С.</Alert>}
        <Field label={isReturn ? 'Дата возврата' : 'Дата утери'}><input type="date" value={date} min={loan.issue_date} max={today()} onChange={(e) => setDate(e.target.value)} required /></Field>
        <Alert>{error}</Alert>
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Отмена</button>
          <button className={`btn ${isReturn ? 'btn-primary' : 'btn-danger'}`} disabled={busy}>{busy ? 'Сохранение…' : isReturn ? 'Принять книгу' : 'Отметить утерю'}</button>
        </div>
      </form>
    </Modal>
  );
}
