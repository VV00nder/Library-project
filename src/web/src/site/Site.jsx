import { useEffect, useMemo, useState } from 'react';
import { api, fmtDate } from '../api.js';
import Cover from './Cover.jsx';
import LoginDialog from './LoginDialog.jsx';
import Cabinet from './Cabinet.jsx';

// ---------- общие части ----------
export function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

export function Availability({ book, long }) {
  if (book.available > 0) {
    return (
      <span className="avail avail-yes">
        <span className="avail-dot" />
        {long ? `Свободно ${book.available} из ${book.copies}` : `Свободно ${book.available}`}
      </span>
    );
  }
  return <span className="avail avail-no"><span className="avail-dot" />Все экземпляры на руках</span>;
}

function BookCard({ book, note }) {
  return (
    <a className="book-card" href={`#/book/${book.key}`}>
      <Cover book={book} />
      <div className="book-card-body">
        <span className="book-card-title">{book.title}</span>
        <span className="book-card-author">{book.author}{book.year ? `, ${book.year}` : ''}</span>
        {note && <span className="book-card-note">{note}</span>}
        <Availability book={book} />
      </div>
    </a>
  );
}

const PER_PAGE = 24;
function Pager({ page, pages, onPage }) {
  if (pages <= 1) return null;
  const nums = [];
  for (let i = 1; i <= pages; i++) if (i === 1 || i === pages || Math.abs(i - page) <= 1) nums.push(i); else if (nums[nums.length - 1] !== '…') nums.push('…');
  return (
    <nav className="pager" aria-label="Страницы">
      <button disabled={page <= 1} onClick={() => onPage(page - 1)}>Назад</button>
      {nums.map((n, i) => n === '…' ? <span key={'g' + i} className="pager-gap">…</span> : (
        <button key={n} className={n === page ? 'on' : ''} aria-current={n === page ? 'page' : undefined} onClick={() => onPage(n)}>{n}</button>
      ))}
      <button disabled={page >= pages} onClick={() => onPage(page + 1)}>Вперёд</button>
    </nav>
  );
}

const TABS = [['', 'Главная'], ['catalog', 'Каталог'], ['new', 'Новые поступления'], ['popular', 'Популярное'], ['help', 'Как взять книгу']];
function Tabs({ route }) {
  const cur = route.startsWith('book/') ? 'catalog' : route;
  return (
    <nav className="site-tabs" aria-label="Разделы сайта">
      <div className="site-tabs-in">
        {TABS.map(([k, t]) => <a key={k} href={`#/${k}`} className={cur === k ? 'on' : ''} aria-current={cur === k ? 'page' : undefined}>{t}</a>)}
      </div>
    </nav>
  );
}

function Header({ user, query, onSearch, onLogin, onLogout }) {
  const [q, setQ] = useState(query || '');
  useEffect(() => setQ(query || ''), [query]);
  return (
    <header className="site-header">
      <div className="site-header-in">
        <a href="#/" className="site-logo" aria-label="Библиус — на главную">
          <span className="site-logo-mark" aria-hidden="true">Б</span>
          <span className="site-logo-text"><b>Библиус</b><small>Библиотека РТУ МИРЭА</small></span>
        </a>
        <form className="site-search" role="search" onSubmit={(e) => { e.preventDefault(); onSearch(q.trim()); }}>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Название, автор или ISBN" aria-label="Поиск по каталогу" />
          <button type="submit">Найти</button>
        </form>
        <nav className="site-nav" aria-label="Учётная запись">
          {!user && <button className="site-link" onClick={() => onLogin('register')}>Регистрация</button>}
          {!user && <button className="site-login" onClick={() => onLogin('login')}>Войти</button>}
          {user?.role === 'reader' && <a className="site-link" href="#/me">Мои книги</a>}
          {user?.role === 'librarian' && <a className="site-link" href="#/staff/requests">Рабочее место</a>}
          {user && <button className="site-link site-logout" onClick={onLogout} title={`Вы вошли как ${user.login}`}>Выйти</button>}
        </nav>
      </div>
    </header>
  );
}

// ---------- страницы ----------
function Home({ books, sections }) {
  const shelf = useMemo(() => books.filter((b) => b.cover_url).slice(0, 5), [books]);
  const fresh = useMemo(() => books.filter((b) => b.available > 0).slice(0, 12), [books]);
  const arrivals = useMemo(() => [...books].filter((b) => b.received_date).sort((a, b) => b.received_date.localeCompare(a.received_date)).slice(0, 6), [books]);
  return (
    <>
      <section className="hero">
        <div className="hero-text">
          <h1>Найдите книгу и заберите её на абонементе</h1>
          <p>Каталог показывает, сколько экземпляров сейчас свободно. Оставьте заявку — библиотекарь подготовит книгу к вашему приходу.</p>
          <p className="hero-stats">
            <span><b>{books.length}</b> {plural(books.length, 'издание', 'издания', 'изданий')} в каталоге</span>
            <span><b>{books.reduce((n, b) => n + b.available, 0)}</b> экземпляров можно взять сегодня</span>
          </p>
        </div>
        <div className="shelf" aria-hidden="true">
          {shelf.map((b, i) => <div key={b.key} className="shelf-book" style={{ '--i': i }}><Cover book={b} size="s" /></div>)}
        </div>
      </section>

      <section className="site-section">
        <h2>Разделы</h2>
        <div className="sections">
          {sections.map(([name, count]) => (
            <a key={name} className="section-chip" href={`#/catalog?section=${encodeURIComponent(name)}`}>
              <span>{name}</span><span className="section-count">{count}</span>
            </a>
          ))}
        </div>
      </section>

      <section className="site-section">
        <div className="section-head">
          <h2>Новые поступления</h2>
          <a href="#/new" className="more-link">Все новые книги</a>
        </div>
        <div className="book-grid">{arrivals.map((b) => <BookCard key={b.key} book={b} note={`Поступила ${fmtDate(b.received_date)}`} />)}</div>
      </section>

      <section className="site-section">
        <div className="section-head">
          <h2>Можно взять сейчас</h2>
          <a href="#/catalog?avail=1" className="more-link">Все свободные книги</a>
        </div>
        <div className="book-grid">{fresh.map((b) => <BookCard key={b.key} book={b} />)}</div>
      </section>
    </>
  );
}

function CatalogPage({ books, sections, params }) {
  const q = (params.get('q') || '').toLowerCase();
  const section = params.get('section') || '';
  const avail = params.get('avail') === '1';
  const sort = params.get('sort') || 'title';
  const page = Math.max(1, Number(params.get('page') || 1));
  const setParam = (k, v) => {
    const p = new URLSearchParams(params);
    if (v) p.set(k, v); else p.delete(k);
    if (k !== 'page') p.delete('page');
    location.hash = '#/catalog' + (p.toString() ? '?' + p : '');
  };
  let items = books.filter((b) =>
    (!q || [b.title, b.author, b.isbn, b.publisher].some((x) => String(x || '').toLowerCase().includes(q))) &&
    (!section || b.section === section) && (!avail || b.available > 0));
  items = [...items].sort((a, b) => sort === 'year' ? (b.year || 0) - (a.year || 0) : sort === 'author' ? a.author.localeCompare(b.author, 'ru') : a.title.localeCompare(b.title, 'ru'));

  return (
    <div className="catalog">
      <aside className="cat-filters" aria-label="Фильтры">
        <h2 className="filters-title">Разделы</h2>
        <ul className="filter-list">
          <li><button className={!section ? 'on' : ''} onClick={() => setParam('section', '')}>Все разделы</button></li>
          {sections.map(([name, count]) => (
            <li key={name}><button className={section === name ? 'on' : ''} onClick={() => setParam('section', name)}>{name} <span>{count}</span></button></li>
          ))}
        </ul>
        <label className="check"><input type="checkbox" checked={avail} onChange={(e) => setParam('avail', e.target.checked ? '1' : '')} /> Только свободные</label>
      </aside>
      <div className="catalog-main">
        <div className="catalog-head">
          <h1>{q ? `Поиск: «${params.get('q')}»` : section || 'Каталог'}</h1>
          <label className="sort">Сортировка
            <select value={sort} onChange={(e) => setParam('sort', e.target.value === 'title' ? '' : e.target.value)}>
              <option value="title">по названию</option>
              <option value="author">по автору</option>
              <option value="year">сначала новые издания</option>
            </select>
          </label>
        </div>
        <p className="muted">Найдено: {items.length} {plural(items.length, 'издание', 'издания', 'изданий')}</p>
        {items.length ? <>
          <div className="book-grid">{items.slice((page - 1) * PER_PAGE, page * PER_PAGE).map((b) => <BookCard key={b.key} book={b} />)}</div>
          <Pager page={page} pages={Math.ceil(items.length / PER_PAGE)} onPage={(n) => setParam('page', n > 1 ? String(n) : '')} />
        </> : (
          <div className="empty-state">
            <p>По этому запросу книг нет.</p>
            <p className="muted">Проверьте написание или поищите по фамилии автора.</p>
            <a href="#/catalog" className="btn-text">Показать весь каталог</a>
          </div>
        )}
      </div>
    </div>
  );
}

function BookPage({ book, user, onLogin }) {
  const [state, setState] = useState({ busy: false, msg: '', error: '' });
  if (!book) return <div className="empty-state"><p>Книга не найдена.</p><a href="#/catalog" className="btn-text">Вернуться в каталог</a></div>;

  const take = async () => {
    if (!user) { onLogin('login'); return; }
    if (user.role === 'reader' && !user.reader_id) { location.hash = '#/me'; return; }
    setState({ busy: true, msg: '', error: '' });
    try {
      const r = await api.post('/api/requests', { edition_key: book.key });
      setState({ busy: false, msg: `Заявка ${r.request_id} принята. Библиотекарь подготовит книгу — заберите её на абонементе. Статус заявки — в разделе «Мои книги».`, error: '' });
    } catch (e) { setState({ busy: false, msg: '', error: e.message }); }
  };

  const rows = [
    ['Автор', book.author], ['Раздел', book.section], ['Издательство', book.publisher], ['Год издания', book.year],
    ['Страниц', book.pages || ''], ['ISBN', book.isbn], ['УДК', book.udc], ['Экземпляров в фонде', book.copies],
  ].filter(([, v]) => v);

  return (
    <article className="book-page">
      <a href="#/catalog" className="back-link" onClick={(e) => { if (history.length > 1) { e.preventDefault(); history.back(); } }}>Назад к каталогу</a>
      <div className="book-layout">
        <div className="book-cover-col"><Cover book={book} size="l" /></div>
        <div className="book-info">
          <a className="book-section" href={`#/catalog?section=${encodeURIComponent(book.section)}`}>{book.section}</a>
          <h1 className="book-title">{book.title}</h1>
          <p className="book-author">{book.author}{book.year ? `, ${book.year}` : ''}</p>

          <div className="take-box">
            <Availability book={book} long />
            {user?.role === 'librarian' ? (
              <p className="muted small">Вы вошли как библиотекарь: выдача оформляется в рабочем месте.</p>
            ) : (
              <>
                <button className="take-btn" onClick={take} disabled={state.busy || !!state.msg}>
                  {state.busy ? 'Отправляем заявку…' : state.msg ? 'Заявка отправлена' : user?.role === 'reader' && !user.reader_id ? 'Привязать билет' : 'Взять почитать'}
                </button>
                <p className="muted small">
                  {!user ? 'Чтобы оставить заявку, войдите или зарегистрируйтесь.' : !user.reader_id ? 'Сначала привяжите читательский билет в разделе «Мои книги».' : 'Библиотекарь получит заявку и подготовит книгу к выдаче.'}
                  {book.available === 0 && ' Сейчас все экземпляры на руках — заявка встанет в очередь.'}
                </p>
              </>
            )}
            {state.msg && <p className="take-ok" role="status">{state.msg}</p>}
            {state.error && <p className="take-err" role="alert">{state.error}</p>}
          </div>

          {book.annotation && <><h2 className="book-h2">Аннотация</h2><p className="annotation">{book.annotation}</p></>}
          <h2 className="book-h2">О книге</h2>
          <dl className="book-facts">{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
        </div>
      </div>
    </article>
  );
}

function NewArrivals({ books }) {
  const items = useMemo(() => [...books].filter((b) => b.received_date).sort((a, b) => b.received_date.localeCompare(a.received_date) || a.title.localeCompare(b.title, 'ru')), [books]);
  const groups = useMemo(() => {
    const m = new Map();
    for (const b of items) {
      const k = b.received_date.slice(0, 7);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(b);
    }
    return [...m.entries()];
  }, [items]);
  const monthName = (ym) => { const [y, m] = ym.split('-'); return `${['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'][+m - 1]} ${y}`; };
  return (
    <section>
      <h1 className="page-title">Новые поступления</h1>
      <p className="muted lead">Книги, которые недавно поступили в фонд библиотеки.</p>
      {groups.map(([ym, list]) => (
        <div key={ym} className="month-group">
          <h2 className="month-title">{monthName(ym)}</h2>
          <div className="book-grid">{list.map((b) => <BookCard key={b.key} book={b} note={`Поступила ${fmtDate(b.received_date)}`} />)}</div>
        </div>
      ))}
    </section>
  );
}

function Popular({ books }) {
  const items = useMemo(() => [...books].filter((b) => b.loans_count > 0).sort((a, b) => b.loans_count - a.loans_count || a.title.localeCompare(b.title, 'ru')).slice(0, 18), [books]);
  return (
    <section>
      <h1 className="page-title">Популярное</h1>
      <p className="muted lead">Книги, которые читатели берут чаще всего.</p>
      {items.length ? <div className="book-grid">{items.map((b) => <BookCard key={b.key} book={b} note={`Брали ${b.loans_count} ${plural(b.loans_count, 'раз', 'раза', 'раз')}`} />)}</div>
        : <p className="muted">Пока недостаточно выдач, чтобы составить подборку.</p>}
    </section>
  );
}

function Help({ onLogin, user }) {
  return (
    <article className="help">
      <h1 className="page-title">Как взять книгу</h1>
      <ol className="steps">
        <li><h2>Найдите книгу</h2><p>Воспользуйтесь поиском или разделами каталога. На карточке книги видно, сколько экземпляров сейчас свободно.</p></li>
        <li><h2>Войдите и привяжите читательский билет</h2><p>Зарегистрируйтесь на сайте и в разделе «Мои книги» укажите номер читательского билета. Код подтверждения придёт на e-mail, который указан в вашей карточке читателя.</p>
          {!user && <p><button className="btn-inline" onClick={() => onLogin('register')}>Зарегистрироваться</button></p>}</li>
        <li><h2>Нажмите «Взять почитать»</h2><p>Заявка попадёт к библиотекарю. Одновременно можно оформить до пяти заявок. Статус заявки виден в разделе «Мои книги».</p></li>
        <li><h2>Заберите книгу на абонементе</h2><p>Библиотекарь оформит выдачу и назовёт срок возврата. Срок и все ваши книги всегда видны в разделе «Мои книги».</p></li>
        <li><h2>Верните вовремя</h2><p>За 3 дня до срока придёт напоминание на e-mail. Если срок прошёл, книга отмечается как просроченная, а на почту приходит письмо.</p></li>
      </ol>
      <h2 className="help-h2">Абонемент</h2>
      <dl className="book-facts help-facts">
        <div><dt>Адрес</dt><dd>Москва, пр-т Вернадского, 78, корпус А, ауд. А-120</dd></div>
        <div><dt>Часы работы</dt><dd>Пн–Пт 9:30–18:00, Сб 10:00–16:00, Вс — выходной</dd></div>
        <div><dt>Телефон</dt><dd>+7 (495) 000-00-00, доб. 120</dd></div>
        <div><dt>E-mail</dt><dd>abonement@biblius.example</dd></div>
      </dl>
    </article>
  );
}

// ---------- сайт ----------
export default function Site({ route, params, user, onUser }) {
  const [books, setBooks] = useState(null);
  const [error, setError] = useState('');
  const [login, setLogin] = useState(null);

  useEffect(() => {
    api.get('/api/public/catalog').then((r) => setBooks(r.items), (e) => setError(e.message));
  }, [route]);

  const sections = useMemo(() => {
    const m = new Map();
    for (const b of books || []) m.set(b.section, (m.get(b.section) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [books]);

  const search = (q) => { location.hash = '#/catalog' + (q ? '?q=' + encodeURIComponent(q) : ''); };
  const logout = async () => { await api.post('/api/auth/logout').catch(() => {}); onUser(null); location.hash = '#/'; };

  let page;
  if (error) page = <div className="empty-state"><p>Каталог временно недоступен.</p><p className="muted">{error}</p></div>;
  else if (!books) page = <p className="muted loading">Загружаем каталог…</p>;
  else if (route === 'catalog') page = <CatalogPage books={books} sections={sections} params={params} />;
  else if (route.startsWith('book/')) page = <BookPage key={route} book={books.find((b) => b.key === route.slice(5))} user={user} onLogin={setLogin} />;
  else if (route === 'new') page = <NewArrivals books={books} />;
  else if (route === 'popular') page = <Popular books={books} />;
  else if (route === 'help') page = <Help onLogin={setLogin} user={user} />;
  else if (route === 'me') page = user?.role === 'reader' ? <Cabinet user={user} books={books} onUser={onUser} /> : <div className="empty-state"><p>Войдите, чтобы увидеть свои книги.</p><button className="take-btn" onClick={() => setLogin('login')}>Войти</button></div>;
  else page = <Home books={books} sections={sections} />;

  return (
    <div className="site">
      <a className="skip" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}>К содержимому</a>
      <Header user={user} query={params.get('q')} onSearch={search} onLogin={setLogin} onLogout={logout} />
      <Tabs route={route} />
      <main id="main" tabIndex={-1} className="site-main">{page}</main>
      <footer className="site-footer">
        <div className="site-footer-in">
          <span>Библиус — информационная система библиотеки РТУ МИРЭА</span>
          <span>Книги выдаются на абонементе по читательскому билету</span>
        </div>
      </footer>
      {login && <LoginDialog initialMode={login} onClose={() => setLogin(null)} onLogin={(u, registered) => {
        setLogin(null); onUser(u);
        if (u.role === 'librarian') location.hash = '#/staff/requests';
        else if (registered || !u.reader_id) location.hash = '#/me';
      }} />}
    </div>
  );
}
