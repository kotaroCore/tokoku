/** @type {import('next').NextConfig} */
const nextConfig = {
  // Izinkan membuka server dev lewat IP jaringan lokal (bukan hanya localhost).
  allowedDevOrigins: ['192.168.*.*', '10.*.*.*'],
};

export default nextConfig;
