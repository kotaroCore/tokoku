import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { query, queryOne } from '@/lib/db';
import { requireApi } from '@/lib/auth';

// Foto bukti nota pembelian disimpan di data/receipts/ (di luar folder publik), nama file di kolom receipt_file.
const DIR = path.join(process.cwd(), 'data', 'receipts');
const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MIME = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const MAX = 5 * 1024 * 1024;

export async function GET(_req, { params }) {
  const { error } = await requireApi();
  if (error) return error;
  const { id } = await params;
  const p = await queryOne('SELECT receipt_file FROM purchases WHERE id = ?', [id]);
  if (!p?.receipt_file) return Response.json({ error: 'Belum ada foto nota' }, { status: 404 });
  try {
    const buf = await readFile(path.join(DIR, path.basename(p.receipt_file)));
    return new Response(buf, {
      headers: { 'Content-Type': MIME[p.receipt_file.split('.').pop()] || 'application/octet-stream', 'Cache-Control': 'private, max-age=86400' },
    });
  } catch {
    return Response.json({ error: 'File foto tidak ditemukan' }, { status: 404 });
  }
}

// Unggah / ganti foto: body = isi gambar mentah, Content-Type = jenis gambar.
export async function PUT(req, { params }) {
  const { error } = await requireApi();
  if (error) return error;
  const { id } = await params;
  const ext = TYPES[(req.headers.get('content-type') || '').split(';')[0]];
  if (!ext) return Response.json({ error: 'Format foto harus JPG, PNG, atau WebP' }, { status: 400 });
  const p = await queryOne('SELECT id FROM purchases WHERE id = ?', [id]);
  if (!p) return Response.json({ error: 'Pembelian tidak ditemukan' }, { status: 404 });
  const buf = Buffer.from(await req.arrayBuffer());
  if (!buf.length) return Response.json({ error: 'Foto kosong' }, { status: 400 });
  if (buf.length > MAX) return Response.json({ error: 'Foto terlalu besar (maks. 5 MB)' }, { status: 400 });
  await mkdir(DIR, { recursive: true });
  const file = `pembelian-${p.id}-${Date.now()}.${ext}`;
  await writeFile(path.join(DIR, file), buf);
  await query('UPDATE purchases SET receipt_file = ? WHERE id = ?', [file, p.id]);
  return Response.json({ ok: true });
}
