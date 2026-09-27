import { proxied } from '../http';

/**
 * Logos de chaînes : les playlists fournissent des PNG de toutes sortes. Un logo noir ou
 * bleu foncé sur fond transparent disparaît sur le fond sombre de l'application ; un logo
 * sur fond opaque (carré blanc, rectangle coloré) doit remplir son cadre proprement.
 *
 * Chaque logo est analysé une fois (vignette 24 × 24 dessinée dans un canvas) :
 * - `transparent` : une part notable de pixels transparents ;
 * - `dark` : les pixels visibles sont sombres (luminance moyenne faible) ;
 * - `tint` : couleur dominante (la plus saturée parmi les pixels visibles), pour teinter
 *   le fond de la tuile au lieu d'un flou du logo.
 */
export interface LogoInfo {
  transparent: boolean;
  dark: boolean;
  tint: [number, number, number] | null;
}

const cache = new Map<string, LogoInfo | null>();
const pending = new Map<string, ((i: LogoInfo | null) => void)[]>();
let canvas: HTMLCanvasElement | null = null;

function sameOrigin(url: string): boolean {
  try {
    return new URL(url, location.href).origin === location.origin;
  } catch {
    return false;
  }
}

function analyze(img: HTMLImageElement): LogoInfo | null {
  const N = 24;
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.width = N;
    canvas.height = N;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.clearRect(0, 0, N, N);
  try {
    ctx.drawImage(img, 0, 0, N, N);
    const d = ctx.getImageData(0, 0, N, N).data;
    let visible = 0;
    let clear = 0;
    let lum = 0;
    let tint: [number, number, number] | null = null;
    // Somme des couleurs saturées (moyenne pondérée) : plus stable qu'un seul pixel.
    let sr = 0;
    let sg = 0;
    let sb = 0;
    let sw = 0;
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3];
      if (a < 40) {
        clear++;
        continue;
      }
      const r = d[i];
      const g = d[i + 1];
      const b = d[i + 2];
      visible++;
      lum += (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const sat = max ? (max - min) / max : 0;
      if (sat > 0.35 && max > 60) {
        const w = sat * (a / 255);
        sr += r * w;
        sg += g * w;
        sb += b * w;
        sw += w;
      }
    }
    if (!visible) return null;
    if (sw > 0) tint = [Math.round(sr / sw), Math.round(sg / sw), Math.round(sb / sw)];
    return { transparent: clear / (N * N) > 0.12, dark: lum / visible < 0.42, tint };
  } catch {
    // Image d'un autre domaine sans autorisation : impossible à lire.
    return null;
  }
}

/**
 * Analyse le logo `src` (déjà chargé dans `img` si possible). Sur Android, les logos
 * passent par le proxy de vignettes (même origine) ; dans un navigateur de développement,
 * une copie est chargée via le proxy pour pouvoir la lire.
 */
export function logoInfo(src: string, img: HTMLImageElement, done: (i: LogoInfo | null) => void): void {
  if (cache.has(src)) return done(cache.get(src) || null);
  const waiting = pending.get(src);
  if (waiting) {
    waiting.push(done);
    return;
  }
  pending.set(src, [done]);
  const finish = (info: LogoInfo | null) => {
    cache.set(src, info);
    const list = pending.get(src) || [];
    pending.delete(src);
    for (const fn of list) fn(info);
  };
  const run = (el: HTMLImageElement) => window.setTimeout(() => finish(analyze(el)), 0);
  if (img.complete && img.naturalWidth && sameOrigin(img.currentSrc || img.src)) return void run(img);
  const via = proxied(src);
  if (via === src) return finish(null);
  const copy = new Image();
  copy.onload = () => run(copy);
  copy.onerror = () => finish(null);
  copy.src = via;
}

/** Couleur CSS « r, g, b » d'un teint (pour rgba(var(--tint), a)). */
export function tintVar(info: LogoInfo | null): string | null {
  return info && info.tint ? info.tint.join(', ') : null;
}
