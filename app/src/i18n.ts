export type Lang = 'fr' | 'en';

const fr = {
  tagline: 'IPTV NEXT GENERATION',
  splashSub: 'Votre univers de divertissement',
  // Onboarding
  ob1Title: 'Divertissement sans fin',
  ob1Text: 'TV en direct, films, séries et plus encore, réunis au même endroit.',
  ob2Title: 'Regardez partout',
  ob2Text: 'Sur votre téléphone, votre TV et tous vos appareils, à tout moment.',
  ob3Title: 'Qualité 4K sans limites',
  ob3Text: 'Un streaming d’une netteté parfaite pour une expérience premium.',
  next: 'Suivant',
  skip: 'Passer',
  getStarted: 'Commencer',
  // Connexion
  welcome: 'Bienvenue',
  loginSub: 'Connectez-vous à votre fournisseur IPTV',
  addPlaylist: 'Ajouter une playlist',
  xtream: 'Xtream Codes',
  m3uLink: 'Lien M3U',
  playlistName: 'Nom (facultatif)',
  server: 'Serveur (http://exemple.com:8080)',
  username: 'Nom d’utilisateur',
  password: 'Mot de passe',
  m3uUrl: 'URL de la playlist M3U',
  signIn: 'Se connecter',
  or: 'ou',
  tryDemo: 'Essayer avec la playlist d’exemple',
  invalidUrl: 'Saisissez une URL valide (http/https).',
  requiredFields: 'Serveur, utilisateur et mot de passe sont requis.',
  legal: 'StreamPro est un lecteur : aucun contenu n’est fourni. Utilisez uniquement des flux que vous avez le droit de regarder.',
  loading: 'Chargement…',
  loadError: 'Impossible de charger la playlist',
  errNetwork: 'serveur injoignable. Vérifiez l’adresse (http://, port) et votre connexion.',
  errAuth: 'nom d’utilisateur ou mot de passe refusé par le serveur.',
  // Navigation
  home: 'Accueil',
  liveTv: 'TV en direct',
  movies: 'Films',
  series: 'Séries',
  catchup: 'Replay',
  myList: 'Ma liste',
  settings: 'Paramètres',
  search: 'Recherche',
  library: 'Bibliothèque',
  profile: 'Profil',
  tvGuide: 'Guide TV',
  categories: 'Catégories',
  // Accueil
  play: 'Lecture',
  resume: 'Reprendre',
  moreInfo: 'Plus d’infos',
  continueWatching: 'Continuer à regarder',
  recommended: 'Recommandé pour vous',
  recentlyAdded: 'Ajouts récents',
  top10: 'Top 10 du moment',
  liveNowRow: 'En direct maintenant',
  recentChannels: 'Chaînes regardées récemment',
  watchLive: 'Regarder en direct',
  allChannels: 'Toutes les chaînes',
  match: 'recommandé',
  popularChannels: 'Chaînes',
  seeAll: 'Tout voir',
  // Listes
  all: 'Tout',
  favorites: 'Favoris',
  popular: 'Populaires',
  newest: 'Nouveautés',
  liveNow: 'En direct',
  selectChannel: 'Sélectionnez une chaîne',
  selectChannelText: 'Choisissez une chaîne dans la liste pour la regarder ici. Appuyez de nouveau pour passer en plein écran.',
  fullscreen: 'Plein écran',
  upNext: 'Ensuite',
  searchChannel: 'Rechercher une chaîne…',
  checkChannels: 'Vérifier',
  category: 'Catégorie',
  allCategories: 'Toutes les catégories',
  searchCategory: 'Rechercher une catégorie…',
  onlineOnly: 'En ligne',
  noOnline: 'Aucune chaîne en ligne',
  noOnlineText: 'La vérification est peut-être encore en cours, ou aucune chaîne de cette catégorie ne répond.',
  channelStatus: 'État de la chaîne',
  channelDown: 'Hors ligne',
  online: 'en ligne',
  offlineCount: 'hors ligne',
  checking: 'vérification…',
  noProgram: 'Aucun programme',
  today: 'Aujourd’hui',
  tomorrow: 'Demain',
  channels: 'Chaînes',
  searchPlaceholder: 'Rechercher films, séries, chaînes…',
  recentSearches: 'Recherches récentes',
  popularNow: 'À découvrir',
  noResults: 'Aucun résultat',
  noResultsText: 'Essayez d’autres mots-clés ou filtres.',
  emptyList: 'Votre liste est vide',
  emptyListText: 'Ajoutez des films, séries ou chaînes avec ♡ pour les retrouver ici.',
  emptyHistory: 'Aucun historique',
  emptyHistoryText: 'Ce que vous regardez apparaîtra ici.',
  emptyGuide: 'Guide TV indisponible',
  emptyGuideText: 'Votre fournisseur ne publie pas de programmes pour ces chaînes.',
  emptyCatchup: 'Aucun replay disponible',
  emptyCatchupText: 'Aucune chaîne de votre abonnement ne propose le replay.',
  noInternet: 'Pas de connexion Internet',
  noInternetText: 'Vérifiez votre connexion puis réessayez.',
  retry: 'Réessayer',
  seasons: 'saisons',
  season: 'Saison',
  episodes: 'Épisodes',
  about: 'À propos',
  cast: 'Distribution',
  director: 'Réalisation',
  addToList: 'Ajouter à ma liste',
  inMyList: 'Dans ma liste',
  left: 'restant',
  history: 'Historique',
  resumeTab: 'Reprendre',
  clearHistory: 'Effacer l’historique',
  // Lecteur
  audio: 'Audio',
  subtitles: 'Sous-titres',
  quality: 'Qualité',
  stats: 'Stats',
  stStartup: 'Démarrage',
  stWaiting: 'en attente…',
  stServer: 'Réponse serveur',
  stSegment: 'Segment vidéo',
  stFor: 'pour',
  stSpeed: 'Débit mesuré',
  stNeeded: 'requis',
  stBuffer: 'Mémoire tampon',
  stResolution: 'Résolution',
  stRebuffers: 'Coupures',
  stEngine: 'Lecteur',
  stDropped: 'images perdues',
  dgLoading: 'Chargement du flux…',
  dgNoAnswer: 'Le serveur ne répond pas : la lenteur vient de la source.',
  dgSlowStart: 'Démarrage lent : le serveur tarde à envoyer la vidéo (source).',
  dgSlowServer: 'Le serveur IPTV répond lentement (source).',
  dgSlowDownload: 'Téléchargement plus lent que la vidéo : source surchargée ou connexion trop lente.',
  dgTight: 'Débit juste suffisant : la qualité peut baisser.',
  dgRebuffer: 'Coupures fréquentes : flux instable côté source.',
  dgOk: 'Lecture fluide : la source et la connexion sont correctes.',
  off: 'Désactivés',
  auto: 'Auto',
  live: 'DIRECT',
  nextEpisode: 'Épisode suivant',
  streamUnreachable: 'Flux injoignable (réseau ou serveur).',
  unsupported: 'Format de flux non supporté sur cet appareil.',
  // Profil / paramètres
  account: 'Compte',
  playlists: 'Mes playlists',
  connectedDevices: 'Connexions',
  activeConnections: 'Connexions actives',
  expires: 'Expire le',
  unlimited: 'Illimité',
  status: 'Statut',
  switchPlaylist: 'Changer de playlist',
  remove: 'Supprimer',
  confirmRemove: 'Supprimer cette playlist ?',
  refresh: 'Actualiser la playlist',
  recheckImages: 'Revérifier les images',
  recheckImagesDone: 'Les images seront vérifiées à nouveau.',
  language: 'Langue',
  videoQuality: 'Qualité vidéo',
  qualityAuto: 'Auto (optimale)',
  qualityHigh: 'Maximale',
  qualityLow: 'Économie de données',
  autoplayNext: 'Lecture auto. de l’épisode suivant',
  parentalControl: 'Contrôle parental',
  enableParental: 'Activer le contrôle parental',
  pinCode: 'Code PIN',
  lockedCategories: 'Catégories verrouillées',
  lockAdult: 'Verrouiller les contenus adultes',
  enterPin: 'Saisissez votre code PIN',
  newPin: 'Choisissez un code PIN à 4 chiffres',
  wrongPin: 'Code PIN incorrect',
  locked: 'Contenu verrouillé',
  version: 'Version',
  signOut: 'Déconnexion',
  close: 'Fermer',
  back: 'Retour',
  cancel: 'Annuler',
  save: 'Enregistrer',
  addedToList: 'ajouté à ma liste',
  removedFromList: 'retiré de ma liste',
};

type Dict = typeof fr;

const en: Dict = {
  tagline: 'IPTV NEXT GENERATION',
  splashSub: 'Your world of entertainment',
  ob1Title: 'Endless Entertainment',
  ob1Text: 'Live TV, movies, series and more all in one place.',
  ob2Title: 'Watch Everywhere',
  ob2Text: 'On your phone, TV and all your devices, anytime.',
  ob3Title: '4K Quality No Limits',
  ob3Text: 'Crystal clear streaming with a premium experience.',
  next: 'Next',
  skip: 'Skip',
  getStarted: 'Get Started',
  welcome: 'Welcome Back',
  loginSub: 'Sign in to your IPTV provider',
  addPlaylist: 'Add a playlist',
  xtream: 'Xtream Codes',
  m3uLink: 'M3U link',
  playlistName: 'Name (optional)',
  server: 'Server (http://example.com:8080)',
  username: 'Username',
  password: 'Password',
  m3uUrl: 'M3U playlist URL',
  signIn: 'Sign In',
  or: 'or',
  tryDemo: 'Try the sample playlist',
  invalidUrl: 'Enter a valid URL (http/https).',
  requiredFields: 'Server, username and password are required.',
  legal: 'StreamPro is a player: no content is provided. Only use streams you are allowed to watch.',
  loading: 'Loading…',
  loadError: 'Unable to load the playlist',
  errNetwork: 'server unreachable. Check the address (http://, port) and your connection.',
  errAuth: 'username or password rejected by the server.',
  home: 'Home',
  liveTv: 'Live TV',
  movies: 'Movies',
  series: 'Series',
  catchup: 'Catch-up',
  myList: 'My List',
  settings: 'Settings',
  search: 'Search',
  library: 'Library',
  profile: 'Profile',
  tvGuide: 'TV Guide',
  categories: 'Categories',
  play: 'Play',
  resume: 'Resume',
  moreInfo: 'More Info',
  continueWatching: 'Continue Watching',
  recommended: 'Recommended for You',
  recentlyAdded: 'Recently Added',
  top10: 'Top 10 Right Now',
  liveNowRow: 'Live Now',
  recentChannels: 'Recently Watched Channels',
  watchLive: 'Watch Live',
  allChannels: 'All Channels',
  match: 'match',
  popularChannels: 'Channels',
  seeAll: 'See all',
  all: 'All',
  favorites: 'Favorites',
  popular: 'Popular',
  newest: 'New',
  liveNow: 'Live now',
  selectChannel: 'Select a channel',
  selectChannelText: 'Pick a channel from the list to watch it here. Press again to go fullscreen.',
  fullscreen: 'Fullscreen',
  upNext: 'Up next',
  searchChannel: 'Search a channel…',
  checkChannels: 'Check',
  category: 'Category',
  allCategories: 'All categories',
  searchCategory: 'Search a category…',
  onlineOnly: 'Online',
  noOnline: 'No channel online',
  noOnlineText: 'The check may still be running, or no channel in this category responds.',
  channelStatus: 'Channel status',
  channelDown: 'Offline',
  online: 'online',
  offlineCount: 'offline',
  checking: 'checking…',
  noProgram: 'No program',
  today: 'Today',
  tomorrow: 'Tomorrow',
  channels: 'Channels',
  searchPlaceholder: 'Search for movies, series, channels…',
  recentSearches: 'Recent Searches',
  popularNow: 'Popular Now',
  noResults: 'No Results Found',
  noResultsText: 'Try different keywords or filters.',
  emptyList: 'Your list is empty',
  emptyListText: 'Add movies, series or channels with ♡ to find them here.',
  emptyHistory: 'No history yet',
  emptyHistoryText: 'What you watch will show up here.',
  emptyGuide: 'TV Guide unavailable',
  emptyGuideText: 'Your provider does not publish programs for these channels.',
  emptyCatchup: 'No catch-up available',
  emptyCatchupText: 'None of your channels offers catch-up.',
  noInternet: 'No Internet Connection',
  noInternetText: 'Please check your connection and try again.',
  retry: 'Retry',
  seasons: 'seasons',
  season: 'Season',
  episodes: 'Episodes',
  about: 'About',
  cast: 'Cast',
  director: 'Director',
  addToList: 'Add to My List',
  inMyList: 'In My List',
  left: 'left',
  history: 'History',
  resumeTab: 'Continue',
  clearHistory: 'Clear history',
  audio: 'Audio',
  subtitles: 'Subtitles',
  quality: 'Quality',
  stats: 'Stats',
  stStartup: 'Startup',
  stWaiting: 'waiting…',
  stServer: 'Server response',
  stSegment: 'Video segment',
  stFor: 'for',
  stSpeed: 'Measured speed',
  stNeeded: 'needed',
  stBuffer: 'Buffer',
  stResolution: 'Resolution',
  stRebuffers: 'Stalls',
  stEngine: 'Player',
  stDropped: 'dropped frames',
  dgLoading: 'Loading stream…',
  dgNoAnswer: 'The server does not answer: the source is slow.',
  dgSlowStart: 'Slow start: the server takes time to send video (source).',
  dgSlowServer: 'The IPTV server responds slowly (source).',
  dgSlowDownload: 'Download slower than playback: overloaded source or slow connection.',
  dgTight: 'Bandwidth barely enough: quality may drop.',
  dgRebuffer: 'Frequent stalls: unstable stream at the source.',
  dgOk: 'Smooth playback: source and connection are fine.',
  off: 'Off',
  auto: 'Auto',
  live: 'LIVE',
  nextEpisode: 'Next episode',
  streamUnreachable: 'Stream unreachable (network or server).',
  unsupported: 'Stream format not supported on this device.',
  account: 'Account',
  playlists: 'My playlists',
  connectedDevices: 'Connections',
  activeConnections: 'Active connections',
  expires: 'Expires on',
  unlimited: 'Unlimited',
  status: 'Status',
  switchPlaylist: 'Switch playlist',
  remove: 'Remove',
  confirmRemove: 'Remove this playlist?',
  refresh: 'Refresh playlist',
  recheckImages: 'Re-check images',
  recheckImagesDone: 'Images will be checked again.',
  language: 'Language',
  videoQuality: 'Video Quality',
  qualityAuto: 'Auto (Best)',
  qualityHigh: 'Maximum',
  qualityLow: 'Data saver',
  autoplayNext: 'Autoplay next episode',
  parentalControl: 'Parental Control',
  enableParental: 'Enable Parental Control',
  pinCode: 'PIN Code',
  lockedCategories: 'Locked categories',
  lockAdult: 'Lock adult content',
  enterPin: 'Enter your PIN code',
  newPin: 'Choose a 4-digit PIN code',
  wrongPin: 'Wrong PIN code',
  locked: 'Locked content',
  version: 'Version',
  signOut: 'Sign out',
  close: 'Close',
  back: 'Back',
  cancel: 'Cancel',
  save: 'Save',
  addedToList: 'added to My List',
  removedFromList: 'removed from My List',
};

export type TKey = keyof Dict;

const dicts: Record<Lang, Dict> = { fr, en };
let lang: Lang = 'fr';

export function detectLang(): Lang {
  const nav = (navigator.language || 'fr').toLowerCase();
  return nav.indexOf('fr') === 0 ? 'fr' : 'en';
}

export function setLang(l: Lang): void {
  lang = l;
  document.documentElement.lang = l;
}

export function getLang(): Lang {
  return lang;
}

export function t(key: TKey): string {
  return dicts[lang][key] || fr[key];
}

export function locale(): string {
  return lang === 'fr' ? 'fr-FR' : 'en-US';
}

export function formatTime(ms: number): string {
  const d = new Date(ms);
  return pad(d.getHours()) + ':' + pad(d.getMinutes());
}

export function formatDay(ms: number): string {
  const d = new Date(ms);
  const today = new Date();
  const diff = Math.round((startOfDay(d) - startOfDay(today)) / 86400000);
  if (diff === 0) return t('today');
  if (diff === 1) return t('tomorrow');
  try {
    return d.toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'short' });
  } catch {
    return d.getDate() + '/' + (d.getMonth() + 1);
  }
}

export function formatDate(ms: number): string {
  try {
    return new Date(ms).toLocaleDateString(locale(), { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    const d = new Date(ms);
    return d.getDate() + '/' + (d.getMonth() + 1) + '/' + d.getFullYear();
  }
}

/** 3725 → « 1:02:05 », 125 → « 2:05 ». */
export function formatDuration(sec: number): string {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const s = Math.floor(sec % 60);
  const m = Math.floor(sec / 60) % 60;
  const h = Math.floor(sec / 3600);
  return (h ? h + ':' + pad(m) : String(m)) + ':' + pad(s);
}

/** Durée restante lisible : « 24 min », « 1 h 12 ». */
export function formatRemaining(sec: number): string {
  const m = Math.max(1, Math.round(sec / 60));
  if (m < 60) return m + ' min';
  return Math.floor(m / 60) + ' h ' + pad(m % 60);
}

export function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function pad(n: number): string {
  return n < 10 ? '0' + n : String(n);
}
