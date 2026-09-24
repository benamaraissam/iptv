import type Hls from 'hls.js';

/**
 * Lecture vidéo :
 * - iOS/Safari, Tizen et webOS lisent le HLS nativement dans <video>.
 * - Android WebView / Chrome desktop passent par hls.js (Media Source Extensions).
 * - Les autres formats (MP4, MKV...) sont confiés directement à <video>.
 */
export class Player {
  private hls: Hls | null = null;
  private loadToken = 0;

  constructor(
    readonly video: HTMLVideoElement,
    private onError: (message: string) => void,
  ) {
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.addEventListener('error', () => {
      const err = video.error;
      if (err) this.onError(describeMediaError(err.code));
    });
  }

  async load(url: string): Promise<void> {
    const token = ++this.loadToken;
    this.stop();

    const isHls = /\.m3u8?(\?|$)/i.test(url) || url.indexOf('/live/') !== -1;
    const nativeHls = this.video.canPlayType('application/vnd.apple.mpegurl') !== '';

    if (isHls && !nativeHls) {
      const { default: HlsCtor } = await import('hls.js');
      if (token !== this.loadToken) return; // une autre chaîne a été demandée entre-temps
      if (HlsCtor.isSupported()) {
        const hls = new HlsCtor({ enableWorker: true, lowLatencyMode: true, backBufferLength: 30 });
        this.hls = hls;
        hls.on(HlsCtor.Events.ERROR, (_evt, data) => {
          if (!data.fatal) return;
          if (data.type === HlsCtor.ErrorTypes.NETWORK_ERROR) {
            this.onError('Flux injoignable (réseau ou serveur).');
          } else if (data.type === HlsCtor.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError();
          } else {
            this.onError('Lecture impossible : ' + data.details);
          }
        });
        hls.loadSource(url);
        hls.attachMedia(this.video);
        hls.on(HlsCtor.Events.MANIFEST_PARSED, () => this.play());
        return;
      }
    }

    this.video.src = url;
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

  stop(): void {
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }
    this.video.pause();
    this.video.removeAttribute('src');
    try {
      this.video.load();
    } catch {
      /* ignore */
    }
  }
}

function describeMediaError(code: number): string {
  switch (code) {
    case 1:
      return 'Lecture interrompue.';
    case 2:
      return 'Erreur réseau pendant la lecture.';
    case 3:
      return 'Le flux ne peut pas être décodé.';
    case 4:
      return 'Format de flux non supporté sur cet appareil.';
    default:
      return 'Erreur de lecture.';
  }
}
