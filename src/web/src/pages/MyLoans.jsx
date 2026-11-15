import { api, fmtDate } from '../api.js';
import { useLoad, Loading, Badge } from '../ui.jsx';

export default function MyLoans({ user }) {
  const loans = useLoad(() => api.get('/api/me/loans'));
  const items = (loans.data?.items || []).sort((a, b) => Number(b.active) - Number(a.active) || b.issue_date.localeCompare(a.issue_date));
  const active = items.filter((l) => l.active);
  const overdue = active.filter((l) => l.days_overdue > 0);

  return (
    <section>
      <header className="page-head">
        <div>
          <h1>Мои выдачи</h1>
          <p className="muted">Читательский билет {user.reader_id}</p>
        </div>
      </header>
      <Loading state={loans}>
        {overdue.length > 0 && (
          <div className="alert alert-error" role="alert">
            Просрочено книг: {overdue.length}. Пожалуйста, верните их в библиотеку.
          </div>
        )}
        <div className="kpis">
          <div className="kpi"><div className="kpi-value">{active.length}</div><div className="kpi-label">книг на руках</div></div>
          <div className={`kpi ${overdue.length ? 'kpi-bad' : 'kpi-ok'}`}><div className="kpi-value">{overdue.length}</div><div className="kpi-label">просрочено</div></div>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Книга</th><th>Автор</th><th>Выдана</th><th>Вернуть до</th><th>Возвращена</th><th>Статус</th></tr></thead>
            <tbody>
              {items.map((l) => (
                <tr key={l.loan_id} className={l.active && l.days_overdue > 0 ? 'row-bad' : ''}>
                  <td>{l.title}</td>
                  <td>{l.author}</td>
                  <td>{fmtDate(l.issue_date)}</td>
                  <td><b>{fmtDate(l.due_date)}</b></td>
                  <td>{fmtDate(l.return_date || l.lost_date)}</td>
                  <td>{l.active && l.days_overdue > 0 ? <><Badge>Просрочена</Badge> <span className="small">на {l.days_overdue} дн.</span></> : <Badge>{l.active ? 'Активна' : l.status}</Badge>}</td>
                </tr>
              ))}
              {!items.length && <tr><td colSpan={6} className="empty">У вас пока не было выдач</td></tr>}
            </tbody>
          </table>
        </div>
      </Loading>
    </section>
  );
}
