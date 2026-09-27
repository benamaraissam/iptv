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

/**
 * Types de requêtes secondaires. Un refus 5xx ne suspend que son type (beaucoup de panels
 * répondent 500 au guide des chaînes qui n'en ont pas, sans que les fiches soient
 * touchées) ; un refus 429 / 403 / 458 (trop de requêtes, blocage) suspend tout.
 */
export type ApiKind = 'epg' | 'details' | 'other';
const KINDS: ApiKind[] = ['epg', 'details', 'other'];
const pauseUntil: Record<ApiKind, number> = { epg: 0, details: 0, other: 0 };
const strikes: Record<ApiKind, number> = { epg: 0, details: 0, other: 0 };
let nextSlot = 0;
let lastStatus = 0;

export function apiPaused(kind: ApiKind = 'other'): boolean {
  return Date.now() < pauseUntil[kind];
}

function pause(kind: ApiKind): void {
  strikes[kind]++;
  const ms = Math.min(MAX_PAUSE, 60000 * Math.pow(2, strikes[kind] - 1));
  pauseUntil[kind] = Math.max(pauseUntil[kind], Date.now() + ms);
}

/** Résultat d'une requête API : succès (remet à zéro son type) ou code HTTP d'échec. */
export function noteApi(ok: boolean, status = 0, kind: ApiKind = 'other'): void {
  if (ok) {
    strikes[kind] = 0;
    return;
  }
  const blocked = status === 429 || status === 403 || status === 458;
  if (!blocked && status < 500) return;
  lastStatus = status;
  if (blocked) for (const k of KINDS) pause(k);
  else pause(kind);
  mark('API fournisseur : HTTP ' + status + ' → pause ' + (blocked ? 'de toutes les requêtes secondaires' : 'des requêtes « ' + kind + ' »') + ' ' + Math.round((pauseUntil[kind] - Date.now()) / 1000) + ' s');
}

/** Attend son tour pour une requête secondaire ; échoue tout de suite si son type est en pause. */
export async function backgroundTurn(kind: ApiKind = 'other'): Promise<void> {
  if (apiPaused(kind)) throw new Error('API en pause (serveur saturé)');
  const now = Date.now();
  const at = Math.max(now, nextSlot);
  nextSlot = at + MIN_GAP;
  if (at > now) await new Promise((r) => window.setTimeout(r, at - now));
  if (apiPaused(kind)) throw new Error('API en pause (serveur saturé)');
}

/** Code HTTP contenu dans un message d'erreur « HTTP 500 — … ». */
export function statusOf(e: unknown): number {
  const m = /HTTP (\d{3})/.exec(String((e as Error) && (e as Error).message));
  return m ? parseInt(m[1], 10) : 0;
}

/** Pour sp.diag(). */
export function apiGuardState(): string {
  const paused = KINDS.filter((k) => apiPaused(k)).map((k) => k + ' ' + Math.round((pauseUntil[k] - Date.now()) / 1000) + ' s');
  return paused.length ? 'en pause : ' + paused.join(', ') + ' (dernier refus HTTP ' + lastStatus + ')' : 'normale';
}
