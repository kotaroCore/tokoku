import { query } from '@/lib/db';

// Nota berhutang yang masih bersisa, dengan jatuh tempo dan umur (hari sejak nota).
export async function notaBerhutang(customerIds) {
  if (!customerIds.length) return [];
  return query(
    `SELECT s.id, s.nomor, s.customer_id, DATE(s.created_at) AS tanggal, s.jatuh_tempo,
       s.jatuh_tempo < CURDATE() AS lewat, DATEDIFF(CURDATE(), DATE(s.created_at)) AS umur,
       s.hutang - s.hutang_terbayar - COALESCE((SELECT SUM(r.hutang_reduced) FROM sale_returns r WHERE r.sale_id = s.id), 0) AS sisa
     FROM sales s WHERE s.status = 'lunas' AND s.hutang > 0 AND s.customer_id IN (?)
     HAVING sisa > 0.005 ORDER BY s.created_at, s.id`,
    [customerIds]
  );
}
