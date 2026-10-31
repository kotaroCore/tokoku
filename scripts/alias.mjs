// Alias impor "@/..." (seperti di jsconfig.json) untuk skrip Node di luar Next, mis. uji otomatis.
// Pakai: node --import ./scripts/alias.mjs scripts/uji.mjs
import { registerHooks } from 'node:module';

const root = new URL('../', import.meta.url);

registerHooks({
  resolve(spec, ctx, next) {
    if (!spec.startsWith('@/')) return next(spec, ctx);
    let path = spec.slice(2);
    if (!/\.[cm]?js$/.test(path)) path += '.js';
    return next(new URL(path, root).href, ctx);
  },
});
