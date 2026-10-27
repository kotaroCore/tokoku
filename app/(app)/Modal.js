'use client';
import { useEffect } from 'react';

// Pop up untuk form tambah/ubah. Tutup dengan tombol ×, klik latar, atau Esc.
export default function Modal({ title, onClose, children }) {
  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="secondary" aria-label="Tutup" onClick={onClose}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}
