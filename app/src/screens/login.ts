import type { Screen } from '../app';
import { app } from '../app';
import type { Playlist } from '../types';
import { h } from '../ui/dom';
import { logoMark, icon } from '../ui/icons';
import { btn, chips, iconBtn } from '../ui/components';
import { hashId } from '../m3u';
import { toast } from '../ui/dom';
import * as store from '../storage';
import { t } from '../i18n';

/** Compte Xtream de démonstration (bouton « Essayer »). */
const DEMO_XTREAM = { server: 'http://kemotvpromax.xyz:80', username: 'TG2wLJ5CRB', password: 'aeqWu2TBbM' };

/**
 * 2. Connexion : identifiants du fournisseur IPTV (Xtream Codes) ou lien M3U.
 * `params.add` : ajout d'une playlist supplémentaire depuis le profil.
 */
export function login(params: { add?: boolean }): Screen {
  let type: 'xtream' | 'm3u' = 'xtream';

  const field = (ph: string, type: string, ic?: 'lock' | 'globe' | 'user' | 'wifi') =>
    h('input', {
      class: 'input focusable',
      type,
      placeholder: ph,
      autocapitalize: 'off',
      autocomplete: 'off',
      spellcheck: 'false',
      'data-icon': ic,
    });
  const server = field(t('server'), 'url');
  const user = field(t('username'), 'text');
  const pass = field(t('password'), 'password');
  const url = field(t('m3uUrl'), 'url');
  const name = field(t('playlistName'), 'text');

  const eye = iconBtn('eye', t('password'), () => {
    pass.type = pass.type === 'password' ? 'text' : 'password';
  }, 'input-eye');

  const xtreamFields = h(
    'div',
    { class: 'fields' },
    wrap(server, 'globe'),
    wrap(user, 'user'),
    h('div', { class: 'input-wrap' }, icon('lock', 'input-ic'), pass, eye),
  );
  const m3uFields = h('div', { class: 'fields hidden' }, wrap(url, 'wifi'));

  const tabs = chips(
    [
      { id: 'xtream', label: t('xtream') },
      { id: 'm3u', label: t('m3uLink') },
    ],
    type,
    (id) => {
      type = id as 'xtream' | 'm3u';
      xtreamFields.classList.toggle('hidden', type !== 'xtream');
      m3uFields.classList.toggle('hidden', type !== 'm3u');
    },
  );
  tabs.classList.add('segmented');

  const connect = async (p: Playlist) => {
    if (await app.openPlaylist(p, true)) {
      store.savePlaylist(p);
      store.updateSettings({ onboarded: true });
      app.reset('home');
    }
  };

  const submit = () => {
    if (type === 'm3u') {
      const u = url.value.trim();
      if (!/^https?:\/\//i.test(u)) return toast(t('invalidUrl'), true);
      return connect({ id: hashId(u), name: name.value.trim() || 'Playlist M3U', source: { type: 'm3u', url: u } });
    }
    const s = server.value.trim();
    const us = user.value.trim();
    if (!s || !us || !pass.value) return toast(t('requiredFields'), true);
    connect({
      id: hashId(s + '|' + us),
      name: name.value.trim() || us,
      source: { type: 'xtream', server: s, username: us, password: pass.value },
    });
  };

  const form = h(
    'form',
    {
      class: 'auth-card',
      on: {
        submit: (e: Event) => {
          e.preventDefault();
          submit();
        },
      },
    },
    h('div', { class: 'auth-logo' }, logoMark(56)),
    h('h1', { text: params.add ? t('addPlaylist') : t('welcome') }),
    h('p', { class: 'muted', text: t('loginSub') }),
    tabs,
    xtreamFields,
    m3uFields,
    wrap(name, 'user'),
    h('button', { type: 'submit', class: 'btn btn-primary btn-block focusable' }, h('span', { text: t('signIn') })),
    h('div', { class: 'auth-sep' }, h('span', { text: t('or') })),
    btn(t('tryDemo'), {
      variant: 'glass',
      cls: 'btn-block',
      icon: 'play',
      onClick: () => connect({ id: 'demo-xtream', name: 'Démo', source: { type: 'xtream', server: DEMO_XTREAM.server, username: DEMO_XTREAM.username, password: DEMO_XTREAM.password } }),
    }),
    h('p', { class: 'legal', text: t('legal') }),
  );

  const el = h(
    'section',
    { class: 'auth' },
    h('div', { class: 'glow' }),
    params.add || store.getPlaylists().length ? iconBtn('back', t('close'), () => app.back(), 'auth-back') : null,
    form,
  );
  return { el, chrome: 'none' };
}

function wrap(input: HTMLInputElement, ic: 'lock' | 'globe' | 'user' | 'wifi'): HTMLElement {
  return h('div', { class: 'input-wrap' }, icon(ic, 'input-ic'), input);
}
