import { Capacitor, registerPlugin } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';
import { platform } from './platform';
import { mark } from './diag';

/**
 * Lecteur natif Android / Fire TV (libVLC, voir NativePlayerPlugin.java).
 *
 * Le décodeur de la WebView refuse ou lit mal beaucoup de flux IPTV (MPEG-TS en direct,
 * H.264 entrelacé 1080i, audio MPEG Layer II, MKV multi-pistes). libVLC les lit tous,
 * avec le décodage matériel de l'appareil, comme le font IBO Pro ou TiviMate.
 *
 * Côté web, le lecteur natif se présente comme un élément « vidéo » factice : un <div>
 * qui expose currentTime, duration, paused, les événements playing / timeupdate…, pour
 * que les écrans (lecteur plein écran, aperçu de la TV en direct) fonctionnent tels quels.
 * La surface vidéo native est placée sous la WebView, exactement derrière ce <div>.
 */

interface NativeTrack {
  id: number;
  name: string;
}
interface NativeState {
  kind: 'opening' | 'buffering' | 'playing' | 'paused' | 'stopped' | 'ended' | 'error' | 'time' | 'length' | 'tracks' | 'vout' | 'poll';
  position: number;
  duration: number;
  playing: boolean;
  buffering: number;
  width: number;
  height: number;
  live: boolean;
}
export interface NativeTracks {
  audio: NativeTrack[];
  audioCurrent: number;
  subs: NativeTrack[];
  subCurrent: number;
}

interface NativePlayerPlugin {
  load(o: { url: string; startAt: number; live: boolean }): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  stop(): Promise<void>;
  seek(o: { position: number }): Promise<void>;
  setBounds(o: { x: number; y: number; width: number; height: number; visible: boolean }): Promise<void>;
  getState(): Promise<NativeState>;
  getTracks(): Promise<NativeTracks>;
  setOnTop(o: { on: boolean }): Promise<void>;
  setDebugBackground(o: { color: string }): Promise<void>;
  setWindowTranslucent(o: { on: boolean }): Promise<void>;
  setWebTransparent(o: { layer: 'none' | 'default' | 'hardware' | 'software' }): Promise<void>;
  setAudioTrack(o: { id: number }): Promise<void>;
  setSubtitleTrack(o: { id: number }): Promise<void>;
  addListener(event: 'state', fn: (s: NativeState) => void): Promise<PluginListenerHandle>;
}

const NativePlayer = registerPlugin<NativePlayerPlugin>('NativePlayer');
// Diagnostic depuis la console (chrome://inspect) : spNative.setOnTop({ on: true }), spNative.getState()…
(window as any).spNative = NativePlayer;

function available(): boolean {
  if (platform !== 'android') return false;
  try {
    return Capacitor.isPluginAvailable('NativePlayer');
  } catch {
    return false;
  }
}

/** Vrai quand le lecteur natif est présent (application Android / Fire TV). */
export const hasNativePlayer = available();

/** Élément vidéo factice piloté par le lecteur natif (voir createNativeMedia). */
export interface NativeMedia extends HTMLVideoElement {
  __native: {
    load(url: string, startAt: number): void;
    tracks: NativeTracks;
    bufferPct: number;
  };
}

export function isNativeMedia(v: HTMLVideoElement): v is NativeMedia {
  return !!(v as any).__native;
}

export function createNativeMedia(): NativeMedia {
  const el = document.createElement('div') as any;
  el.id = 'video';
  el.className = 'native-video';
  const st = {
    url: null as string | null,
    live: false,
    currentTime: 0,
    duration: NaN,
    paused: true,
    ended: false,
    readyState: 0,
    error: null as { code: number; message: string } | null,
    width: 0,
    height: 0,
    metadataSent: false,
    firstFrameSent: false,
    /** Surface cachée (erreur, fin) pour laisser voir le message affiché par la page. */
    hidden: false,
  };
  const fire = (type: string) => {
    try {
      el.dispatchEvent(new Event(type));
    } catch {
      /* moteur très ancien */
    }
  };
  const tracks: NativeTracks = { audio: [], audioCurrent: -1, subs: [], subCurrent: -1 };
  const emptyRanges = { length: 0, start: () => 0, end: () => 0 };

  Object.defineProperties(el, {
    currentTime: {
      get: () => st.currentTime,
      set: (v: number) => {
        if (!st.url) return;
        st.currentTime = v;
        void NativePlayer.seek({ position: v });
        fire('seeking');
      },
    },
    duration: { get: () => st.duration },
    paused: { get: () => st.paused },
    ended: { get: () => st.ended },
    readyState: { get: () => st.readyState },
    networkState: { get: () => (st.url ? 2 : 0) },
    error: { get: () => st.error },
    buffered: { get: () => emptyRanges },
    seekable: { get: () => emptyRanges },
    videoWidth: { get: () => st.width },
    videoHeight: { get: () => st.height },
    textTracks: { get: () => ({ length: 0 }) },
    muted: { get: () => false, set: () => undefined },
    volume: { get: () => 1, set: () => undefined },
    playbackRate: { get: () => 1, set: () => undefined },
    preload: { get: () => 'auto', set: () => undefined },
    src: {
      get: () => st.url || '',
      set: (v: string) => {
        if (v) el.__native.load(v, 0);
      },
    },
  });
  el.canPlayType = () => 'probably';
  el.play = () => {
    if (!st.url) return Promise.reject(new Error('aucun flux'));
    return NativePlayer.play();
  };
  el.pause = () => {
    if (st.url) void NativePlayer.pause();
  };
  el.load = () => {
    // Comme pour un <video> : sans attribut src, load() décharge le flux.
    if (!el.getAttribute('src') && st.url) {
      st.url = null;
      document.documentElement.classList.remove('native-playing');
      st.paused = true;
      st.readyState = 0;
      st.currentTime = 0;
      st.duration = NaN;
      st.width = st.height = 0;
      void NativePlayer.stop();
      updateBounds(true);
    }
  };

  const reset = (url: string, live: boolean) => {
    st.url = url;
    st.live = live;
    st.currentTime = 0;
    st.duration = live ? Infinity : NaN;
    st.paused = true;
    st.ended = false;
    st.readyState = 0;
    st.error = null;
    st.width = st.height = 0;
    st.metadataSent = false;
    st.firstFrameSent = false;
    st.hidden = false;
    tracks.audio = [];
    tracks.subs = [];
    tracks.audioCurrent = tracks.subCurrent = -1;
  };

  el.__native = {
    tracks,
    bufferPct: 0,
    load(url: string, startAt: number) {
      const live = /\/live\/|\.ts(\?|$)|\.m3u8?(\?|$)/i.test(url) && !/\/movie\/|\/series\//i.test(url);
      reset(url, live);
      document.documentElement.classList.add('native-playing');
      el.setAttribute('src', url);
      fire('loadstart');
      fire('waiting');
      updateBounds(true);
      NativePlayer.load({ url, startAt, live }).catch((e: any) => {
        st.error = { code: 4, message: 'libVLC : ' + String((e && e.message) || e) };
        fire('error');
      });
    },
  };

  // ── Position de la surface native : celle de cet élément dans la page ──
  let last = '';
  const updateBounds = (force = false) => {
    let visible = !!st.url && !st.hidden && el.isConnected;
    let x = 0;
    let y = 0;
    let w = 0;
    let hh = 0;
    if (visible) {
      const r = el.getBoundingClientRect();
      x = Math.round(r.left);
      y = Math.round(r.top);
      w = Math.round(r.width);
      hh = Math.round(r.height);
      if (w <= 0 || hh <= 0) visible = false;
    }
    const key = visible ? x + ',' + y + ',' + w + ',' + hh : 'hidden';
    if (!force && key === last) return;
    last = key;
    void NativePlayer.setBounds({ x, y, width: w, height: hh, visible });
  };
  window.setInterval(() => {
    if (st.url || last !== 'hidden') updateBounds();
  }, 120);
  window.addEventListener('resize', () => updateBounds());

  // ── Événements du lecteur natif → événements « vidéo » ──
  const refreshTracks = () => {
    NativePlayer.getTracks().then((t) => {
      tracks.audio = t.audio || [];
      tracks.subs = t.subs || [];
      tracks.audioCurrent = t.audioCurrent;
      tracks.subCurrent = t.subCurrent;
      fire('nativetracks');
    }, () => undefined);
  };
  void NativePlayer.addListener('state', (s) => {
    if (!st.url) return;
    if (s.width) st.width = s.width;
    if (s.height) st.height = s.height;
    switch (s.kind) {
      case 'opening':
        fire('waiting');
        break;
      case 'buffering':
        el.__native.bufferPct = s.buffering;
        if (s.buffering < 100) {
          if (st.readyState >= 3) {
            st.readyState = 2;
            fire('waiting');
          }
        } else if (st.readyState < 3) {
          st.readyState = 3;
          fire('canplay');
        }
        break;
      case 'playing':
        st.paused = false;
        st.ended = false;
        st.readyState = 4;
        if (!st.metadataSent) {
          st.metadataSent = true;
          fire('loadedmetadata');
        }
        fire('play');
        fire('playing');
        if (!st.firstFrameSent) {
          st.firstFrameSent = true;
          mark('lecteur natif : lecture démarrée');
          refreshTracks();
        }
        break;
      case 'paused':
        st.paused = true;
        fire('pause');
        break;
      case 'stopped':
        st.paused = true;
        break;
      case 'ended':
        st.paused = true;
        st.ended = true;
        st.hidden = true;
        updateBounds();
        fire('ended');
        break;
      case 'error':
        st.paused = true;
        st.hidden = true;
        updateBounds();
        st.error = { code: 2, message: 'libVLC : flux illisible ou injoignable' };
        fire('error');
        break;
      case 'time':
        st.currentTime = s.position;
        if (st.readyState < 4) st.readyState = 4;
        fire('timeupdate');
        break;
      case 'length':
        st.duration = s.duration > 0 ? s.duration : st.live ? Infinity : NaN;
        fire('durationchange');
        if (!st.metadataSent && s.duration > 0) {
          st.metadataSent = true;
          fire('loadedmetadata');
        }
        break;
      case 'tracks':
        refreshTracks();
        break;
      case 'vout':
        fire('resize');
        break;
      default:
        break;
    }
  });

  return el as NativeMedia;
}

/** Pistes audio / sous-titres du lecteur natif. */
export function nativeSetAudio(id: number): void {
  void NativePlayer.setAudioTrack({ id });
}
export function nativeSetSubtitle(id: number): void {
  void NativePlayer.setSubtitleTrack({ id });
}
