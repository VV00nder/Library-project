import { useState } from 'react';
import { api } from '../api.js';
import { useLoad, Loading, Search, match, usePaged, TablePager } from '../ui.jsx';

const ENTITY = { 'Экземпляр': 'Книга', 'Читатель': 'Читатель', 'Выдача': 'Выдача', 'Поступление': 'Поступление', 'Списание': 'Списание' };

export default function Audit() {
  const log = useLoad(() => api.get('/api/audit'));
  const [q, setQ] = useState('');
  const [entity, setEntity] = useState('');
  const items = (log.data?.items || [])
    .filter((x) => !entity || x.entity === entity)
    .filter((x) => match(q, x.actor, x.key, x.action))
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const pg = usePaged(items, 50);
  const fmt = (ts) => { const d = new Date(ts); return Number.isNaN(+d) ? ts : d.toLocaleString('ru-RU'); };

  return (
    <section>
      <header className="page-head">
        <div>
          <h1>Журнал операций</h1>
          <p className="muted">Кто и когда изменил сведения о книгах, читателях, выдачах и учётных документах — включая операции бухгалтера в 1С.</p>
        </div>
      </header>
      <div className="toolbar">
        <select value={entity} onChange={(e) => setEntity(e.target.value)} aria-label="Объект">
          <option value="">Все объекты</option>
          {Object.entries(ENTITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <Search value={q} onChange={setQ} placeholder="Исполнитель или ключ" />
      </div>
      <Loading state={log}>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Время</th><th>Исполнитель</th><th>Объект</th><th>Ключ</th><th>Действие</th></tr></thead>
            <tbody>
              {pg.rows.map((x) => (
                <tr key={x.id}><td>{fmt(x.timestamp)}</td><td>{x.actor}</td><td>{ENTITY[x.entity] || x.entity}</td><td className="mono">{x.key}</td><td>{x.action}</td></tr>
              ))}
              {!items.length && <tr><td colSpan={5} className="empty">Записей нет</td></tr>}
            </tbody>
          </table>
        </div>
        <TablePager p={pg} />
      </Loading>
    </section>
  );
}
