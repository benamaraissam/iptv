/**
 * Diagnostic des blocages de l'interface : quand le fil principal reste occupé plus de
 * 150 ms (« long task »), on affiche dans la console ce que l'application faisait à ce
 * moment-là (écran en construction, liste rendue, flux chargé, image décodée…).
 * Coût négligeable ; ne fait rien sur les moteurs sans PerformanceObserver.
 */
interface Mark {
  t: number;
  name: string;
}

const marks: Mark[] = [];
const MAX_MARKS = 3000;
const report: string[] = [];

export function mark(name: string): void {
  marks.push({ t: performance.now(), name });
  if (marks.length > MAX_MARKS) marks.splice(0, marks.length - MAX_MARKS);
}

/** Mesure une fonction synchrone et pose une marque « nom (durée) ». */
export function timed<T>(name: string, fn: () => T): T {
  const t0 = performance.now();
  mark(name);
  const r = fn();
  const d = performance.now() - t0;
  if (d > 20) mark(name + ' — fin (' + Math.round(d) + ' ms)');
  return r;
}

function attribute(start: number, end: number): string[] {
  const out: string[] = [];
  let before: Mark | null = null;
  for (const m of marks) {
    if (m.t < start) before = m;
    else if (m.t <= end) out.push('+' + Math.round(m.t - start) + ' ms ' + m.name);
  }
  if (before) out.unshift('(en cours) ' + before.name);
  return out.slice(0, 25);
}

export function installDiag(): void {
  if (typeof PerformanceObserver === 'undefined' || typeof performance === 'undefined') return;
  try {
    const po = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (e.duration < 150) continue;
        const lines = attribute(e.startTime, e.startTime + e.duration);
        const msg = '⚠ Interface bloquée ' + Math.round(e.duration) + ' ms\n  ' + (lines.length ? lines.join('\n  ') : '(aucune marque : travail du navigateur — décodage d’image, mise en page)');
        report.push(msg);
        if (report.length > 50) report.shift();
        console.warn(msg);
      }
    });
    po.observe({ entryTypes: ['longtask'] });
  } catch {
    /* non supporté */
  }
}

/** Depuis la console : sp.diag() → les derniers blocages détectés. */
export function diagReport(): string {
  return report.length ? report.join('\n\n') : 'Aucun blocage de plus de 150 ms détecté.';
}
