import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

export default function LoginDialog({ onClose, onLogin, initialMode = 'login' }) {
  const [mode, setMode] = useState(initialMode);
  const [f, setF] = useState({ name: '', login: '', password: '', password2: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const isReg = mode === 'register';

  useEffect(() => {
    ref.current?.focus();
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, mode]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (isReg && f.password !== f.password2) { setError('Пароли не совпадают'); return; }
    setBusy(true);
    try {
      const u = isReg
        ? await api.post('/api/auth/register', { name: f.name.trim(), login: f.login.trim(), password: f.password })
        : await api.post('/api/auth/login', { login: f.login.trim(), password: f.password });
      onLogin(u, isReg);
    } catch (err) { setError(err.status === 401 ? 'Неверный логин или пароль' : err.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="dialog" role="dialog" aria-modal="true" aria-labelledby="login-title" onSubmit={submit}>
        <button type="button" className="dialog-close" onClick={onClose} aria-label="Закрыть">×</button>
        <div className="dialog-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={!isReg} className={!isReg ? 'on' : ''} onClick={() => { setMode('login'); setError(''); }}>Вход</button>
          <button type="button" role="tab" aria-selected={isReg} className={isReg ? 'on' : ''} onClick={() => { setMode('register'); setError(''); }}>Регистрация</button>
        </div>
        <h2 id="login-title">{isReg ? 'Новая учётная запись' : 'Вход в библиотеку'}</h2>
        <p className="muted">{isReg
          ? 'После регистрации привяжите читательский билет в разделе «Мои книги»: код придёт на e-mail из карточки читателя.'
          : 'Читатели и сотрудники входят по своему логину и паролю.'}</p>
        {isReg && (
          <label className="site-field">Как к вам обращаться
            <input ref={ref} value={f.name} onChange={set('name')} maxLength={200} autoComplete="name" />
          </label>
        )}
        <label className="site-field">Логин
          <input ref={isReg ? undefined : ref} value={f.login} onChange={set('login')} autoComplete="username" required
            pattern={isReg ? '[A-Za-z0-9._\\-]{3,40}' : undefined} title={isReg ? 'От 3 до 40 латинских букв, цифр, точек, дефисов и подчёркиваний' : undefined} />
        </label>
        <label className="site-field">Пароль
          <input type="password" value={f.password} onChange={set('password')} autoComplete={isReg ? 'new-password' : 'current-password'} required minLength={isReg ? 8 : undefined} />
          {isReg && <span className="field-note">Не короче 8 символов</span>}
        </label>
        {isReg && (
          <label className="site-field">Пароль ещё раз
            <input type="password" value={f.password2} onChange={set('password2')} autoComplete="new-password" required />
          </label>
        )}
        {error && <p className="take-err" role="alert">{error}</p>}
        <button className="take-btn take-btn-block" disabled={busy}>{busy ? (isReg ? 'Создаём…' : 'Входим…') : isReg ? 'Зарегистрироваться' : 'Войти'}</button>
        <p className="muted small">
          {isReg ? <>Уже есть учётная запись? <button type="button" className="btn-inline" onClick={() => setMode('login')}>Войти</button></>
            : <>Ещё нет учётной записи? <button type="button" className="btn-inline" onClick={() => setMode('register')}>Зарегистрироваться</button></>}
        </p>
      </form>
    </div>
  );
}
