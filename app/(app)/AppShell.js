'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import LogoutButton from './LogoutButton';
import IdleGuard from './IdleGuard';
import OwnerNotices from './OwnerNotices';

const ITEMS = [
  { href: '/', icon: '🏠', label: 'Beranda' },
  { href: '/pos', icon: '🛒', label: 'Kasir' },
  { href: '/riwayat', icon: '🧾', label: 'Riwayat' },
  { href: '/produk', icon: '📦', label: 'Produk' },
  { href: '/cek', icon: '🔍', label: 'Cek' },
  { href: '/stok', icon: '📊', label: 'Stok' },
  { href: '/hutang', icon: '📒', label: 'Hutang' },
  { href: '/laporan', icon: '📈', label: 'Laporan' },
  { href: '/kulakan', icon: '🛍️', label: 'Kulakan' },
  { href: '/pembelian', icon: '📥', label: 'Pembelian' },
  { href: '/supplier', icon: '🚚', label: 'Supplier' },
  { href: '/panel', icon: '⚙️', label: 'Panel', owner: true },
];

const SIDE_MODES = ['open', 'icon', 'closed'];
const SIDE_NEXT = { open: 'icon', icon: 'closed', closed: 'open' };
const SIDE_HINT = { open: 'Ciutkan ke ikon', icon: 'Tutup sidebar', closed: 'Buka sidebar' };

const load = (key, fallback) => {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
};
const save = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
};

export default function AppShell({ name, role, idle, children }) {
  const path = usePathname();
  const [side, setSide] = useState('open');
  const [order, setOrder] = useState(ITEMS.map((i) => i.href));
  const [sheet, setSheet] = useState(false);

  useEffect(() => {
    const s = load('tk.side', 'open');
    if (SIDE_MODES.includes(s)) setSide(s);
    const o = load('tk.order', null);
    if (Array.isArray(o)) {
      const known = o.filter((h) => ITEMS.some((i) => i.href === h));
      const missing = ITEMS.map((i) => i.href).filter((h) => !known.includes(h));
      setOrder([...known, ...missing]);
    }
  }, []);

  useEffect(() => { setSheet(false); }, [path]);

  const changeSide = (m) => { setSide(m); save('tk.side', m); };
  const changeOrder = (o) => { setOrder(o); save('tk.order', o); };

  const allowed = ITEMS.filter((i) => !i.owner || role === 'owner');
  const items = order.map((h) => allowed.find((i) => i.href === h)).filter(Boolean);
  const active = (h) => (h === '/' ? path === '/' : path.startsWith(h));

  return (
    <div className="shell" data-side={side}>
      <aside className="side">
        <div className="side-head">
          <span className="brand">🧵<span className="lbl"> Tokoku</span></span>
          <button className="secondary side-toggle" title={SIDE_HINT[side]} onClick={() => changeSide(SIDE_NEXT[side])}>
            {side === 'open' ? '«' : '‹'}
          </button>
        </div>
        {items.map((i) => (
          <Link key={i.href} href={i.href} title={i.label} className={active(i.href) ? 'on' : ''}>
            <span className="ico">{i.icon}</span><span className="lbl">{i.label}</span>
          </Link>
        ))}
        <div className="side-foot">
          <span className="muted lbl">{name}</span>
          <LogoutButton />
        </div>
      </aside>

      {side === 'closed' && (
        <button className="side-reopen secondary" title="Buka sidebar" onClick={() => changeSide('open')}>☰</button>
      )}

      <main>{children}</main>

      <IdleGuard enabled={idle.enabled} minutes={idle.minutes} />
      {role === 'owner' && <OwnerNotices />}

      <BottomBar items={items} active={active} onReorder={(hrefs) => changeOrder(hrefs)} />
      <FloatingMenu onOpen={() => setSheet(true)} />

      {sheet && (
        <div className="sheet-bg" onClick={() => setSheet(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="muted">Masuk sebagai {name}</div>
            {items.map((i) => (
              <Link key={i.href} href={i.href} className={active(i.href) ? 'on' : ''}>
                <span className="ico">{i.icon}</span> {i.label}
              </Link>
            ))}
            <button className="secondary" onClick={() => changeOrder(ITEMS.map((i) => i.href))}>
              Reset urutan ikon
            </button>
            <LogoutButton />
          </div>
        </div>
      )}
    </div>
  );
}

// Bar ikon bawah (HP). Tekan-tahan sebuah ikon, lalu geser untuk mengubah urutan.
function BottomBar({ items, active, onReorder }) {
  const barRef = useRef(null);
  const drag = useRef(null);
  const suppress = useRef(false);
  const [dragging, setDragging] = useState(null);

  function start(e, href) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const el = e.currentTarget;
    const pointerId = e.pointerId;
    drag.current = { href, pointerId, active: false, timer: null };
    drag.current.timer = setTimeout(() => {
      if (!drag.current) return;
      drag.current.active = true;
      try { el.setPointerCapture(pointerId); } catch {}
      setDragging(href);
      if (navigator.vibrate) navigator.vibrate(15);
    }, 350);
  }

  function move(e) {
    const d = drag.current;
    if (!d || !d.active) return;
    const links = [...barRef.current.children];
    const from = items.findIndex((i) => i.href === d.href);
    let to = links.findIndex((el) => {
      const r = el.getBoundingClientRect();
      return e.clientX >= r.left && e.clientX <= r.right;
    });
    if (to === -1 || to === from) return;
    const hrefs = items.map((i) => i.href);
    hrefs.splice(to, 0, hrefs.splice(from, 1)[0]);
    onReorder(hrefs);
  }

  function end(e) {
    const d = drag.current;
    if (!d) return;
    clearTimeout(d.timer);
    drag.current = null;
    if (d.active) {
      suppress.current = true;
      setTimeout(() => { suppress.current = false; }, 0);
    }
    setDragging(null);
  }

  return (
    <nav className="bottom" ref={barRef}>
      {items.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          title={i.label}
          className={`${active(i.href) ? 'on' : ''} ${dragging === i.href ? 'drag' : ''}`}
          onPointerDown={(e) => start(e, i.href)}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          onContextMenu={(e) => e.preventDefault()}
          onClick={(e) => { if (suppress.current) e.preventDefault(); }}
          draggable={false}
        >
          <span className="ico">{i.icon}</span>
          <span className="lbl">{i.label}</span>
        </Link>
      ))}
    </nav>
  );
}

// Tombol menu melayang yang bisa dipindah posisinya (HP).
function FloatingMenu({ onOpen }) {
  const [pos, setPos] = useState(null); // { x, y } dalam px dari kiri-atas
  const st = useRef(null);

  useEffect(() => {
    const p = load('tk.fab', null);
    if (p && typeof p.x === 'number') setPos(p);
  }, []);

  const clamp = (x, y) => ({
    x: Math.min(Math.max(4, x), window.innerWidth - 52),
    y: Math.min(Math.max(4, y), window.innerHeight - 52),
  });

  function down(e) {
    const r = e.currentTarget.getBoundingClientRect();
    st.current = { dx: e.clientX - r.left, dy: e.clientY - r.top, sx: e.clientX, sy: e.clientY, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function move(e) {
    const s = st.current;
    if (!s) return;
    if (!s.moved && Math.hypot(e.clientX - s.sx, e.clientY - s.sy) < 8) return;
    s.moved = true;
    setPos(clamp(e.clientX - s.dx, e.clientY - s.dy));
  }
  function up() {
    const s = st.current;
    st.current = null;
    if (!s) return;
    if (s.moved) setPos((p) => { if (p) save('tk.fab', p); return p; });
    else onOpen();
  }

  const style = pos ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' } : undefined;
  return (
    <button
      className="fab"
      style={style}
      title="Menu (geser untuk memindah)"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={() => { st.current = null; }}
    >
      ☰
    </button>
  );
}
