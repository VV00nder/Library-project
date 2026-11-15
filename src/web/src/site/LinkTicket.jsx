import { useState } from 'react';
import { api } from '../api.js';

// Привязка читательского билета: код подтверждения отправляется на e-mail из карточки читателя в 1С.
export default function LinkTicket({ onLinked }) {
  const [step, setStep] = useState('ticket');
  const [ticket, setTicket] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [outbox, setOutbox] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const start = async (e) => {
    e?.preventDefault();
    setBusy(true); setError('');
    try {
      const r = await api.post('/api/me/link/start', { reader_id: ticket.trim() });
      setSentTo(r.sent_to); setOutbox(r.mode === 'outbox'); setStep('code');
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  const confirm = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try { onLinked(await api.post('/api/me/link/confirm', { code: code.trim() })); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <div className="link-card">
      <h2>Привяжите читательский билет</h2>
      <p className="muted">Без билета можно смотреть каталог, но нельзя оставлять заявки и видеть свои книги. Номер билета указан на билете и в карточке читателя, например R-0001.</p>
      {step === 'ticket' ? (
        <form className="link-form" onSubmit={start}>
          <label className="site-field">Номер читательского билета
            <input value={ticket} onChange={(e) => setTicket(e.target.value)} required maxLength={40} autoComplete="off" />
          </label>
          <button className="take-btn" disabled={busy}>{busy ? 'Отправляем код…' : 'Получить код'}</button>
        </form>
      ) : (
        <form className="link-form" onSubmit={confirm}>
          <p>Код отправлен на <b>{sentTo}</b> — адрес из карточки читателя. Код действует 10 минут.</p>
          {outbox && <p className="field-note">Почтовый ящик стенда не подключён: письмо сохранено в папке server\outbox, библиотекарь видит его в разделе «Уведомления».</p>}
          <label className="site-field">Код из письма
            <input value={code} onChange={(e) => setCode(e.target.value)} required inputMode="numeric" pattern="\d{6}" maxLength={6} autoComplete="one-time-code" />
          </label>
          <div className="link-actions">
            <button className="take-btn" disabled={busy}>{busy ? 'Проверяем…' : 'Подтвердить'}</button>
            <button type="button" className="btn-inline" onClick={() => { setStep('ticket'); setCode(''); setError(''); }}>Указать другой билет</button>
            <button type="button" className="btn-inline" onClick={start} disabled={busy}>Отправить код ещё раз</button>
          </div>
        </form>
      )}
      {error && <p className="take-err" role="alert">{error}</p>}
      <p className="muted small">Если в карточке нет e-mail или он устарел, обратитесь на абонемент.</p>
    </div>
  );
}
