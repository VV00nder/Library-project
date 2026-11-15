import { useState } from 'react';

// Цвета «переплёта» для книг без фото обложки — по разделу.
const BINDINGS = {
  'Художественная литература': '#7a2e35',
  'Информатика и программирование': '#1f3d5c',
  'Математика': '#2d5a43',
  'Физика': '#38506b',
  'Экономика': '#8a6420',
  'Менеджмент и управление проектами': '#56405f',
  'Языки и лингвистика': '#1e5b5b',
  'История': '#7b4a2c',
  'Философия': '#4a4f2a',
};
export const bindingColor = (section) => BINDINGS[section] || '#3d4652';

function sources(book) {
  const list = [];
  if (book.cover_url) list.push(book.cover_url);
  const isbn = (book.isbn || '').replace(/[^0-9Xx]/g, '');
  if (isbn) list.push(`https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg?default=false`);
  return list;
}

export default function Cover({ book, size = 'm' }) {
  const list = sources(book);
  const [idx, setIdx] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const src = list[idx];

  return (
    <div className={`cover cover-${size}`} style={{ '--binding': bindingColor(book.section) }}>
      {(!src || !loaded) && (
        <div className="cover-cloth" aria-hidden={!!src}>
          <span className="cover-author">{book.author}</span>
          <span className="cover-title">{book.title}</span>
          <span className="cover-mark">Б</span>
        </div>
      )}
      {src && (
        <img
          key={src}
          src={src}
          alt={`Обложка: ${book.title}`}
          loading="lazy"
          className={loaded ? 'is-loaded' : ''}
          onLoad={(e) => (e.currentTarget.naturalWidth > 1 ? setLoaded(true) : (setLoaded(false), setIdx(idx + 1)))}
          onError={() => { setLoaded(false); setIdx(idx + 1); }}
        />
      )}
    </div>
  );
}
