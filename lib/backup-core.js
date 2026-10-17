// Inti backup database (tanpa ketergantungan ke Next.js, dipakai juga oleh scripts/restore.mjs).
// Backup = seluruh isi database dalam satu snapshot konsisten (mysqldump --single-transaction), dikompres .sql.gz.
import { spawn } from 'node:child_process';
import { createGzip } from 'node:zlib';
import { createWriteStream, existsSync, mkdirSync, readdirSync, renameSync, statSync, unlinkSync, accessSync, constants } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';

export const DB = {
  host: () => process.env.DB_HOST || '127.0.0.1',
  port: () => String(Number(process.env.DB_PORT) || 3306),
  user: () => process.env.DB_USER || 'root',
  password: () => process.env.DB_PASSWORD || '',
  name: () => process.env.DB_NAME || 'tokoku',
};

const NAME_RE = /^tokoku-\d{4}-\d{2}-\d{2}_\d{4}(-pra-restore)?\.sql\.gz$/;

export function resolveDir(dir) {
  return path.resolve(dir && dir.trim() ? dir.trim() : path.join(process.cwd(), 'data', 'backups'));
}

// Cari program klien MySQL/MariaDB: env MYSQLDUMP_PATH / MYSQL_PATH, lokasi umum Windows (XAMPP, dll.), lalu PATH.
export function findTool(kind) {
  const envKey = kind === 'dump' ? 'MYSQLDUMP_PATH' : 'MYSQL_PATH';
  if (process.env[envKey]) return process.env[envKey];
  const exe = process.platform === 'win32' ? '.exe' : '';
  const names = kind === 'dump' ? ['mysqldump', 'mariadb-dump'] : ['mysql', 'mariadb'];
  const dirs = ['C:\\xampp\\mysql\\bin', 'C:\\laragon\\bin\\mysql', 'C:\\wamp64\\bin\\mysql'];
  for (const d of dirs) for (const n of names) if (existsSync(path.join(d, n + exe))) return path.join(d, n + exe);
  for (const base of ['C:\\Program Files\\MariaDB', 'C:\\Program Files\\MySQL']) {
    try {
      for (const v of readdirSync(base)) for (const n of names) {
        const f = path.join(base, v, 'bin', n + exe);
        if (existsSync(f)) return f;
      }
    } catch {}
  }
  return names[0]; // semoga ada di PATH
}

export function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
  accessSync(dir, constants.W_OK);
}

const pad = (n) => String(n).padStart(2, '0');
function stamp(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

export function listBackups(dir) {
  try {
    return readdirSync(dir)
      .filter((f) => NAME_RE.test(f))
      .map((f) => {
        const st = statSync(path.join(dir, f));
        return { file: f, size: st.size, mtime: st.mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime);
  } catch {
    return [];
  }
}

export function pruneBackups(dir, keepDays) {
  const limit = Date.now() - Math.max(1, keepDays) * 86400000;
  let removed = 0;
  for (const b of listBackups(dir)) {
    if (b.mtime < limit) {
      try { unlinkSync(path.join(dir, b.file)); removed++; } catch {}
    }
  }
  return removed;
}

export async function dumpTo(dir, { tag = '' } = {}) {
  ensureDir(dir);
  const file = `tokoku-${stamp()}${tag}.sql.gz`;
  const final = path.join(dir, file);
  const tmp = final + '.tmp';
  const child = spawn(
    findTool('dump'),
    [
      `--host=${DB.host()}`, `--port=${DB.port()}`, `--user=${DB.user()}`,
      '--single-transaction', '--routines', '--triggers', '--default-character-set=utf8mb4',
      '--databases', DB.name(),
    ],
    { env: { ...process.env, MYSQL_PWD: DB.password() }, windowsHide: true }
  );
  let stderr = '';
  child.stderr.on('data', (d) => { stderr += d; });
  const exited = new Promise((resolve, reject) => {
    child.on('error', (e) => reject(e.code === 'ENOENT' ? new Error('Program mysqldump tidak ditemukan. Pasang klien MySQL/MariaDB atau isi MYSQLDUMP_PATH di .env.local.') : e));
    child.on('close', (code) => resolve(code));
  });
  try {
    await Promise.all([
      pipeline(child.stdout, createGzip(), createWriteStream(tmp)),
      exited.then((c) => {
        if (c !== 0) throw new Error(`mysqldump gagal (kode ${c}): ${stderr.trim().slice(0, 300)}`);
      }),
    ]);
    if (statSync(tmp).size < 100) throw new Error('Hasil backup kosong.');
    renameSync(tmp, final);
  } catch (e) {
    try { unlinkSync(tmp); } catch {}
    throw e;
  }
  return { file, size: statSync(final).size };
}
