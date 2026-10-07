'use client';

export default function LogoutButton() {
  return (
    <button
      className="secondary"
      onClick={async () => {
        await fetch('/api/logout', { method: 'POST' });
        window.location.href = '/login';
      }}
    >
      Keluar (akhiri shift)
    </button>
  );
}
