import type { Screen } from '../app';
import { app } from '../app';
import { h, clear, toast } from '../ui/dom';
import { icon, type IconName } from '../ui/icons';
import {
  askPin,
  chooseOption,
  confirmDialog,
  screenHeader,
  settingGroup,
  settingRow,
  toggleSwitch,
} from '../ui/components';
import * as store from '../storage';
import { formatDate, getLang, setLang, t, type TKey } from '../i18n';
import { brandClock } from './common';

function header(title: string, back: boolean): HTMLElement {
  return app.wide
    ? h('header', { class: 'tv-header' }, h('h1', { class: 'screen-title', text: title }), brandClock())
    : screenHeader(title, back ? { back: () => app.back() } : {});
}

// ───────────── 16. Catégories ─────────────

const GROUP_ICONS: [RegExp, IconName][] = [
  [/sport|foot|bein|match/i, 'sports'],
  [/news|info|actu/i, 'news'],
  [/kid|enfant|jeunesse|cartoon|dessin/i, 'kids'],
  [/music|musique|clip/i, 'music'],
  [/doc/i, 'info'],
  [/radio/i, 'radio'],
];

export function categories(): Screen {
  const cat = app.catalog!;
  const tile = (ic: IconName, label: string, count: number | null, go: () => void, cls = '') =>
    h(
      'button',
      { type: 'button', class: 'big-tile focusable ' + cls, on: { click: go } },
      h('span', { class: 'big-tile-ic' }, icon(ic)),
      h('span', { class: 'big-tile-label', text: label }),
      count !== null ? h('span', { class: 'big-tile-count', text: String(count) }) : null,
    );
  const main = [
    tile('live', t('liveTv'), cat.live.length, () => app.reset('live'), 't-blue'),
    tile('movie', t('movies'), cat.movies.length, () => app.push('movies'), 't-red'),
    tile('series', t('series'), cat.shows.length, () => app.push('series'), 't-violet'),
    tile('guide', t('tvGuide'), null, () => app.push('guide'), 't-teal'),
    tile('catchup', t('catchup'), cat.catchupChannels.length, () => app.push('catchup'), 't-indigo'),
    tile('heart', t('myList'), store.getMyList(cat.playlist.id).length, () => app.reset('library'), 't-pink'),
  ].filter((_x, i) => !(i === 1 && !cat.movies.length) && !(i === 2 && !cat.shows.length));

  const groups = cat.groups(cat.live).map((g) => {
    let ic: IconName = 'live';
    for (const [re, name] of GROUP_ICONS) if (re.test(g)) ic = name;
    const locked = app.isLocked(g);
    return tile(locked ? 'lock' : ic, g, cat.live.filter((c) => c.group === g).length, () => app.reset('live', { group: g }), 't-glass');
  });

  const body = h(
    'div',
    { class: 'scroll' },
    h('div', { class: 'tile-grid' }, main),
    groups.length ? h('h2', { class: 'section-title', text: t('liveTv') }) : null,
    h('div', { class: 'tile-grid small' }, groups),
  );
  return { el: h('section', { class: 'categories' }, header(t('categories'), true), body), chrome: 'nav', tab: 'home' };
}

// ───────────── Profil ─────────────

export function profile(): Screen {
  const cat = app.catalog!;
  const p = cat.playlist;
  const acc = cat.account;
  const body = h('div', { class: 'scroll settings-body' });

  const accountRows: HTMLElement[] = [];
  if (p.source.type === 'xtream') {
    accountRows.push(settingRow('user', t('username'), { value: p.source.username }));
    if (acc && acc.status) accountRows.push(settingRow('shield', t('status'), { value: acc.status }));
    accountRows.push(settingRow('clock', t('expires'), { value: acc && acc.expires ? formatDate(acc.expires) : t('unlimited') }));
    if (acc && acc.maxConnections) {
      accountRows.push(settingRow('devices', t('connectedDevices'), { value: (acc.activeConnections || 0) + ' / ' + acc.maxConnections, onClick: () => app.push('devices') }));
    }
  } else {
    accountRows.push(settingRow('wifi', t('m3uLink'), { value: shortUrl(p.source.url) }));
  }

  body.appendChild(
    h(
      'div',
      { class: 'profile-card' },
      h('div', { class: 'avatar' }, h('span', { text: p.name.slice(0, 1).toUpperCase() })),
      h('div', null, h('div', { class: 'profile-name', text: p.name }), h('div', { class: 'muted', text: p.source.type === 'xtream' ? t('xtream') : t('m3uLink') })),
    ),
  );
  body.appendChild(settingGroup(t('account'), accountRows));
  body.appendChild(
    settingGroup(null, [
      settingRow('heart', t('myList'), { onClick: () => app.reset('library', { tab: 'list' }) }),
      settingRow('clock', t('history'), { onClick: () => app.reset('library', { tab: 'history' }) }),
      settingRow('catchup', t('catchup'), { onClick: () => app.push('catchup') }),
      settingRow('grid', t('categories'), { onClick: () => app.push('categories') }),
    ]),
  );
  body.appendChild(
    settingGroup(null, [
      settingRow('library', t('playlists'), { value: String(store.getPlaylists().length), onClick: () => app.push('playlists') }),
      settingRow('settings', t('settings'), { onClick: () => app.push('settings') }),
      settingRow('shield', t('parentalControl'), { onClick: () => app.push('parental') }),
      settingRow('logout', t('signOut'), {
        danger: true,
        onClick: async () => {
          if (!(await confirmDialog(t('confirmRemove'), t('signOut')))) return;
          store.removePlaylist(p.id);
          app.catalog = null;
          app.reset('splash');
        },
      }),
    ]),
  );
  return { el: h('section', { class: 'profile' }, header(t('profile'), false), body), chrome: 'nav', tab: 'profile' };
}

function shortUrl(u: string): string {
  return u.replace(/^https?:\/\//, '').slice(0, 32) + (u.length > 40 ? '…' : '');
}

// ───────────── Connexions (appareils) ─────────────

export function devices(): Screen {
  const cat = app.catalog!;
  const body = h('div', { class: 'scroll settings-body' });
  const render = () => {
    clear(body);
    const a = cat.account;
    if (!a) return;
    body.appendChild(
      settingGroup(t('connectedDevices'), [
        settingRow('devices', t('activeConnections'), { value: (a.activeConnections || 0) + ' / ' + (a.maxConnections || '∞') }),
        settingRow('clock', t('expires'), { value: a.expires ? formatDate(a.expires) : t('unlimited') }),
        a.created ? settingRow('info', 'Création', { value: formatDate(a.created) }) : null,
        settingRow('refresh', t('refresh'), {
          onClick: () => cat.refreshAccount().then(render, () => toast(t('noInternet'), true)),
        }),
      ]),
    );
    const max = a.maxConnections || 1;
    const used = Math.min(max, a.activeConnections || 0);
    const meter = h('div', { class: 'conn-meter' });
    for (let i = 0; i < max && i < 10; i++) meter.appendChild(h('i', { class: i < used ? 'on' : '' }, icon(i === 0 ? 'devices' : 'live')));
    body.insertBefore(meter, body.firstChild);
  };
  render();
  return { el: h('section', { class: 'devices' }, header(t('connectedDevices'), true), body), chrome: 'nav', tab: 'profile' };
}

// ───────────── Paramètres ─────────────

export function settings(): Screen {
  const body = h('div', { class: 'scroll settings-body' });
  const render = () => {
    clear(body);
    const s = store.getSettings();
    const qLabel: Record<string, TKey> = { auto: 'qualityAuto', high: 'qualityHigh', low: 'qualityLow' };
    body.appendChild(
      settingGroup(t('settings'), [
        settingRow('globe', t('language'), {
          value: getLang() === 'fr' ? 'Français' : 'English',
          onClick: async () => {
            const v = await chooseOption(t('language'), [
              { id: 'fr', label: 'Français' },
              { id: 'en', label: 'English' },
            ], getLang());
            if (v && v !== getLang()) {
              store.updateSettings({ lang: v as 'fr' | 'en' });
              setLang(v as 'fr' | 'en');
              app.rebuild();
            }
          },
        }),
        settingRow('quality', t('videoQuality'), {
          value: t(qLabel[s.quality]),
          onClick: async () => {
            const v = await chooseOption(t('videoQuality'), [
              { id: 'auto', label: t('qualityAuto') },
              { id: 'high', label: t('qualityHigh') },
              { id: 'low', label: t('qualityLow') },
            ], s.quality);
            if (v) {
              store.updateSettings({ quality: v as 'auto' | 'high' | 'low' });
              render();
            }
          },
        }),
        settingRow('next', t('autoplayNext'), { toggle: toggleSwitch(s.autoplayNext, (v) => store.updateSettings({ autoplayNext: v })) }),
        settingRow('shield', t('parentalControl'), { onClick: () => app.push('parental') }),
      ]),
    );
    const cat = app.catalog;
    body.appendChild(
      settingGroup(t('account'), [
        settingRow('library', t('playlists'), { onClick: () => app.push('playlists') }),
        cat
          ? settingRow('refresh', t('refresh'), {
              onClick: async () => {
                if (await app.openPlaylist(cat.playlist, true)) app.reset('home');
              },
            })
          : null,
        app.wide ? settingRow('user', t('profile'), { onClick: () => app.push('profile') }) : null,
        settingRow('info', t('version'), { value: '1.0.0' }),
      ]),
    );
  };
  render();
  return { el: h('section', { class: 'settings' }, header(t('settings'), !app.wide), body), chrome: 'nav', tab: app.wide ? 'settings' : 'profile' };
}

// ───────────── Contrôle parental ─────────────

export function parental(): Screen {
  const cat = app.catalog!;
  const body = h('div', { class: 'scroll settings-body' });

  const render = () => {
    clear(body);
    const p = store.getParental();
    const setP = (patch: Partial<store.Parental>) => {
      const next = store.getParental();
      for (const k in patch) (next as any)[k] = (patch as any)[k];
      store.setParental(next);
    };

    body.appendChild(
      settingGroup(null, [
        settingRow('shield', t('enableParental'), {
          toggle: toggleSwitch(p.enabled, async (v) => {
            if (v && !p.pin) {
              const pin = await askPin(t('newPin'));
              if (!pin) return render();
              setP({ enabled: true, pin });
            } else if (!v) {
              const ok = await askPin(t('enterPin'), (x) => x === p.pin);
              if (!ok) return render();
              setP({ enabled: false });
            } else setP({ enabled: true });
            render();
          }),
        }),
        settingRow('lock', t('pinCode'), {
          value: p.pin ? '••••' : '—',
          onClick: async () => {
            if (p.pin && !(await askPin(t('enterPin'), (x) => x === p.pin))) return;
            const pin = await askPin(t('newPin'));
            if (pin) {
              setP({ pin });
              render();
            }
          },
        }),
        settingRow('kids', t('lockAdult'), { toggle: toggleSwitch(p.lockAdult, (v) => setP({ lockAdult: v })) }),
      ]),
    );

    if (!p.enabled) return;
    const groups = cat.groups((cat.live as { group: string }[]).concat(cat.movies, cat.shows));
    body.appendChild(
      settingGroup(
        t('lockedCategories'),
        groups.map((g) =>
          settingRow(null, g, {
            toggle: toggleSwitch(p.lockedGroups.indexOf(g) !== -1, (v) => {
              const list = store.getParental().lockedGroups.filter((x) => x !== g);
              if (v) list.push(g);
              setP({ lockedGroups: list });
            }),
          }),
        ),
      ),
    );
  };

  // Protéger l'accès aux réglages eux-mêmes.
  const guard = store.getParental();
  const el = h('section', { class: 'parental' }, header(t('parentalControl'), true), body);
  if (guard.enabled && guard.pin) {
    body.appendChild(h('div', { class: 'loading-inline' }));
    askPin(t('enterPin'), (x) => x === guard.pin).then((ok) => (ok ? render() : app.back()));
  } else render();
  return { el, chrome: 'nav', tab: app.wide ? 'settings' : 'profile' };
}

// ───────────── Playlists ─────────────

export function playlists(): Screen {
  const body = h('div', { class: 'scroll settings-body' });
  const render = () => {
    clear(body);
    const active = app.catalog ? app.catalog.playlist.id : '';
    const rows = store.getPlaylists().map((p) => {
      const row = settingRow(p.id === active ? 'check' : 'library', p.name, {
        value: p.source.type === 'xtream' ? t('xtream') : 'M3U',
        onClick: async () => {
          if (p.id === active) return;
          if (await app.openPlaylist(p)) app.reset('home');
        },
      });
      if (p.id === active) row.classList.add('active');
      return h(
        'div',
        { class: 'playlist-line' },
        row,
        h(
          'button',
          {
            type: 'button',
            class: 'btn btn-icon focusable',
            'aria-label': t('remove'),
            on: {
              click: async () => {
                if (!(await confirmDialog(t('confirmRemove'), t('remove')))) return;
                store.removePlaylist(p.id);
                if (p.id === active) {
                  app.catalog = null;
                  return app.reset('splash');
                }
                render();
              },
            },
          },
          icon('trash'),
        ),
      );
    });
    body.appendChild(settingGroup(t('playlists'), rows));
    body.appendChild(settingGroup(null, [settingRow('plus', t('addPlaylist'), { onClick: () => app.push('login', { add: true }) })]));
  };
  render();
  return { el: h('section', { class: 'playlists' }, header(t('playlists'), true), body), chrome: 'nav', tab: app.wide ? 'settings' : 'profile', onShow: render };
}
