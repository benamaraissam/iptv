import { mark } from './diag';

/**
 * Garde-fou des requêtes vers l'API du fournisseur (player_api.php).
 *
 * Les panels Xtream bloquent temporairement un compte ou une adresse IP qui envoie trop de
 * requêtes : l'API répond alors 429, 403 ou 5xx, et les flux eux-mêmes sont refusés. Les
 * requêtes « de confort » (guide TV, préchargement des fiches, affiches de secours) sont
 * donc espacées, et suspendues dès que le serveur montre des signes de saturation :
 * 1 min, puis 2, 4… jusqu'à 10 min. Les requêtes demandées par l'utilisateur passent.
 */
const MIN_GAP = 350;
const MAX_PAUSE = 10 * 60000;
let pauseUntil = 0;
let strikes = 0;
let nextSlot = 0;
let lastStatus = 0;

export function apiPaused(): boolean {
  return Date.now() < pauseUntil;
}

/** Résultat d'une requête API : succès (remet à zéro) ou code HTTP d'échec. */
export function noteApi(ok: boolean, status = 0): void {
  if (ok) {
    strikes = 0;
    return;
  }
  if (!(status === 429 || status === 403 || status === 458 || status >= 500)) return;
  lastStatus = status;
  strikes++;
  const pause = Math.min(MAX_PAUSE, 60000 * Math.pow(2, strikes - 1));
  pauseUntil = Date.now() + pause;
  mark('API fournisseur : HTTP ' + status + ' → requêtes secondaires en pause ' + Math.round(pause / 1000) + ' s');
}

/** Attend son tour pour une requête secondaire ; échoue tout de suite si l'API est en pause. */
export async function backgroundTurn(): Promise<void> {
  if (apiPaused()) throw new Error('API en pause (serveur saturé)');
  const now = Date.now();
  const at = Math.max(now, nextSlot);
  nextSlot = at + MIN_GAP;
  if (at > now) await new Promise((r) => window.setTimeout(r, at - now));
  if (apiPaused()) throw new Error('API en pause (serveur saturé)');
}

/** Code HTTP contenu dans un message d'erreur « HTTP 500 — … ». */
export function statusOf(e: unknown): number {
  const m = /HTTP (\d{3})/.exec(String((e as Error) && (e as Error).message));
  return m ? parseInt(m[1], 10) : 0;
}

/** Pour sp.diag(). */
export function apiGuardState(): string {
  return apiPaused() ? 'en pause encore ' + Math.round((pauseUntil - Date.now()) / 1000) + ' s (dernier refus HTTP ' + lastStatus + ')' : 'normale';
}
