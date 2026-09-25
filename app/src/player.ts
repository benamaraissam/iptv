import type Hls from 'hls.js';
import { setHealth } from './health';
import { proxied } from './http';

export interface Track {
  id: string;
  label: string;
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
  onError: (kind: 'network' | 'format' | 'other', detail?: string) => void = () => undefined;
  onTracks: () => void = () => undefined;
  quality: 'auto' | 'high' | 'low' = 'auto';
  /** URL en cours (permet au lecteur plein écran de reprendre l'aperçu sans coupure). */
  currentUrl: string | null = null;
  /** Déjà retenté avec hls.js (URL sans extension .m3u8 qui s'avère être du HLS). */
  private triedHls = false;
  private lastStart = 0;

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
      this.fail(err.code === 2 ? 'network' : err.code === 4 || err.code === 3 ? 'format' : 'other');
    });
    v.addEventListener('loadedmetadata', () => this.onTracks());
    // La lecture réelle est la meilleure vérification de l'état d'une chaîne.
    v.addEventListener('playing', () => {
      if (this.currentUrl) setHealth(this.currentUrl, 'ok');
    });
    this.video = v;
  }

  private fail(kind: 'network' | 'format' | 'other', detail?: string): void {
    if (this.currentUrl) setHealth(this.currentUrl, 'down');
    this.onError(kind, detail);
  }

  async load(url: string, startAt = 0, forceHls = false): Promise<void> {
    const token = ++this.loadToken;
    this.stop();
    this.currentUrl = url;
    this.lastStart = startAt;
    if (!forceHls) this.triedHls = false;
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
          // Deuxième essai (lien sans .m3u8) : ce n'était pas du HLS, le format n'est pas lisible ici.
          if (forceHls && data.details === 'manifestParsingError') this.fail('format');
          else if (data.type === HlsCtor.ErrorTypes.NETWORK_ERROR) this.fail('network');
          else if (data.type === HlsCtor.ErrorTypes.MEDIA_ERROR && mediaRecoveries++ < 2) hls.recoverMediaError();
          else this.fail('other', data.details);
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

  stop(): void {
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
    if (this.quality === 'high') hls.currentLevel = hls.levels.length - 1;
    else if (this.quality === 'low') hls.currentLevel = 0;
  }

  get isLiveStream(): boolean {
    return !isFinite(this.video.duration);
  }
}
