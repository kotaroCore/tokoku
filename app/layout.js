import './globals.css';

export const metadata = {
  title: 'Tokoku',
  description: 'Kasir, stok, dan hutang untuk toko benang, furing, resleting, benik, dan kain',
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
