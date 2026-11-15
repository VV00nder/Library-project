import { useEffect, useState } from 'react';
import { api, fmtDate } from '../api.js';
import Cover from './Cover.jsx';
import LinkTicket from './LinkTicket.jsx';

const REQ_TEXT = { 'Новая': 'Ждёт библиотекаря', 'Выдана': 'Книга выдана', 'Отклонена': 'Отклонена', 'Отменена': 'Вы отменили' };

export default function Cabinet({ user, books, onUser }) {
  const [tab, setTab] = useState('now');
  const [loans, setLoans] = useState(null);
  const [reqs, setReqs] = useState(null);
  const [error, setError] = useState('');

  const load = () => {
    if (!user.reader_id) { setLoans([]); setReqs([]); return; }
    api.get('/api/me/loans').then((r) => setLoans(r.items), (e) => setError(e.message));
    api.get('/api/requests').then((r) => setReqs(r.items), (e) => setError(e.message));
  };
  useEffect(load, [user.reader_id]);

  if (!user.reader_id) {
    return (
      <section className="cabinet">
        <h1>Мои книги</h1>
        <p className="muted">Учётная запись {user.login}</p>
        <LinkTicket onLinked={async () => { const me = await api.get('/api/auth/me'); onUser(me); }} />
      </section>
    );
  }

  const byTitle = (t, a) => books.find((b) => b.title === t && (!a || b.author === a)) || { title: t, author: a || '' };
  const active = (loans || []).filter((l) => l.active).sort((a, b) => a.due_date.localeCompare(b.due_date));
  const history = (loans || []).filter((l) => !l.active).sort((a, b) => b.issue_date.localeCompare(a.issue_date));
  const requests = (reqs || []).sort((a, b) => b.created.localeCompare(a.created));
  const openReqs = requests.filter((r) => r.status === 'Новая');
  const overdue = active.filter((l) => l.days_overdue > 0);

  const cancel = async (id) => {
    try { await api.post(`/api/requests/${encodeURIComponent(id)}/cancel`); load(); } catch (e) { setError(e.message); }
  };

  return (
    <section className="cabinet">
      <h1>Мои книги</h1>
      <dl className="profile">
        {user.full_name && <div><dt>Читатель</dt><dd>{user.full_name}</dd></div>}
        <div><dt>Читательский билет</dt><dd>{user.reader_id}</dd></div>
        {user.email_masked && <div><dt>E-mail для напоминаний</dt><dd>{user.email_masked}</dd></div>}
        <div><dt>Логин</dt><dd>{user.login}</dd></div>
      </dl>
      {overdue.length > 0 && (
        <p className="notice-bad" role="alert">
          {overdue.length === 1 ? 'Срок возврата одной книги прошёл. Верните её на абонемент, чтобы брать новые.' : `Срок возврата прошёл у ${overdue.length} книг. Верните их на абонемент, чтобы брать новые.`}
        </p>
      )}
      {error && <p className="take-err" role="alert">{error}</p>}

      <div className="tabs" role="tablist">
        {[['now', `На руках (${active.length})`], ['req', `Заявки (${openReqs.length})`], ['hist', 'История']].map(([k, t]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{t}</button>
        ))}
      </div>

      {tab === 'now' && (loans === null ? <p className="muted">Загрузка…</p> : active.length ? (
        <ul className="loan-list">
          {active.map((l) => (
            <li key={l.loan_id} className={l.days_overdue > 0 ? 'is-overdue' : ''}>
              <Cover book={byTitle(l.title, l.author)} size="xs" />
              <div className="loan-body">
                <b>{l.title}</b>
                <span className="muted">{l.author}</span>
                <span>Взята {fmtDate(l.issue_date)}</span>
              </div>
              <div className="loan-due">
                <span className="small muted">Вернуть до</span>
                <b>{fmtDate(l.due_date)}</b>
                {l.days_overdue > 0 && <span className="overdue-tag">просрочено на {l.days_overdue} дн.</span>}
              </div>
            </li>
          ))}
        </ul>
      ) : <div className="empty-state"><p>Сейчас у вас нет книг.</p><a className="btn-text" href="#/catalog?avail=1">Выбрать книгу</a></div>)}

      {tab === 'req' && (reqs === null ? <p className="muted">Загрузка…</p> : requests.length ? (
        <ul className="loan-list">
          {requests.map((r) => (
            <li key={r.request_id}>
              <Cover book={byTitle(r.title, r.author)} size="xs" />
              <div className="loan-body">
                <b>{r.title}</b>
                <span className="muted">{r.author}</span>
                <span className="small muted">Заявка {r.request_id} от {fmtDate(r.created.slice(0, 10))}</span>
                {r.comment && <span className="small">Комментарий библиотекаря: {r.comment}</span>}
              </div>
              <div className="loan-due">
                <span className={`req-status req-${r.status}`}>{REQ_TEXT[r.status] || r.status}</span>
                {r.status === 'Новая' && <button className="btn-text" onClick={() => cancel(r.request_id)}>Отменить заявку</button>}
              </div>
            </li>
          ))}
        </ul>
      ) : <div className="empty-state"><p>Заявок пока нет.</p><a className="btn-text" href="#/catalog">Перейти в каталог</a></div>)}

      {tab === 'hist' && (loans === null ? <p className="muted">Загрузка…</p> : history.length ? (
        <table className="hist">
          <thead><tr><th>Книга</th><th>Взята</th><th>Срок</th><th>Возвращена</th></tr></thead>
          <tbody>{history.map((l) => (
            <tr key={l.loan_id}><td><b>{l.title}</b><div className="muted small">{l.author}</div></td><td>{fmtDate(l.issue_date)}</td><td>{fmtDate(l.due_date)}</td><td>{l.lost_date ? 'Утеряна' : fmtDate(l.return_date)}</td></tr>
          ))}</tbody>
        </table>
      ) : <p className="muted">История пуста.</p>)}
    </section>
  );
}
