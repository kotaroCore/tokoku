'use client';
import { useEffect, useRef, useState } from 'react';
import { isBusy } from '@/lib/busy';

const WARN_SECS = 60; // peringatan muncul sekian detik sebelum keluar otomatis

// Logout otomatis bila tidak ada aktivitas. Server yang memutuskan (action: ok | defer | logout),
// sehingga beberapa tab tidak saling mematikan dan transaksi yang sedang jalan tidak terputus.
export default function IdleGuard({ enabled, minutes }) {
  const cfg = useRef({ enabled, minutes });
  const last = useRef(Date.now());
  const lastPing = useRef(0);
  const lastBeat = useRef(0);
  const lastLimit = useRef(0);
  const inflight = useRef(false);
  const warned = useRef(false);
  const [left, setLeft] = useState(null);

  useEffect(() => {
    const toLogin = () => { window.location.href = '/login?idle=1'; };

    async function ping(body) {
      try {
        const r = await fetch('/api/ping', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (r.status === 401) { toLogin(); return null; }
        if (!r.ok) return null;
        const d = await r.json();
        cfg.current = { enabled: d.enabled, minutes: d.minutes };
        return d;
      } catch {
        return null;
      }
    }

    // Selaraskan dengan server: tab lain mungkin sedang dipakai.
    const sync = (d) => {
      if (d && Date.now() - last.current > d.idleSeconds * 1000 + 5000) last.current = Date.now() - d.idleSeconds * 1000;
    };

    function activity() {
      const now = Date.now();
      last.current = now;
      warned.current = false;
      setLeft((v) => (v === null ? v : null));
      if (now - lastPing.current > 20000) {
        lastPing.current = now;
        ping({ activity: true, busy: isBusy() });
      }
    }

    async function tick() {
      if (inflight.current) return;
      const now = Date.now();
      const busy = isBusy();
      if (busy && now - lastBeat.current > 60000) {
        lastBeat.current = now;
        lastPing.current = now;
        ping({ busy: true });
      }
      const { enabled: on, minutes: min } = cfg.current;
      if (!on) { setLeft(null); return; }
      const limit = min * 60;
      const idle = (now - last.current) / 1000;

      if (idle >= limit) {
        if (now - lastLimit.current < 15000) return;
        lastLimit.current = now;
        inflight.current = true;
        const d = await ping({ busy, atLimit: true });
        inflight.current = false;
        if (!d) return;
        if (d.action === 'logout') {
          await fetch('/api/logout?idle=1', { method: 'POST' }).catch(() => {});
          toLogin();
        } else {
          sync(d);
          setLeft(null);
        }
      } else if (idle >= limit - WARN_SECS && !busy) {
        if (!warned.current) {
          // Awal peringatan: cek dulu ke server, tab lain mungkin sedang aktif.
          warned.current = true;
          inflight.current = true;
          const d = await ping({ busy });
          inflight.current = false;
          sync(d);
          if ((Date.now() - last.current) / 1000 < limit - WARN_SECS) { warned.current = false; setLeft(null); return; }
        }
        setLeft(Math.max(1, Math.ceil(limit - (Date.now() - last.current) / 1000)));
      } else {
        warned.current = false;
        setLeft((v) => (v === null ? v : null));
      }
    }

    const events = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll'];
    events.forEach((e) => window.addEventListener(e, activity, { passive: true, capture: true }));
    const onVisible = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(tick, 1000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, activity, { capture: true }));
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (left === null) return null;
  return (
    <div className="idle-bg">
      <div className="card idle-box">
        <h2 style={{ marginTop: 0 }}>Masih di sana?</h2>
        <p>Tidak ada aktivitas. Anda akan keluar otomatis dalam <b>{left}</b> detik. Shift tetap berjalan.</p>
        <button onClick={() => { last.current = Date.now(); warned.current = false; setLeft(null); fetch('/api/ping', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ activity: true, busy: isBusy() }) }); }}>
          Tetap masuk
        </button>
      </div>
    </div>
  );
}
