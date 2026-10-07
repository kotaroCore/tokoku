export const rp = (n) => 'Rp ' + Math.round(n || 0).toLocaleString('id-ID');
export const num = (n) => (Math.round((n || 0) * 100) / 100).toLocaleString('id-ID');
