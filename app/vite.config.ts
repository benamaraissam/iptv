import { defineConfig } from 'vite';
import legacy from '@vitejs/plugin-legacy';
// @ts-ignore — module JS (Node) sans déclarations de types
import { iptvDevProxy } from './scripts/dev-proxy.mjs';

// Paquets TV (Tizen, webOS) : chargés en file://, où les scripts « module » sont refusés
// (origine null) → un seul bundle ES5 + polyfills. Partout ailleurs (Chrome, Android /
// Fire TV, iOS) : bundle moderne, bien plus rapide sur les box TV, avec repli automatique
// sur l'ES5 pour un vieux moteur.
const TV_PACKAGE = !!process.env.TV_PACKAGE;

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
      // Samsung 2018 (Tizen 4 ≈ Chromium 56), LG 2018 (webOS 4 ≈ Chromium 53).
      targets: ['chrome >= 53', 'safari >= 12'],
      renderModernChunks: !TV_PACKAGE,
      modernTargets: ['chrome >= 64', 'safari >= 13', 'firefox >= 67'],
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
    // Moteur minimal du bundle moderne : celui que le repli ES5 ne couvre pas.
    target: ['chrome64', 'safari13', 'firefox67'],
    cssTarget: 'chrome53',
  },
});
