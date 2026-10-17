'use client';
import { useEffect, useRef, useState } from 'react';

// Pop-up pesan untuk owner (logout otomatis ditunda, hasil backup otomatis, dll.).
export default function OwnerNotices() {
  const [items, setItems] = useState([]);
  const seen = useRef(new Set());

  useEffect(() => {
    let stop = false;
    async function poll() {
      try {
        const r = await fetch('/api/notices');
        if (!r.ok || stop) return;
        const rows = await r.json();
        setItems((cur) => {
          const have = new Set(cur.map((x) => x.id));
          const fresh = rows.filter((x) => !have.has(x.id) && !seen.current.has(x.id));
          return fresh.length ? [...fresh.reverse(), ...cur].slice(0, 5) : cur;
        });
      } catch {}
    }
    poll();
    const t = setInterval(poll, 20000);
    return () => { stop = true; clearInterval(t); };
  }, []);

  function close(id) {
    seen.current.add(id);
    setItems((cur) => cur.filter((x) => x.id !== id));
    fetch('/api/notices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [id] }) }).catch(() => {});
  }

  if (!items.length) return null;
  return (
    <div className="toasts">
      {items.map((n) => (
        <div key={n.id} className={`alert ${n.kind === 'err' ? 'err' : n.kind === 'ok' ? 'ok' : ''} toast`}>
          <div style={{ flex: 1 }}>
            <b>{n.kind === 'err' ? 'Gagal' : n.kind === 'ok' ? 'Info' : 'Perhatian'}</b> · <span className="muted">{n.created_at.slice(11, 16)}</span>
            <div>{n.message}</div>
          </div>
          <button className="secondary" onClick={() => close(n.id)}>Tutup</button>
        </div>
      ))}
    </div>
  );
}
