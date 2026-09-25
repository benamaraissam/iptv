import type Hls from 'hls.js';
import { setHealth, setPlaybackActive } from './health';
import { proxied } from './http';

export interface Track {
  id: string;
  label: string;
}

/** Mesures de lecture, pour savoir si une lenteur vient de la source ou de l'appareil. */
export interface PlaybackStats {
  /** Temps entre la demande et la première image (ms). */
  startupMs?: number;
  /** Temps écoulé depuis la demande (ms), tant que l'image n'est pas arrivée. */
  waitingMs: number;
  /** Réponse du serveur pour la playlist HLS : premier octet et total (ms). */
  manifestTtfbMs?: number;
  manifestMs?: number;
  /** Dernier segment vidéo : durée de téléchargement vs durée du segment. */
  fragMs?: number;
  fragDurationMs?: number;
  /** Débit mesuré (kb/s) et débit requis par la qualité en cours. */
  bandwidthKbps?: number;
  levelKbps?: number;
  width: number;
  height: number;
  bufferSec: number;
  dropped?: number;
  rebuffers: number;
  engine: 'hls.js' | 'natif';
}

/**
 * Cause d'un échec de lecture :
 * - network : serveur ou réseau injoignable (on retente)
 * - format : conteneur / playlist illisible ici (on retente autrement)
 * - codec : la vidéo elle-même (HEVC…) n'est pas décodable sur cet appareil (définitif)
 * - denied : le fournisseur refuse l'accès (limite de connexions, abonnement) (définitif)
 */
export type PlaybackErrorKind = 'network' | 'format' | 'codec' | 'denied' | 'other';

const DENIED_STATUS: Record<number, true> = { 401: true, 403: true, 429: true, 458: true, 509: true };

/**
 * Autre conteneur du même flux Xtream : le direct existe en HLS (.m3u8) et en MPEG-TS (.ts).
 * Retourne undefined si l'appareil ne sait pas lire l'autre forme.
 */
export function alternateUrl(url: string, video: HTMLVideoElement): string | undefined {
  const m = /^(.*\/live\/[^/]+\/[^/]+\/\d+)\.(m3u8|ts)(\?.*)?$/i.exec(url);
  if (!m) return undefined;
  if (m[2].toLowerCase() === 'ts') return m[1] + '.m3u8' + (m[3] || '');
  return video.canPlayType('video/mp2t') || video.canPlayType('video/MP2T') ? m[1] + '.ts' + (m[3] || '') : undefined;
}

function codecUnsupported(codec?: string): boolean {
  if (!codec) return false;
  try {
    const MS = (window as any).MediaSource;
    return !!MS && typeof MS.isTypeSupported === 'function' && !MS.isTypeSupported('video/mp4;codecs="' + codec + '"');
  } catch {
    return false;
  }
}

/**
 * Lecture vidéo :
 * - iOS/Safari, Tizen et webOS lisent le HLS nativement dans <video>.
 * - Android WebView / Chrome passent par hls.js (Media Source Extensions).
 * - Les autres formats (MP4, MKV...) sont confiés directement à <video>.
 */
export class Engine {
  readonly video: HTMLVideoElement;
  private hls: Hls | null = null;
  private loadToken = 0;
  onError: (kind: PlaybackErrorKind, detail?: string) => void = () => undefined;
  onTracks: () => void = () => undefined;
  quality: 'auto' | 'high' | 'low' = 'auto';
  /** Mode dégradé (reconnexions répétées) : on s'en tient à la qualité la plus basse. */
  degraded = false;
  /** URL en cours (permet au lecteur plein écran de reprendre l'aperçu sans coupure). */
  currentUrl: string | null = null;
  /** Déjà retenté avec hls.js (URL sans extension .m3u8 qui s'avère être du HLS). */
  private triedHls = false;
  private lastStart = 0;
  private t0 = 0;
  private m: Partial<PlaybackStats> & { rebuffers: number } = { rebuffers: 0 };

  constructor() {
    const v = document.createElement('video');
    v.id = 'video';
    v.setAttribute('playsinline', '');
    v.setAttribute('webkit-playsinline', '');
    v.preload = 'auto';
    v.addEventListener('error', () => {
      const err = v.error;
      if (!err || !v.getAttribute('src')) return;
      // Beaucoup de liens M3U sont du HLS sans extension « .m3u8 » : Chrome / Android
      // ne savent pas les lire directement. On retente une fois avec hls.js.
      if ((err.code === 3 || err.code === 4) && !this.triedHls && this.currentUrl && v.canPlayType('application/vnd.apple.mpegurl') === '') {
        this.triedHls = true;
        this.load(this.currentUrl, this.lastStart, true);
        return;
      }
      const msg = String(err.message || '');
      // Chrome : « PIPELINE_ERROR_DECODE » = vidéo non décodable (codec), pas un souci de flux.
      const kind: PlaybackErrorKind = err.code === 2 ? 'network' : err.code === 3 && /DECODE/i.test(msg) ? 'codec' : err.code === 4 || err.code === 3 ? 'format' : 'other';
      this.fail(kind, msg || undefined);
    });
    v.addEventListener('loadedmetadata', () => this.onTracks());
    // La lecture réelle est la meilleure vérification de l'état d'une chaîne.
    v.addEventListener('playing', () => {
      if (this.currentUrl) setHealth(this.currentUrl, 'ok');
      if (this.m.startupMs === undefined && this.t0) this.m.startupMs = Date.now() - this.t0;
    });
    v.addEventListener('waiting', () => {
      if (this.m.startupMs !== undefined) this.m.rebuffers++;
    });
    this.video = v;
  }

  private fail(kind: PlaybackErrorKind, detail?: string): void {
    if (this.currentUrl) setHealth(this.currentUrl, 'down');
    this.onError(kind, detail);
  }

  async load(url: string, startAt = 0, forceHls = false): Promise<void> {
    const token = ++this.loadToken;
    this.stop();
    this.currentUrl = url;
    this.lastStart = startAt;
    if (!forceHls) {
      this.triedHls = false;
      this.t0 = Date.now();
      this.m = { rebuffers: 0 };
    }
    // Les vérifications de chaînes s'arrêtent pendant la lecture (bande passante / connexions).
    setPlaybackActive(true);
    const v = this.video;

    const isHls = forceHls || /\.m3u8?(\?|$)/i.test(url);
    if (isHls) this.triedHls = true;
    const nativeHls = v.canPlayType('application/vnd.apple.mpegurl') !== '';
    const seek = () => {
      if (startAt > 0) {
        try {
          v.currentTime = startAt;
        } catch {
          /* ignore */
        }
      }
    };

    if (isHls && !nativeHls) {
      const { default: HlsCtor } = await import('hls.js');
      if (token !== this.loadToken) return;
      if (HlsCtor.isSupported()) {
        const hls = new HlsCtor({
          enableWorker: true,
          backBufferLength: 30,
          startPosition: startAt > 0 ? startAt : -1,
          capLevelToPlayerSize: this.quality === 'auto',
          startLevel: this.degraded || this.quality === 'low' ? 0 : -1,
          // Démarrage rapide : on télécharge le 1er segment en même temps que l'initialisation.
          startFragPrefetch: true,
          maxBufferLength: 20,
          manifestLoadingMaxRetry: 2,
          // Navigateur de développement : manifestes et segments passent par le proxy (CORS).
          xhrSetup: (xhr: XMLHttpRequest, u: string) => {
            const p = proxied(u);
            if (p !== u) xhr.open('GET', p, true);
          },
        });
        this.hls = hls;
        let mediaRecoveries = 0;
        hls.on(HlsCtor.Events.ERROR, (_evt, data) => {
          if (!data.fatal) return;
          const status: number = (data.response && (data.response as any).code) || 0;
          const level = hls.currentLevel >= 0 ? hls.levels[hls.currentLevel] : hls.levels[0];
          const vcodec = level && level.videoCodec;
          // Deuxième essai (lien sans .m3u8) : ce n'était pas du HLS, le format n'est pas lisible ici.
          if (forceHls && data.details === 'manifestParsingError') this.fail('format', data.details);
          else if (data.type === HlsCtor.ErrorTypes.NETWORK_ERROR) this.fail(DENIED_STATUS[status] ? 'denied' : 'network', 'HTTP ' + status + ' ' + data.details);
          else if (data.type === HlsCtor.ErrorTypes.MEDIA_ERROR) {
            if (data.details === 'bufferAddCodecError' || data.details === 'bufferIncompatibleCodecsError' || codecUnsupported(vcodec)) {
              this.fail('codec', vcodec || data.details);
            } else if (mediaRecoveries++ < 2) hls.recoverMediaError();
            else this.fail('format', data.details);
          } else this.fail('other', data.details);
        });
        hls.on(HlsCtor.Events.MANIFEST_LOADED, (_e, data: any) => {
          const st = data && data.stats && data.stats.loading;
          if (st && st.end) {
            this.m.manifestMs = Math.round(st.end - st.start);
            this.m.manifestTtfbMs = Math.round((st.first || st.end) - st.start);
          }
        });
        hls.on(HlsCtor.Events.FRAG_LOADED, (_e, data: any) => {
          const st = data && data.frag && data.frag.stats;
          const ld = st && st.loading;
          if (!ld || !ld.end) return;
          const ms = Math.max(1, ld.end - ld.start);
          this.m.fragMs = Math.round(ms);
          this.m.fragDurationMs = Math.round((data.frag.duration || 0) * 1000);
          if (st.total) this.m.bandwidthKbps = Math.round((st.total * 8) / ms);
        });
        hls.on(HlsCtor.Events.MANIFEST_PARSED, () => {
          this.applyQuality();
          this.onTracks();
          this.play();
        });
        hls.on(HlsCtor.Events.AUDIO_TRACKS_UPDATED, () => this.onTracks());
        hls.on(HlsCtor.Events.SUBTITLE_TRACKS_UPDATED, () => this.onTracks());
        hls.loadSource(url);
        hls.attachMedia(v);
        return;
      }
    }

    v.src = url;
    if (startAt > 0) v.addEventListener('loadedmetadata', seek, { once: true } as any);
    this.play();
  }

  play(): void {
    const p = this.video.play();
    if (p && typeof p.catch === 'function') p.catch(() => undefined);
  }

  togglePause(): boolean {
    if (this.video.paused) this.play();
    else this.video.pause();
    return this.video.paused;
  }

  seekBy(delta: number): void {
    const v = this.video;
    if (!isFinite(v.duration)) return;
    v.currentTime = Math.max(0, Math.min(v.duration - 1, v.currentTime + delta));
  }

  /** Vrai si ce flux est déjà chargé et sans erreur. */
  isPlaying(url: string): boolean {
    return this.currentUrl === url && !this.video.error;
  }

  stats(): PlaybackStats {
    const v = this.video;
    let buffer = 0;
    try {
      for (let i = 0; i < v.buffered.length; i++) {
        if (v.buffered.start(i) <= v.currentTime + 0.5 && v.buffered.end(i) >= v.currentTime) buffer = v.buffered.end(i) - v.currentTime;
      }
    } catch {
      /* ignore */
    }
    const q = (v as any).getVideoPlaybackQuality ? (v as any).getVideoPlaybackQuality() : null;
    const hls = this.hls;
    const level = hls && hls.currentLevel >= 0 ? hls.levels[hls.currentLevel] : null;
    return {
      startupMs: this.m.startupMs,
      waitingMs: this.t0 ? Date.now() - this.t0 : 0,
      manifestTtfbMs: this.m.manifestTtfbMs,
      manifestMs: this.m.manifestMs,
      fragMs: this.m.fragMs,
      fragDurationMs: this.m.fragDurationMs,
      bandwidthKbps: this.m.bandwidthKbps,
      levelKbps: level && level.bitrate ? Math.round(level.bitrate / 1000) : undefined,
      width: v.videoWidth,
      height: v.videoHeight,
      bufferSec: Math.round(buffer * 10) / 10,
      dropped: q ? q.droppedVideoFrames : undefined,
      rebuffers: this.m.rebuffers,
      engine: hls ? 'hls.js' : 'natif',
    };
  }

  stop(): void {
    setPlaybackActive(false);
    this.currentUrl = null;
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }
    const v = this.video;
    v.pause();
    v.removeAttribute('src');
    try {
      v.load();
    } catch {
      /* ignore */
    }
  }

  // ───────────── Pistes ─────────────

  audioTracks(): { list: Track[]; current: string } {
    if (this.hls) {
      return {
        list: this.hls.audioTracks.map((a, i) => ({ id: String(i), label: a.name || a.lang || 'Audio ' + (i + 1) })),
        current: String(this.hls.audioTrack),
      };
    }
    const at = (this.video as any).audioTracks;
    const list: Track[] = [];
    let current = '0';
    if (at) {
      for (let i = 0; i < at.length; i++) {
        list.push({ id: String(i), label: at[i].label || at[i].language || 'Audio ' + (i + 1) });
        if (at[i].enabled) current = String(i);
      }
    }
    return { list, current };
  }

  setAudio(id: string): void {
    const i = parseInt(id, 10);
    if (this.hls) {
      this.hls.audioTrack = i;
      return;
    }
    const at = (this.video as any).audioTracks;
    if (at) for (let k = 0; k < at.length; k++) at[k].enabled = k === i;
  }

  subtitleTracks(): { list: Track[]; current: string } {
    if (this.hls) {
      return {
        list: this.hls.subtitleTracks.map((s, i) => ({ id: String(i), label: s.name || s.lang || 'Sub ' + (i + 1) })),
        current: this.hls.subtitleDisplay ? String(this.hls.subtitleTrack) : '-1',
      };
    }
    const tt = this.video.textTracks;
    const list: Track[] = [];
    let current = '-1';
    for (let i = 0; i < tt.length; i++) {
      if (tt[i].kind !== 'subtitles' && tt[i].kind !== 'captions') continue;
      list.push({ id: String(i), label: tt[i].label || tt[i].language || 'Sub ' + (i + 1) });
      if (tt[i].mode === 'showing') current = String(i);
    }
    return { list, current };
  }

  setSubtitle(id: string): void {
    const i = parseInt(id, 10);
    if (this.hls) {
      this.hls.subtitleTrack = i;
      this.hls.subtitleDisplay = i >= 0;
      return;
    }
    const tt = this.video.textTracks;
    for (let k = 0; k < tt.length; k++) tt[k].mode = k === i ? 'showing' : 'disabled';
  }

  levels(): { list: Track[]; current: string } {
    if (!this.hls) return { list: [], current: '-1' };
    return {
      list: this.hls.levels.map((l, i) => ({ id: String(i), label: (l.height ? l.height + 'p' : Math.round(l.bitrate / 1000) + ' kbps') })),
      current: this.hls.autoLevelEnabled ? '-1' : String(this.hls.currentLevel),
    };
  }

  setLevel(id: string): void {
    if (this.hls) this.hls.currentLevel = parseInt(id, 10);
  }

  /** Réglage global « Qualité vidéo » : max = niveau le plus haut, économie = le plus bas. */
  private applyQuality(): void {
    const hls = this.hls;
    if (!hls || !hls.levels.length) return;
    if (this.degraded || this.quality === 'low') hls.autoLevelCapping = 0;
    else if (this.quality === 'high') hls.currentLevel = hls.levels.length - 1;
  }

  get isLiveStream(): boolean {
    return !isFinite(this.video.duration);
  }
}
