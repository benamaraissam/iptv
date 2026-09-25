/**
 * Proxy IPTV pour le développement dans un navigateur (npm run dev / preview).
 *
 * Les serveurs IPTV (Xtream, M3U) n'envoient pas d'en-têtes CORS : un navigateur
 * refuse donc de les appeler depuis http://localhost. Les applications Android,
 * iOS, Tizen et webOS n'ont pas cette restriction et n'utilisent pas ce proxy.
 *
 *   GET /__proxy?url=<URL encodée>
 *
 * - suit les redirections (fréquentes sur les flux Xtream) ;
 * - réécrit les playlists HLS pour que leurs liens relatifs restent valides ;
 * - s'identifie comme VLC (certains serveurs refusent les navigateurs).
 */
import http from 'node:http';
import https from 'node:https';

const UA = 'VLC/3.0.20 LibVLC/3.0.20';
const MAX_REDIRECTS = 6;

function isPlaylist(url, contentType) {
  return /mpegurl/i.test(contentType || '') || /\.m3u8?(\?|$)/i.test(url);
}

/** Rend absolus les liens d'une playlist HLS (segments, sous-playlists, clés). */
function absolutize(body, base) {
  const abs = (u) => {
    try {
      return new URL(u, base).toString();
    } catch {
      return u;
    }
  };
  return body
    .split(/\r?\n/)
    .map((line) => {
      const l = line.trim();
      if (!l) return line;
      if (l[0] === '#') return line.replace(/URI="([^"]+)"/g, (_m, u) => 'URI="' + abs(u) + '"');
      return abs(l);
    })
    .join('\n');
}

function forward(target, req, res, hops) {
  let mod;
  try {
    mod = new URL(target).protocol === 'https:' ? https : http;
  } catch {
    res.statusCode = 400;
    return res.end('URL invalide');
  }
  const headers = { 'user-agent': UA, accept: '*/*' };
  if (req.headers.range) headers.range = req.headers.range;
  const up = mod.get(target, { headers, timeout: 20000 }, (r) => {
    const status = r.statusCode || 502;
    if (status >= 300 && status < 400 && r.headers.location && hops < MAX_REDIRECTS) {
      r.resume();
      return forward(new URL(r.headers.location, target).toString(), req, res, hops + 1);
    }
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-expose-headers', 'content-length, content-range');
    const ct = r.headers['content-type'];
    if (ct) res.setHeader('content-type', ct);
    if (isPlaylist(target, ct) && status < 400) {
      // Playlist HLS : petite, on la réécrit.
      const chunks = [];
      r.on('data', (c) => chunks.push(c));
      r.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        res.statusCode = status;
        res.end(text.indexOf('#EXTM3U') === 0 || text.indexOf('#EXT') !== -1 ? absolutize(text, target) : text);
      });
      return;
    }
    for (const h of ['content-length', 'content-range', 'accept-ranges']) if (r.headers[h]) res.setHeader(h, r.headers[h]);
    res.statusCode = status;
    r.pipe(res);
  });
  up.on('timeout', () => up.destroy(new Error('délai dépassé')));
  up.on('error', (e) => {
    if (res.headersSent) return res.end();
    res.statusCode = 502;
    res.setHeader('access-control-allow-origin', '*');
    res.end('Serveur injoignable : ' + e.message);
  });
  res.on('close', () => up.destroy());
}

function handler(req, res, next) {
  if (!req.url || req.url.indexOf('/__proxy?') !== 0) return next();
  const target = new URL(req.url, 'http://localhost').searchParams.get('url') || '';
  if (!/^https?:\/\//i.test(target)) {
    res.statusCode = 400;
    return res.end('URL invalide');
  }
  forward(target, req, res, 0);
}

export function iptvDevProxy() {
  return {
    name: 'iptv-dev-proxy',
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}
