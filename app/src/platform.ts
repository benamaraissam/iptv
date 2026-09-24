import { Capacitor } from '@capacitor/core';

export type PlatformName = 'tizen' | 'webos' | 'android' | 'ios' | 'web';

declare global {
  interface Window {
    tizen?: any;
    webOS?: any;
    PalmSystem?: unknown;
  }
}

function detect(): PlatformName {
  if (typeof window.tizen !== 'undefined') return 'tizen';
  if (typeof window.webOS !== 'undefined' || typeof window.PalmSystem !== 'undefined') return 'webos';
  if (Capacitor.isNativePlatform()) {
    const p = Capacitor.getPlatform();
    if (p === 'android' || p === 'ios') return p;
  }
  return 'web';
}

export const platform: PlatformName = detect();
export const isTV = platform === 'tizen' || platform === 'webos';
export const isNative = Capacitor.isNativePlatform();

/** Actions logiques, indépendantes de la télécommande ou du clavier. */
export type Action =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'enter'
  | 'back'
  | 'playpause'
  | 'play'
  | 'pause'
  | 'stop'
  | 'chup'
  | 'chdown'
  | 'red'
  | 'green'
  | 'yellow'
  | 'blue'
  | 'digit';

const KEYMAP: Record<number, Action> = {
  37: 'left',
  38: 'up',
  39: 'right',
  40: 'down',
  13: 'enter',
  27: 'back', // Échap (navigateur)
  10009: 'back', // Tizen RETURN
  461: 'back', // webOS BACK
  10252: 'playpause', // Tizen MediaPlayPause
  415: 'play',
  19: 'pause',
  413: 'stop',
  427: 'chup', // Tizen ChannelUp
  428: 'chdown', // Tizen ChannelDown
  33: 'chup', // webOS / PageUp
  34: 'chdown', // webOS / PageDown
  403: 'red',
  404: 'green',
  405: 'yellow',
  406: 'blue',
};

export function keyToAction(e: KeyboardEvent): Action | null {
  const code = e.keyCode || 0;
  if (code >= 48 && code <= 57) return 'digit';
  if (code >= 96 && code <= 105) return 'digit';
  return KEYMAP[code] || null;
}

/**
 * Sur Tizen, les touches média / couleur / chiffres doivent être déclarées
 * explicitement pour être reçues par l'application.
 */
export function registerTvKeys(): void {
  if (platform !== 'tizen') return;
  const keys = [
    'MediaPlayPause',
    'MediaPlay',
    'MediaPause',
    'MediaStop',
    'ChannelUp',
    'ChannelDown',
    'ColorF0Red',
    'ColorF1Green',
    'ColorF2Yellow',
    'ColorF3Blue',
    '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
  ];
  for (const k of keys) {
    try {
      window.tizen.tvinputdevice.registerKey(k);
    } catch {
      /* touche non supportée par ce modèle */
    }
  }
}

/** Quitte l'application (bouton retour sur l'écran d'accueil). */
export function exitApp(): void {
  try {
    if (platform === 'tizen') {
      window.tizen.application.getCurrentApplication().exit();
      return;
    }
    if (platform === 'webos') {
      if (window.webOS && window.webOS.platformBack) window.webOS.platformBack();
      else window.close();
      return;
    }
    if (platform === 'android') {
      import('@capacitor/app').then(({ App }) => App.exitApp());
    }
  } catch {
    /* ignore */
  }
}
