import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import { api } from './api.js';
import Site from './site/Site.jsx';
import Catalog from './pages/Catalog.jsx';
import Readers from './pages/Readers.jsx';
import Circulation from './pages/Circulation.jsx';
import Loans from './pages/Loans.jsx';
import Overdue from './pages/Overdue.jsx';
import Import from './pages/Import.jsx';
import Audit from './pages/Audit.jsx';
import Notifications from './pages/Notifications.jsx';
import Requests from './pages/Requests.jsx';

// Рабочее место библиотекаря
const STAFF_PAGES = [
  ['requests', 'Заявки читателей', Requests],
  ['circulation', 'Выдача и возврат', Circulation],
  ['loans', 'Выдачи и просрочки', Loans],
  ['catalog', 'Фонд', Catalog],
  ['readers', 'Читатели', Readers],
  ['overdue', 'Отчёт «Просрочки»', Overdue],
  ['notifications', 'Уведомления', Notifications],
  ['import', 'Импорт CSV', Import],
  ['audit', 'Журнал операций', Audit],
];

// Маршрут из адреса: #/book/KEY, #/catalog?q=…, #/staff/requests
function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, query = ''] = raw.split('?');
  return { route: decodeURIComponent(path || ''), params: new URLSearchParams(query) };
}

function useRoute() {
  const [r, setR] = useState(parseHash);
  useEffect(() => {
    const on = () => { setR(parseHash()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return r;
}

function Staff({ user, page, onLogout, health }) {
  const [id, , Page] = STAFF_PAGES.find((p) => p[0] === page) || STAFF_PAGES[0];
  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <span className="logo" aria-hidden="true">Б</span>
          <div>
            <div className="brand-name">Библиус</div>
            <div className="brand-sub">Рабочее место библиотекаря</div>
          </div>
        </div>
        <nav>
          {STAFF_PAGES.map(([pid, title]) => (
            <a key={pid} href={`#/staff/${pid}`} className={pid === id ? 'active' : ''} aria-current={pid === id ? 'page' : undefined}>{title}</a>
          ))}
          <a href="#/" className="nav-site">Сайт библиотеки</a>
        </nav>
        <div className="sidebar-foot">
          <div className={`conn ${health?.ok ? 'conn-ok' : 'conn-bad'}`} title="Связь сервера приложения с 1С">
            <span className="dot" /> {health === null ? 'Проверка связи с 1С…' : health.ok ? '1С на связи' : '1С недоступна'}
          </div>
          <div className="user"><div><b>{user.login}</b></div><div className="muted small">Библиотекарь</div></div>
          <button className="btn btn-ghost" onClick={onLogout}>Выйти</button>
        </div>
      </aside>
      <main className="content"><Page user={user} key={id} /></main>
    </div>
  );
}

function App() {
  const [user, setUser] = useState(undefined);
  const [health, setHealth] = useState(null);
  const { route, params } = useRoute();

  useEffect(() => {
    api.get('/api/auth/me').then(setUser, () => setUser(null));
    api.get('/api/health').then(setHealth, () => setHealth({ ok: false }));
  }, []);

  if (user === undefined) return <div className="center muted">Загрузка…</div>;

  if (route.startsWith('staff')) {
    if (user?.role === 'librarian') {
      const logout = async () => { await api.post('/api/auth/logout').catch(() => {}); setUser(null); location.hash = '#/'; };
      return <Staff user={user} page={route.split('/')[1]} onLogout={logout} health={health} />;
    }
    location.hash = '#/';
    return null;
  }
  return <Site route={route} params={params} user={user} onUser={setUser} />;
}

createRoot(document.getElementById('root')).render(<App />);
