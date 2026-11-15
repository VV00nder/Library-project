import { useEffect, useState, useCallback } from 'react';

// Загрузка данных с состоянием «загрузка / ошибка / данные».
export function useLoad(loader, deps = []) {
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const reload = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: null }));
    loader().then((data) => setState({ loading: false, error: null, data }), (e) => setState({ loading: false, error: e.message, data: null }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { reload(); }, [reload]);
  return { ...state, reload };
}

export function Alert({ kind = 'error', children, onClose }) {
  if (!children) return null;
  return (
    <div className={`alert alert-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      <span>{children}</span>
      {onClose && <button className="alert-close" onClick={onClose} aria-label="Закрыть">×</button>}
    </div>
  );
}

export function Loading({ state, children }) {
  if (state.loading && !state.data) return <p className="muted">Загрузка…</p>;
  if (state.error) return <Alert>{state.error}</Alert>;
  return children;
}

export function Field({ label, children, hint, wide }) {
  return (
    <label className={`field${wide ? ' field-wide' : ''}`}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function Modal({ title, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Закрыть">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

const STATUS_CLASS = {
  'Доступен': 'ok', 'Возвращена': 'ok', 'Выдан': 'info', 'Активна': 'info',
  'Утерян': 'warn', 'Утеряна': 'warn', 'Списан': 'muted', 'Просрочена': 'bad',
};
export function Badge({ children }) {
  return <span className={`badge badge-${STATUS_CLASS[children] || 'muted'}`}>{children}</span>;
}

export function Search({ value, onChange, placeholder }) {
  return <input className="search" type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} />;
}

export const match = (q, ...vals) => !q || vals.some((v) => String(v ?? '').toLowerCase().includes(q.toLowerCase()));

// Постраничный вывод таблиц рабочего места
export function usePaged(items, per = 50) {
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(items.length / per));
  const cur = Math.min(page, pages);
  return { rows: items.slice((cur - 1) * per, cur * per), page: cur, pages, setPage, total: items.length, per };
}

export function TablePager({ p }) {
  if (p.pages <= 1) return null;
  return (
    <div className="table-pager">
      <span className="muted small">Строки {(p.page - 1) * p.per + 1}–{Math.min(p.page * p.per, p.total)} из {p.total}</span>
      <button className="btn btn-small" disabled={p.page <= 1} onClick={() => p.setPage(p.page - 1)}>Назад</button>
      <span className="small">Страница {p.page} из {p.pages}</span>
      <button className="btn btn-small" disabled={p.page >= p.pages} onClick={() => p.setPage(p.page + 1)}>Вперёд</button>
    </div>
  );
}
