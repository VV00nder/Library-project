import { useState } from 'react';
import { api } from '../api.js';
import { Alert, Field } from '../ui.jsx';

const KINDS = {
  books: { title: 'Книги (books.csv)', header: 'book_code;title;author;publication_year;udc;cost;received_date;source' },
  readers: { title: 'Читатели (readers.csv)', header: 'reader_id;full_name;group;email' },
  loans: { title: 'Выдачи (loans.csv)', header: 'loan_id;book_code;reader_id;issue_date;due_date;return_date' },
};
const RESULT = { accepted: 'Принято', skipped: 'Пропущено', rejected: 'Отклонено' };

export default function Import() {
  const [kind, setKind] = useState('books');
  const [file, setFile] = useState(null);
  const [res, setRes] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setError('Файл больше 5 МБ'); return; }
    setBusy(true); setError(''); setRes(null);
    try { setRes(await api.upload(`/api/import/${kind}`, await file.text())); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <section>
      <header className="page-head">
        <div>
          <h1>Импорт CSV</h1>
          <p className="muted">Загружайте файлы в порядке: книги → читатели → выдачи. Повторная загрузка не создаёт дублей.</p>
        </div>
      </header>
      <form className="card" onSubmit={submit}>
        <div className="form-row">
          <Field label="Что загружаем">
            <select value={kind} onChange={(e) => { setKind(e.target.value); setRes(null); }}>
              {Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v.title}</option>)}
            </select>
          </Field>
          <Field label="Файл CSV (UTF-8, разделитель «;»)">
            <input type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files[0] || null)} required />
          </Field>
          <div className="field field-btn"><button className="btn btn-primary" disabled={busy || !file}>{busy ? 'Загрузка…' : 'Загрузить'}</button></div>
        </div>
        <p className="muted small">Первая строка — имена полей: <code>{KINDS[kind].header}</code>. Даты — YYYY-MM-DD, десятичный разделитель — точка.</p>
        <Alert>{error}</Alert>
      </form>
      {res && <>
        <div className="kpis">
          <div className="kpi kpi-ok"><div className="kpi-value">{res.accepted}</div><div className="kpi-label">принято</div></div>
          <div className="kpi"><div className="kpi-value">{res.skipped}</div><div className="kpi-label">пропущено (уже есть)</div></div>
          <div className="kpi kpi-bad"><div className="kpi-value">{res.rejected}</div><div className="kpi-label">отклонено</div></div>
        </div>
        <h2 className="section-title">Протокол загрузки</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th className="num">Строка</th><th>Ключ</th><th>Результат</th><th>Причина</th></tr></thead>
            <tbody>
              {res.rows.map((r) => (
                <tr key={r.line} className={r.result === 'rejected' ? 'row-bad' : ''}>
                  <td className="num">{r.line}</td><td className="mono">{r.key || '—'}</td>
                  <td><span className={`badge badge-${r.result === 'accepted' ? 'ok' : r.result === 'skipped' ? 'muted' : 'bad'}`}>{RESULT[r.result]}</span></td>
                  <td>{r.message || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>}
    </section>
  );
}
