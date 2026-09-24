import type { Screen } from '../app';
import { app } from '../app';
import { h, clear } from '../ui/dom';
import { icon, logoMark, type IconName } from '../ui/icons';
import { btn, emptyState } from '../ui/components';
import { focusFirst } from '../navigation';
import * as store from '../storage';
import { t } from '../i18n';

/** 1. Splash : logo, slogan, barre de chargement, puis redirection. */
export function splash(): Screen {
  const el = h(
    'section',
    { class: 'splash' },
    h('div', { class: 'glow' }),
    h(
      'div',
      { class: 'splash-center' },
      logoMark(120),
      h('div', { class: 'brand brand-xl' }, 'Stream', h('b', null, 'Pro')),
      h('div', { class: 'tagline', text: t('tagline') }),
    ),
    h('p', { class: 'splash-sub', text: t('splashSub') }),
    h('div', { class: 'splash-bar' }, h('i')),
  );

  const go = async () => {
    const s = store.getSettings();
    const playlists = store.getPlaylists();
    const active = playlists.filter((p) => p.id === s.activePlaylist)[0] || playlists[0];
    if (active) {
      if (await app.openPlaylist(active)) return app.reset('home');
      return app.reset('offline');
    }
    if (!s.onboarded) return app.reset('onboarding');
    app.reset('login');
  };
  const timer = window.setTimeout(go, 1400);
  return { el, chrome: 'none', destroy: () => window.clearTimeout(timer) };
}

/** Écran « Pas de connexion » : la playlist n'a pas pu être chargée (et pas de cache). */
export function offline(): Screen {
  const el = h(
    'section',
    { class: 'offline' },
    h('div', { class: 'glow' }),
    emptyState(
      'offline',
      t('noInternet'),
      t('noInternetText'),
      h(
        'div',
        { class: 'offline-actions' },
        btn(t('retry'), { variant: 'primary', icon: 'refresh', autofocus: true, onClick: () => app.reset('splash') }),
        btn(t('switchPlaylist'), { variant: 'glass', onClick: () => app.reset('login') }),
      ),
    ),
  );
  return { el, chrome: 'none' };
}

interface Slide {
  title: string;
  text: string;
  art: () => HTMLElement;
}

/** 5-7. Onboarding en trois étapes. */
export function onboarding(): Screen {
  const slides: Slide[] = [
    { title: t('ob1Title'), text: t('ob1Text'), art: artPosters },
    { title: t('ob2Title'), text: t('ob2Text'), art: artDevices },
    { title: t('ob3Title'), text: t('ob3Text'), art: artCrown },
  ];
  let index = 0;
  const el = h('section', { class: 'onboarding' });

  const finish = () => {
    store.updateSettings({ onboarded: true });
    app.reset('login');
  };

  const render = () => {
    clear(el);
    const s = slides[index];
    const last = index === slides.length - 1;
    el.appendChild(
      h(
        'div',
        { class: 'ob-inner' },
        h('div', { class: 'ob-art' }, s.art()),
        h(
          'div',
          { class: 'ob-body' },
          h('h1', { text: s.title }),
          h('p', { text: s.text }),
          h(
            'div',
            { class: 'ob-dots' },
            slides.map((_x, i) => h('i', { class: i === index ? 'on' : '' })),
          ),
          btn(last ? t('getStarted') : t('next'), {
            variant: 'gradient',
            cls: 'btn-block',
            autofocus: true,
            onClick: () => {
              if (last) finish();
              else {
                index++;
                render();
              }
            },
          }),
          !last ? h('button', { type: 'button', class: 'link-btn focusable', text: t('skip'), on: { click: finish } }) : null,
        ),
      ),
    );
    focusFirst(el);
  };
  render();
  return { el, chrome: 'none' };
}

function artPosters(): HTMLElement {
  return h(
    'div',
    { class: 'art-posters' },
    h('div', { class: 'ap ap1' }, icon('movie')),
    h('div', { class: 'ap ap2' }, icon('play')),
    h('div', { class: 'ap ap3' }, icon('series')),
  );
}

function artDevices(): HTMLElement {
  const dev = (ic: IconName, cls: string) => h('div', { class: 'dev ' + cls }, icon(ic));
  return h('div', { class: 'art-devices' }, dev('live', 'dev-tv'), dev('devices', 'dev-tab'), dev('play', 'dev-phone'));
}

function artCrown(): HTMLElement {
  return h('div', { class: 'art-crown' }, h('div', { class: 'crown-glow' }), icon('crown'), h('span', { class: 'q4k', text: '4K' }));
}
