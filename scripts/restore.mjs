// Pulihkan database dari file backup (.sql.gz). Jalankan: npm run restore
// Sebelum menimpa, kondisi database saat ini dibackup dulu (berakhiran -pra-restore) supaya bisa dibatalkan.
// Hentikan aplikasi (npm run dev / start) sebelum restore.
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { createGunzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import readline from 'node:readline/promises';
import path from 'node:path';
import { queryOne, closeDb } from '../lib/db.js';
import { DB, dumpTo, findTool, listBackups, resolveDir } from '../lib/backup-core.js';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const fmt = (b) => (b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');

try {
  const row = await queryOne("SELECT v FROM settings WHERE k = 'backup_dir'");
  const dir = resolveDir(process.argv[2] || row?.v || '');
  const files = listBackups(dir);
  if (!files.length) {
    console.log(`Tidak ada file backup di ${dir}`);
    process.exit(1);
  }
  console.log(`\nFolder backup: ${dir}\n`);
  files.slice(0, 30).forEach((f, i) => console.log(`${String(i + 1).padStart(2)}. ${f.file}  (${fmt(f.size)}, ${new Date(f.mtime).toLocaleString('id-ID')})`));
  const pick = Number(await rl.question('\nPilih nomor backup yang dipulihkan (kosong = batal): '));
  const chosen = files[pick - 1];
  if (!chosen) {
    console.log('Dibatalkan.');
    process.exit(0);
  }
  console.log(`\nPERINGATAN: seluruh data saat ini di database "${DB.name()}" akan DIGANTI dengan isi ${chosen.file}.`);
  if ((await rl.question('Ketik PULIHKAN untuk melanjutkan: ')).trim() !== 'PULIHKAN') {
    console.log('Dibatalkan.');
    process.exit(0);
  }

  const safety = await dumpTo(dir, { tag: '-pra-restore' });
  console.log(`Cadangan kondisi saat ini: ${safety.file}`);

  const mysql = spawn(findTool('client'), [`--host=${DB.host()}`, `--port=${DB.port()}`, `--user=${DB.user()}`, '--default-character-set=utf8mb4'], {
    env: { ...process.env, MYSQL_PWD: DB.password() },
    stdio: ['pipe', 'inherit', 'inherit'],
    windowsHide: true,
  });
  const done = new Promise((resolve, reject) => {
    mysql.on('error', reject);
    mysql.on('close', resolve);
  });
  await pipeline(createReadStream(path.join(dir, chosen.file)), createGunzip(), mysql.stdin);
  const code = await done;
  console.log(code === 0 ? `\nSelesai. Database dipulihkan dari ${chosen.file}.` : `\nGAGAL (kode ${code}). Pulihkan kembali dari ${safety.file}.`);
  process.exitCode = code === 0 ? 0 : 1;
} finally {
  rl.close();
  await closeDb();
}
