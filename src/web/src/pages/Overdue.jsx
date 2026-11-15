import { useState } from 'react';
import { api, qs, today, fmtDate } from '../api.js';
import { useLoad, Loading, Field } from '../ui.jsx';

const EMPTY = { date: today(), from: '', to: '', group: '', author: '', udc: '', min_days: '', max_days: '' };

export default function Overdue() {
  const [form, setForm] = useState(EMPTY);
  const [applied, setApplied] = useState(EMPTY);
  const report = useLoad(() => api.get('/api/reports/overdue' + qs(applied)), [JSON.stringify(applied)]);
  const stats = useLoad(() => api.get('/api/reports/overdue/stats' + qs({ ...applied, top: 5 })), [JSON.stringify(applied)]);
  const ref = useLoad(() => Promise.all([api.get('/api/readers'), api.get('/api/books')]));
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const groups = [...new Set((ref.data?.[0].items || []).map((r) => r.group))].sort();
  const authors = [...new Set((ref.data?.[1].items || []).map((b) => b.author))].sort((a, b) => a.localeCompare(b, 'ru'));
  const udcs = [...new Set((ref.data?.[1].items || []).map((b) => b.udc))].sort();
  const r = report.data;
  const items = (r?.items || []).slice().sort((a, b) => b.days_overdue - a.days_overdue);

  return (
    <section>
      <header className="page-head">
        <div>
          <h1>Отчёт «Просрочки»</h1>
          <p className="muted">Расчёт выполняется в 1С на дату среза. KPI — доля просроченных среди активных выдач с учётом фильтров группы, автора, УДК и периода.</p>
        </div>
        <a className="btn" href={'/api/reports/overdue/export' + qs(applied)} download>Экспорт в CSV</a>
      </header>
      <form className="card filters" onSubmit={(e) => { e.preventDefault(); setApplied(form); }}>
        <Field label="Дата расчёта"><input type="date" value={form.date} onChange={set('date')} required /></Field>
        <Field label="Выдано с"><input type="date" value={form.from} onChange={set('from')} /></Field>
        <Field label="по"><input type="date" value={form.to} onChange={set('to')} /></Field>
        <Field label="Группа"><select value={form.group} onChange={set('group')}><option value="">Все</option>{groups.map((g) => <option key={g}>{g}</option>)}</select></Field>
        <Field label="Автор"><select value={form.author} onChange={set('author')}><option value="">Все</option>{authors.map((g) => <option key={g}>{g}</option>)}</select></Field>
        <Field label="УДК"><select value={form.udc} onChange={set('udc')}><option value="">Все</option>{udcs.map((g) => <option key={g}>{g}</option>)}</select></Field>
        <Field label="Просрочка от, дн."><input type="number" min="1" value={form.min_days} onChange={set('min_days')} /></Field>
        <Field label="до, дн."><input type="number" min="1" value={form.max_days} onChange={set('max_days')} /></Field>
        <div className="field field-btn">
          <button className="btn btn-primary">Сформировать</button>
          <button type="button" className="btn btn-ghost" onClick={() => { setForm(EMPTY); setApplied(EMPTY); }}>Сбросить</button>
        </div>
      </form>
      <Loading state={report}>
        {r && <>
          <div className="kpis">
            <div className="kpi kpi-bad"><div className="kpi-value">{r.overdue_percent === null || r.overdue_percent === undefined ? '—' : String(r.overdue_percent.toFixed(2)).replace('.', ',') + '%'}</div><div className="kpi-label">{r.overdue_percent === null || r.overdue_percent === undefined ? 'Нет активных выдач' : 'доля просроченных выдач'}</div></div>
            <div className="kpi"><div className="kpi-value">{r.overdue_count}</div><div className="kpi-label">просроченных выдач</div></div>
            <div className="kpi"><div className="kpi-value">{r.active_count}</div><div className="kpi-label">активных выдач</div></div>
            <div className="kpi"><div className="kpi-value">{fmtDate(r.date)}</div><div className="kpi-label">дата расчёта</div></div>
          </div>
          <Stats s={stats.data} error={stats.error} />
          <h2 className="section-title">Просроченные выдачи</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Читатель</th><th>Группа</th><th>Книга</th><th>Автор</th><th>УДК</th><th>Выдана</th><th>Срок</th><th className="num">Дней просрочки</th></tr></thead>
              <tbody>
                {items.map((l) => (
                  <tr key={l.loan_id}>
                    <td>{l.full_name}<div className="muted small">{l.reader_id}</div></td>
                    <td>{l.group}</td>
                    <td><span className="mono">{l.book_code}</span> {l.title}</td>
                    <td>{l.author}</td>
                    <td className="mono">{l.udc}</td>
                    <td>{fmtDate(l.issue_date)}</td>
                    <td>{fmtDate(l.due_date)}</td>
                    <td className="num"><b>{l.days_overdue}</b></td>
                  </tr>
                ))}
                {!items.length && <tr><td colSpan={8} className="empty">Просроченных выдач по условиям отчёта нет</td></tr>}
              </tbody>
            </table>
          </div>
        </>}
      </Loading>
    </section>
  );
}

const num = (v) => (v === null || v === undefined ? '—' : String(Math.round(v * 100) / 100).replace('.', ','));

// Статистика просрочек (FR-19): средняя и медиана, ТОП читателей и изданий по сумме дней
function Stats({ s, error }) {
  if (error) return <p className="muted small">Статистика недоступна: {error}</p>;
  if (!s) return <p className="muted small">Расчёт статистики…</p>;
  return (
    <>
      <h2 className="section-title">Статистика просрочек</h2>
      <p className="muted small">По всем выдачам с просрочкой на дату расчёта: и по книгам на руках, и по возвращённым с опозданием ({s.count}). Фильтры отчёта учитываются.</p>
      <div className="kpis">
        <div className="kpi"><div className="kpi-value">{num(s.mean)}</div><div className="kpi-label">средняя просрочка, дн.</div></div>
        <div className="kpi"><div className="kpi-value">{num(s.median)}</div><div className="kpi-label">медиана просрочки, дн.</div></div>
      </div>
      <div className="stats">
        <div className="table-wrap">
          <table>
            <caption className="sr-only">ТОП читателей</caption>
            <thead><tr><th>ТОП-{s.top} читателей</th><th className="num">Выдач</th><th className="num">Сумма дней</th></tr></thead>
            <tbody>
              {s.top_readers.map((x) => <tr key={x.reader_id}><td>{x.full_name}<div className="muted small">{x.reader_id} · {x.group}</div></td><td className="num">{x.loans}</td><td className="num"><b>{x.days}</b></td></tr>)}
              {!s.top_readers.length && <tr><td colSpan={3} className="empty">Нет данных</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="table-wrap">
          <table>
            <caption className="sr-only">ТОП изданий</caption>
            <thead><tr><th>ТОП-{s.top} изданий</th><th className="num">Выдач</th><th className="num">Сумма дней</th></tr></thead>
            <tbody>
              {s.top_books.map((x) => <tr key={x.title + x.author}><td>{x.title}<div className="muted small">{x.author}</div></td><td className="num">{x.loans}</td><td className="num"><b>{x.days}</b></td></tr>)}
              {!s.top_books.length && <tr><td colSpan={3} className="empty">Нет данных</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
