#!/usr/bin/env node
/**
 * Prépare le build web (dist/) pour une TV :
 *   node scripts/package-tv.mjs tizen   → build/tizen  (+ .wgt si le CLI `tizen` est installé)
 *   node scripts/package-tv.mjs webos   → build/webos  (+ .ipk si `ares-package` est installé)
 */
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = process.argv[2];
if (target !== 'tizen' && target !== 'webos') {
  console.error('Usage : node scripts/package-tv.mjs <tizen|webos>');
  process.exit(1);
}

const dist = join(root, 'dist');
if (!existsSync(join(dist, 'index.html'))) {
  console.error('dist/ est vide : lancez d’abord `npm run build`.');
  process.exit(1);
}

const out = join(root, 'build', target);
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(dist, out, { recursive: true });
cpSync(join(root, 'platforms', target), out, { recursive: true });
console.log('✔ Application ' + target + ' prête dans ' + out);

function has(cmd) {
  try {
    execSync((process.platform === 'win32' ? 'where ' : 'command -v ') + cmd, { stdio: 'ignore', shell: true });
    return true;
  } catch {
    return false;
  }
}

const pkgDir = join(root, 'build');
if (target === 'tizen') {
  if (has('tizen')) {
    // Nécessite un profil de certificat Samsung créé dans Tizen Studio (Certificate Manager).
    const profile = process.env.TIZEN_PROFILE ? ' -s ' + process.env.TIZEN_PROFILE : '';
    execSync('tizen package -t wgt' + profile + ' -o "' + pkgDir + '" -- "' + out + '"', { stdio: 'inherit' });
  } else {
    console.log('ℹ CLI `tizen` introuvable : ouvrez build/tizen dans Tizen Studio pour signer et installer.');
  }
} else if (has('ares-package')) {
  execSync('ares-package "' + out + '" -o "' + pkgDir + '"', { stdio: 'inherit' });
} else {
  console.log('ℹ `ares-package` introuvable : npm i -g @webos-tools/cli puis relancez.');
}
