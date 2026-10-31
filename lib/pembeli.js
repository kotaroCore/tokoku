// Pembeli: pencarian nama mirip supaya data tidak ganda, dan teks pengingat hutang WhatsApp.

export class NamaMirip extends Error {
  constructor(nama, mirip) {
    super(`Nama "${nama}" mirip dengan pembeli yang sudah ada. Pakai yang sudah ada, atau tetap buat baru.`);
    this.mirip = mirip;
  }
}

// Huruf kecil, spasi ganda dihapus.
export const normalNama = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

// Jarak edit (Levenshtein): jumlah huruf yang perlu ditambah, dihapus, atau diganti.
export function jarakEdit(a, b) {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

// Mirip bila jarak edit paling banyak 2 huruf, atau nama yang satu memuat nama yang lain.
export function namaMirip(a, b) {
  const x = normalNama(a);
  const y = normalNama(b);
  if (!x || !y) return false;
  return jarakEdit(x, y) <= 2 || x.includes(y) || y.includes(x);
}

// Pembeli aktif yang namanya mirip (nama yang persis sama tidak dihitung: itu pembeli yang sama).
export async function cariMirip(q, nama) {
  const n = normalNama(nama);
  const rows = await q("SELECT id, name, phone, address, total_hutang, dikenal FROM customers WHERE status = 'active'");
  return rows.filter((c) => normalNama(c.name) !== n && namaMirip(c.name, n)).slice(0, 10);
}

const rp = (n) => 'Rp ' + Math.round(n || 0).toLocaleString('id-ID');
const tgl = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '-');

// Isi template pengingat: {nama}, {total}, {rincian}, {toko}, {lewat_tempo}.
// notas: [{ nomor, tanggal, sisa, jatuh_tempo, lewat }]
export function teksPengingat(template, { nama, total, notas = [], toko }) {
  const rincian = notas.map((n) => `- ${n.nomor || 'nota'} (${tgl(n.tanggal)}): ${rp(n.sisa)}${n.jatuh_tempo ? `, jatuh tempo ${tgl(n.jatuh_tempo)}` : ''}`).join('\n');
  const lewat = notas.filter((n) => n.lewat);
  const lewatTempo = lewat.length ? `${lewat.length} nota sudah lewat jatuh tempo (${rp(lewat.reduce((s, n) => s + Number(n.sisa), 0))}).` : '';
  const isi = { nama, total: rp(total), rincian, toko, lewat_tempo: lewatTempo };
  return String(template || '').replace(/\{(nama|total|rincian|toko|lewat_tempo)\}/g, (_, k) => isi[k] ?? '').replace(/\n{3,}/g, '\n\n').trim();
}
