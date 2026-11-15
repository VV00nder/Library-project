import { useState } from 'react';
import { api, today, fmtDate, fmtMoney } from '../api.js';
import { useLoad, Loading, Alert, Field, Modal, Badge, Search, match } from '../ui.jsx';

const SOURCES = [['PURCHASE', 'Закупка'], ['DONATION', 'Дар'], ['DEMO', 'Демонстрационное']];
const META = { section: '', publisher: '', isbn: '', pages: '', cover_url: '', annotation: '' };
const EMPTY = { book_code: '', title: '', author: '', publication_year: '', udc: '', cost: '', received_date: today(), source: 'PURCHASE', ...META };
const SECTIONS = ['Художественная литература', 'Информатика и программирование', 'Математика', 'Физика', 'Экономика', 'Менеджмент и управление проектами', 'Языки и лингвистика', 'История', 'Философия'];

export default function Catalog({ user }) {
  const books = useLoad(() => api.get('/api/books'));
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [edit, setEdit] = useState(null);
  const [msg, setMsg] = useState('');
  const isLib = user.role === 'librarian';

  const items = (books.data?.items || [])
    .filter((b) => match(q, b.book_code, b.title, b.author, b.udc))
    .filter((b) => !status || b.status === status)
    .sort((a, b) => a.book_code.localeCompare(b.book_code));

  return (
    <section>
      <header className="page-head">
        <div>
          <h1>Фонд</h1>
          <p className="muted">Экземпляры фонда и описание изданий для сайта. Стоимость и поступление меняются только учётными документами в 1С.</p>
        </div>
        {isLib && <button className="btn btn-primary" onClick={() => setEdit({ ...EMPTY, isNew: true })}>Добавить экземпляр</button>}
      </header>
      <Alert kind="ok" onClose={() => setMsg('')}>{msg}</Alert>
      <div className="toolbar">
        <Search value={q} onChange={setQ} placeholder="Поиск по коду, названию, автору, УДК" />
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Статус">
          <option value="">Все статусы</option>
          {['Доступен', 'Выдан', 'Утерян', 'Списан'].map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>
      <Loading state={books}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Код</th><th>Название</th><th>Автор</th><th>Год</th><th>УДК</th>{isLib && <th className="num">Стоимость</th>}<th>Поступление</th><th>Статус</th>{isLib && <th />}</tr>
            </thead>
            <tbody>
              {items.map((b) => (
                <tr key={b.book_code}>
                  <td className="mono">{b.book_code}</td>
                  <td>{b.title}</td>
                  <td>{b.author}</td>
                  <td>{b.publication_year}</td>
                  <td className="mono">{b.udc}</td>
                  {isLib && <td className="num">{fmtMoney(b.cost)}</td>}
                  <td>{fmtDate(b.received_date)}</td>
                  <td><Badge>{b.status}</Badge></td>
                  {isLib && <td className="actions"><button className="btn btn-small" onClick={() => setEdit({ ...b })}>Изменить</button></td>}
                </tr>
              ))}
              {!items.length && <tr><td colSpan={9} className="empty">Ничего не найдено</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="muted small">Показано: {items.length} из {books.data?.total ?? 0}</p>
      </Loading>
      {edit && <BookForm book={edit} onClose={() => setEdit(null)} onSaved={(t) => { setEdit(null); setMsg(t); books.reload(); }} />}
    </section>
  );
}

function BookForm({ book, onClose, onSaved }) {
  const [f, setF] = useState({ ...META, ...book, pages: book.pages || '' });
  const meta = () => ({ section: f.section || '', publisher: (f.publisher || '').trim(), isbn: (f.isbn || '').trim(), pages: f.pages || 0, cover_url: (f.cover_url || '').trim(), annotation: (f.annotation || '').trim() });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      if (f.isNew) {
        await api.post('/api/books', { book_code: f.book_code.trim(), title: f.title.trim(), author: f.author.trim(), publication_year: f.publication_year, udc: f.udc.trim(), cost: f.cost, received_date: f.received_date, source: f.source, ...meta() });
        onSaved(`Экземпляр ${f.book_code} добавлен, поступление проведено в 1С`);
      } else {
        await api.patch(`/api/books/${encodeURIComponent(f.book_code)}`, { title: f.title.trim(), author: f.author.trim(), publication_year: f.publication_year, udc: f.udc.trim(), ...meta() });
        onSaved(`Карточка ${f.book_code} сохранена`);
      }
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <Modal title={f.isNew ? 'Новый экземпляр' : `Экземпляр ${f.book_code}`} onClose={onClose}>
      <form onSubmit={save} className="form-grid">
        <Field label="Код экземпляра"><input value={f.book_code} onChange={set('book_code')} required disabled={!f.isNew} maxLength={40} /></Field>
        <Field label="Год издания"><input type="number" min="1" max={new Date().getFullYear()} value={f.publication_year} onChange={set('publication_year')} required /></Field>
        <Field label="Название" wide><input value={f.title} onChange={set('title')} required maxLength={200} /></Field>
        <Field label="Автор"><input value={f.author} onChange={set('author')} required maxLength={200} /></Field>
        <Field label="УДК"><input value={f.udc} onChange={set('udc')} required maxLength={40} /></Field>
        <Field label="Раздел">
          <select value={f.section || ''} onChange={set('section')}><option value="">Определить по УДК</option>{SECTIONS.map((x) => <option key={x}>{x}</option>)}</select>
        </Field>
        <Field label="Издательство"><input value={f.publisher || ''} onChange={set('publisher')} maxLength={150} /></Field>
        <Field label="ISBN" hint="По ISBN подбирается обложка из Open Library"><input value={f.isbn || ''} onChange={set('isbn')} maxLength={20} pattern="[0-9Xx-]{10,17}" /></Field>
        <Field label="Страниц"><input type="number" min="0" value={f.pages} onChange={set('pages')} /></Field>
        <Field label="Ссылка на обложку" wide hint="Необязательно: https-адрес изображения"><input type="url" value={f.cover_url || ''} onChange={set('cover_url')} maxLength={300} placeholder="https://" /></Field>
        <Field label="Аннотация" wide><textarea rows={4} value={f.annotation || ''} onChange={set('annotation')} /></Field>
        {f.isNew && <>
          <Field label="Стоимость, ₽"><input type="number" min="0" step="0.01" value={f.cost} onChange={set('cost')} required /></Field>
          <Field label="Дата поступления"><input type="date" value={f.received_date} max={today()} onChange={set('received_date')} required /></Field>
          <Field label="Источник поступления" wide>
            <select value={f.source} onChange={set('source')}>{SOURCES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select>
          </Field>
        </>}
        <div className="field-wide"><Alert>{error}</Alert></div>
        <div className="form-actions field-wide">
          <button type="button" className="btn" onClick={onClose}>Отмена</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Сохранение…' : 'Сохранить'}</button>
        </div>
      </form>
    </Modal>
  );
}
