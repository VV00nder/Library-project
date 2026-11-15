import { useState } from 'react';
import { api } from '../api.js';
import { Alert, Field } from '../ui.jsx';

export default function Login({ onLogin, health }) {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try { onLogin(await api.post('/api/auth/login', { login, password })); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="login-wrap">
      <form className="login card" onSubmit={submit}>
        <div className="brand brand-login">
          <span className="logo" aria-hidden="true">Б</span>
          <div>
            <div className="brand-name">Библиус</div>
            <div className="brand-sub">Выдача книг и учёт просрочек</div>
          </div>
        </div>
        <Field label="Логин">
          <input value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" autoFocus required />
        </Field>
        <Field label="Пароль">
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </Field>
        <Alert>{error}</Alert>
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Вход…' : 'Войти'}</button>
        <p className="muted small center-text">
          {health === null ? 'Проверяем связь с 1С…' : health?.ok ? 'Связь с 1С установлена' : '1С недоступна — вход может не работать'}
        </p>
        <p className="muted small center-text">Бухгалтер работает в клиенте 1С.</p>
      </form>
    </div>
  );
}
