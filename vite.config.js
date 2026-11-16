import { defineConfig } from 'vite';

const NASA = 'https://mars.nasa.gov';

// CloudFront (servidor de la NASA) bloquea los User-Agent de navegadores
// automatizados ("HeadlessChrome"), así que se reenvía uno de navegador real.
const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

export default defineConfig({
  server: {
    proxy: {
      // API de imágenes crudas de Mars 2020 (datos + miniaturas).
      '/nasa-api': {
        target: NASA,
        changeOrigin: true,
        headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json' },
        rewrite: (path) => path.replace(/^\/nasa-api/, '/rss/api'),
      },
      // Archivos de imagen (jpg/png) publicados por la NASA.
      '/nasa-img': {
        target: NASA,
        changeOrigin: true,
        headers: { 'User-Agent': BROWSER_UA, Accept: 'image/avif,image/webp,image/*,*/*' },
        rewrite: (path) => path.replace(/^\/nasa-img/, ''),
      },
    },
  },
});
