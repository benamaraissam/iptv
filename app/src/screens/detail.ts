import type { Screen } from '../app';
import { app, refOf } from '../app';
import type { Channel, Details, Episode, Playable, Show } from '../types';
import { h, clear } from '../ui/dom';
import { art, btn, chips, emptyState, iconBtn, listRow } from '../ui/components';
import { icon } from '../ui/icons';
import { focusFirst } from '../navigation';
import * as store from '../storage';
import { preloadImage } from '../catalog';
import { formatRemaining, t } from '../i18n';

export function episodePlayable(show: Show, d: Details, ep: Episode): Playable {
  return {
    id: ep.id,
    kind: 'episode',
    title: d.title || show.name,
    subtitle: 'S' + ep.season + ' E' + ep.episode + ' · ' + ep.title,
    url: ep.url,
    poster: ep.image || d.backdrop || show.cover,
    showId: show.id,
    season: ep.season,
    episode: ep.episode,
  };
}

export function allEpisodes(d: Details): Episode[] {
  const out: Episode[] = [];
  for (const s of d.seasons || []) for (const e of s.episodes) out.push(e);
  return out;
}

/** 15 / 19. Fiche détaillée d'un film ou d'une série. */
export function detail(params: { id: string }): Screen {
  const cat = app.catalog!;
  const item = cat.get(params.id) as Channel | Show | undefined;
  const el = h('section', { class: 'detail' });
  if (!item) {
    el.appendChild(emptyState('noResults', t('noResults'), ''));
    return { el, chrome: 'nav' };
  }
  const isShow = !('kind' in item);
  const name = item.name;
  const pid = cat.playlist.id;

  // Fond : l'affiche s'affiche tout de suite (déjà en cache du navigateur), puis le grand
  // visuel la remplace en fondu une fois téléchargé ; en cas d'échec on garde l'affiche.
  const bg = h('div', { class: 'detail-bg' }, h('div', { class: 'bg-base' }));
  let bgUrl = '';
  const setBg = (url?: string, instant = false) => {
    if (!url || url === bgUrl) return;
    preloadImage(url).then((ok) => {
      if (!ok || url === bgUrl) return;
      bgUrl = url;
      const layer = h('div', { class: 'bg-layer' + (instant ? ' in' : ''), style: 'background-image:url("' + url.replace(/"/g, '%22') + '")' });
      bg.appendChild(layer);
      if (!instant) window.setTimeout(() => layer.classList.add('in'), 20);
      window.setTimeout(() => {
        while (bg.children.length > 2 && bg.children[1] !== layer) bg.removeChild(bg.children[1]);
      }, 700);
    });
  };
  const posterUrl = isShow ? (item as Show).cover : (item as Channel).logo;
  setBg(isShow ? (item as Show).backdrop || posterUrl : posterUrl, true);
  const meta = h('div', { class: 'meta' });
  const plot = h('p', { class: 'detail-plot' });
  const actions = h('div', { class: 'detail-actions' });
  const extra = h('div', { class: 'detail-extra' });
  const info = h(
    'div',
    { class: 'detail-info' },
    h('h1', { class: 'detail-title', text: name }),
    meta,
    plot,
    actions,
  );

  // Le visuel défile avec le contenu (sinon les épisodes passent par-dessus l'image).
  const scroll = h(
    'div',
    { class: 'scroll detail-scroll' },
    bg,
    h('div', { class: 'detail-shade' }),
    !app.wide ? h('div', { class: 'detail-top' }, iconBtn('back', t('close'), () => app.back())) : null,
    info,
    extra,
  );
  el.appendChild(scroll);

  const listBtn = () => {
    const on = app.inMyList(item.id);
    const b = btn(on ? t('inMyList') : t('addToList'), {
      variant: 'glass',
      icon: on ? 'check' : 'plus',
      onClick: () => {
        app.toggleMyList(refOf(item));
        actions.replaceChild(listBtn(), b);
        focusFirst(actions);
      },
    });
    b.classList.add('list-toggle');
    return b;
  };

  const fill = (d: Details) => {
    clear(meta);
    const tags = [d.year, d.genre ? d.genre.split(/[,/]/)[0].trim() : '', d.duration].filter(Boolean) as string[];
    for (const tg of tags) meta.appendChild(h('span', { class: 'tag', text: tg }));
    if (d.rating) meta.appendChild(h('span', { class: 'rating' }, icon('star'), String(Math.round(d.rating * 10) / 10)));
    if (isShow && d.seasons && d.seasons.length) meta.appendChild(h('span', { class: 'tag', text: d.seasons.length + ' ' + t('seasons') }));
    plot.textContent = d.plot || '';
    setBg(d.backdrop);

    clear(actions);
    if (isShow) {
      const show = item as Show;
      const eps = allEpisodes(d);
      const last = store.getHistory(pid).filter((x) => x.showId === show.id)[0];
      const resumeEp = last ? eps.filter((e) => e.id === last.id)[0] : undefined;
      const target = resumeEp || eps[0];
      if (target) {
        actions.appendChild(
          btn(resumeEp ? t('resume') + ' S' + target.season + ' E' + target.episode : t('play'), {
            variant: 'primary',
            icon: 'play',
            autofocus: true,
            onClick: () => playEpisode(show, d, target),
          }),
        );
      }
    } else {
      const movie = item as Channel;
      const prog = store.getProgress(pid, movie.id);
      const resumable = prog && prog.dur > 0 && prog.pos > 30 && prog.pos / prog.dur < 0.95;
      actions.appendChild(
        btn(resumable ? t('resume') : t('play'), {
          variant: 'primary',
          icon: 'play',
          autofocus: true,
          onClick: () =>
            app.play({ id: movie.id, kind: 'movie', title: d.title || movie.name, subtitle: tags.join(' · '), url: movie.url, poster: d.backdrop || movie.logo }),
        }),
      );
      if (resumable) {
        meta.appendChild(h('span', { class: 'tag accent', text: formatRemaining(prog!.dur - prog!.pos) + ' ' + t('left') }));
      }
    }
    actions.appendChild(listBtn());

    clear(extra);
    if (isShow) renderSeries(extra, item as Show, d);
    if (d.cast && d.cast.length) extra.appendChild(castRow(d.cast));
    if (d.director) extra.appendChild(h('p', { class: 'muted credits', text: t('director') + ' : ' + d.director }));
    if (el.classList.contains('active') && !el.contains(document.activeElement)) focusFirst(actions);
  };

  const playEpisode = (show: Show, d: Details, ep: Episode) => {
    const eps = allEpisodes(d);
    app.play(episodePlayable(show, d, ep), { queue: eps.map((e) => episodePlayable(show, d, e)), index: eps.indexOf(ep) });
  };

  const renderSeries = (box: HTMLElement, show: Show, d: Details) => {
    const seasons = d.seasons || [];
    if (!seasons.length) return;
    let season = seasons[0].season;
    const last = store.getHistory(pid).filter((x) => x.showId === show.id)[0];
    if (last && last.season) season = last.season;
    const list = h('div', { class: 'episode-list' });
    const renderEps = () => {
      clear(list);
      const s = seasons.filter((x) => x.season === season)[0] || seasons[0];
      for (const ep of s.episodes) {
        const prog = store.getProgress(pid, ep.id);
        list.appendChild(
          listRow(
            {
              title: ep.episode + '. ' + ep.title,
              sub: prog && prog.dur ? formatRemaining(prog.dur - prog.pos) + ' ' + t('left') : ep.duration || '',
              image: ep.image || d.backdrop || show.cover,
              imageShape: 'landscape',
              progress: prog && prog.dur ? prog.pos / prog.dur : undefined,
              chevron: true,
            },
            () => playEpisode(show, d, ep),
          ),
        );
      }
    };
    box.appendChild(h('h2', { class: 'section-title', text: t('episodes') }));
    if (seasons.length > 1) {
      box.appendChild(
        chips(
          seasons.map((s) => ({ id: String(s.season), label: t('season') + ' ' + s.season })),
          String(season),
          (id) => {
            season = parseInt(id, 10);
            renderEps();
          },
        ),
      );
    }
    box.appendChild(list);
    renderEps();
  };

  // Fiche déjà préchargée (survol / sélection) : affichage immédiat, sans attente.
  const known = cat.cachedDetails(item.id);
  fill(known || { title: name, poster: posterUrl });
  if (!known) cat.details(item).then(fill, () => undefined);

  return { el, chrome: 'nav', tab: isShow ? 'series' : 'movies' };
}

function castRow(cast: string[]): HTMLElement {
  return h(
    'section',
    { class: 'cast' },
    h('h2', { class: 'section-title', text: t('cast') }),
    h(
      'div',
      { class: 'rail-track' },
      cast.map((p) => h('div', { class: 'cast-item' }, art(undefined, p, 'round'), h('span', { text: p }))),
    ),
  );
}
