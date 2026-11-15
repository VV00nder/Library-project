import { useState } from 'react';
import { api, today, fmtDate } from '../api.js';
import { useLoad, Loading, Badge, Search, match, usePaged, TablePager } from '../ui.jsx';

const FILTERS = [['', 'Все'], ['active', 'На руках'], ['overdue', 'Просроченные'], ['closed', 'Закрытые']];

export default function Loans() {
  const [date, setDate] = useState(today());
  const loans = useLoad(() => api.get(`/api/loans?date=${date}`), [date]);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('');

  const all = loans.data?.items || [];
  const items = all
    .filter((l) => match(q, l.loan_id, l.book_code, l.title, l.full_name, l.reader_id, l.group))
    .filter((l) => !filter || (filter === 'active' && l.active) || (filter === 'overdue' && l.active && l.days_overdue > 0) || (filter === 'closed' && !l.active))
    .sort((a, b) => b.issue_date.localeCompare(a.issue_date));
  const pg = usePaged(items, 50);
  const activeCount = all.filter((l) => l.active).length;
  const overdueCount = all.filter((l) => l.active && l.days_overdue > 0).length;

  return (
    <section>
      <header className="page-head">
        <div>
          <h1>Выдачи и просрочки</h1>
          <p className="muted">Состояние выдач на выбранную дату. Просрочка считается в 1С.</p>
        </div>
      </header>
      <div className="kpis">
        <div className="kpi"><div className="kpi-value">{activeCount}</div><div className="kpi-label">на руках</div></div>
        <div className="kpi kpi-bad"><div className="kpi-value">{overdueCount}</div><div className="kpi-label">просрочено</div></div>
        <div className="kpi"><div className="kpi-value">{activeCount ? ((overdueCount / activeCount) * 100).toFixed(2).replace('.', ',') + '%' : '—'}</div><div className="kpi-label">доля просроченных</div></div>
      </div>
      <div className="toolbar">
        <label className="inline">На дату <input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <div className="seg" role="group" aria-label="Фильтр">
          {FILTERS.map(([k, t]) => <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{t}</button>)}
        </div>
        <Search value={q} onChange={setQ} placeholder="Поиск" />
      </div>
      <Loading state={loans}>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Выдача</th><th>Книга</th><th>Читатель</th><th>Выдана</th><th>Срок</th><th>Закрыта</th><th>Статус</th><th className="num">Дней просрочки</th></tr></thead>
            <tbody>
              {pg.rows.map((l) => (
                <tr key={l.loan_id} className={l.active && l.days_overdue > 0 ? 'row-bad' : ''}>
                  <td className="mono">{l.loan_id}</td>
                  <td><span className="mono">{l.book_code}</span> {l.title}</td>
                  <td>{l.full_name}<div className="muted small">{l.group}</div></td>
                  <td>{fmtDate(l.issue_date)}</td>
                  <td>{fmtDate(l.due_date)}</td>
                  <td>{fmtDate(l.return_date || l.lost_date)}</td>
                  <td><Badge>{l.active && l.days_overdue > 0 ? 'Просрочена' : l.active ? 'Активна' : l.status}</Badge></td>
                  <td className="num">{l.days_overdue || '—'}</td>
                </tr>
              ))}
              {!items.length && <tr><td colSpan={8} className="empty">Нет выдач</td></tr>}
            </tbody>
          </table>
        </div>
        <TablePager p={pg} />
      </Loading>
    </section>
  );
}
