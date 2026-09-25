import { defineConfig } from 'vite';
import legacy from '@vitejs/plugin-legacy';
// @ts-ignore — module JS (Node) sans déclarations de types
import { iptvDevProxy } from './scripts/dev-proxy.mjs';

export default defineConfig({
  // Chemins relatifs : indispensable pour Tizen (.wgt), webOS (.ipk) et Capacitor
  // qui chargent l'app depuis le système de fichiers local.
  base: './',
  plugins: [
    // Développement navigateur : contourne le blocage CORS des serveurs IPTV.
    iptvDevProxy(),
    // Les TV Samsung (Tizen 3+ ≈ Chromium 47) et LG (webOS 3+ ≈ Chromium 38)
    // embarquent de vieux moteurs : on génère un bundle ES5 + polyfills.
    legacy({
      targets: ['chrome >= 38', 'safari >= 12', 'android >= 6'],
      renderModernChunks: false,
    }),
    {
      // Les TV chargent l'app en file:// : l'attribut crossorigin y bloque les scripts.
      name: 'strip-crossorigin',
      enforce: 'post',
      transformIndexHtml: (html) => html.replace(/ crossorigin(="[^"]*")?/g, ''),
    },
  ],
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
    // hls.js (~640 ko) est chargé à la demande, seulement quand le HLS natif manque.
    chunkSizeWarningLimit: 800,
    cssTarget: 'chrome38',
  },
});
