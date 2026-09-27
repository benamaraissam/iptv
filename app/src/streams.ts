/**
 * Un même direct Xtream existe en deux conteneurs : HLS (.m3u8) et MPEG-TS (.ts).
 * Certains fournisseurs ne servent que l'un des deux pour une chaîne donnée (le HLS
 * demande un transcodage) : les applications comme IBO Pro lisent le .ts par défaut.
 */
export function alternateContainer(url: string): string | undefined {
  const m = /^(.*\/live\/[^/]+\/[^/]+\/\d+)\.(m3u8|ts)(\?.*)?$/i.exec(url);
  if (!m) return undefined;
  return m[1] + (m[2].toLowerCase() === 'ts' ? '.m3u8' : '.ts') + (m[3] || '');
}

export const isTsUrl = (url: string) => /\.ts(\?|$)/i.test(url) || /\/__transcode\?/.test(url);
