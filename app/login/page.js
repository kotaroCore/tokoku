'use client';
import { useState } from 'react';

export default function Login() {
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    const f = new FormData(e.target);
    const r = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: f.get('username'), password: f.get('password') }),
    });
    if (r.ok) {
      window.location.href = '/';
    } else {
      setErr((await r.json()).error || 'Gagal masuk');
      setBusy(false);
    }
  }

  return (
    <form className="card login" onSubmit={submit}>
      <h1>Tokoku</h1>
      <p className="muted">Masuk untuk memulai shift.</p>
      <div className="field">
        <label>Username</label>
        <input name="username" autoFocus required />
      </div>
      <div className="field">
        <label>Password</label>
        <input name="password" type="password" required />
      </div>
      {err && <div className="alert err">{err}</div>}
      <button disabled={busy} style={{ width: '100%' }}>Masuk</button>
    </form>
  );
}
