# StreamPro — IPTV Next Generation

Lecteur IPTV au design **StreamPro**, écrit une seule fois en TypeScript et packagé pour :

| Plateforme | Technologie | Format livré | Interface |
|---|---|---|---|
| Android (téléphone, tablette, **Android TV**) | Capacitor | `.apk` / `.aab` | onglets en bas / barre latérale en paysage |
| iOS / iPadOS | Capacitor | App Store / TestFlight | onglets en bas |
| TV Samsung (Tizen 3.0+, 2017+) | Web-app Tizen | `.wgt` | barre latérale + télécommande |
| TV LG (webOS 3.0+, 2016+) | Web-app webOS | `.ipk` | barre latérale + télécommande |

> StreamPro est un **lecteur** : il ne fournit aucun contenu. L'utilisateur se connecte
> à son propre fournisseur IPTV (compte **Xtream Codes** ou lien **M3U**).

## Écrans (d'après la maquette)

| Maquette | Écran | Remarque |
|---|---|---|
| 1 | Splash | logo, slogan, barre de chargement |
| 2 | Connexion | identifiants Xtream Codes ou lien M3U (+ playlist d'exemple) |
| 5-7 | Onboarding | 3 étapes, affiché au premier lancement |
| 8 / 12 | Accueil | mise en avant, Continuer à regarder, Catégories, Recommandé, Ajouts récents, TV |
| 9 / 13 | TV en direct | liste (mobile) ou grille numérotée (TV), filtres, favoris ♡, programme en cours |
| 10 / 14 | Guide TV | grille horaire sur 4 jours, ligne « maintenant », fiche programme, replay |
| 11 | Recherche | films / séries / chaînes, recherches récentes, À découvrir |
| 15 / 19 | Fiche détail | visuel, infos, synopsis, Lecture/Reprendre, Ma liste, saisons & épisodes, distribution |
| 16 | Catégories | tuiles colorées + catégories de chaînes |
| 17 / 18 | Films / Séries | grille d'affiches, Populaires, Nouveautés, genres |
| 20 | Lecteur | barre de progression, ⏮ ⏯ ⏭, épisodes/chaînes, audio, sous-titres, qualité |
| 21 / 22 | Bibliothèque | Ma liste (films/séries/chaînes), Continuer à regarder, Historique |
| 23 | Replay | chaînes avec archive → programmes passés rejouables |
| — | Profil, Paramètres, Contrôle parental, Connexions, Playlists | voir ci-dessous |
| — | États vides / Pas de connexion / Aucun résultat | partout |

**Écarts volontaires avec la maquette** : *Créer un compte*, *Mot de passe oublié*, *Offres Premium*
et la connexion Apple/Google supposent un serveur de comptes et de paiement StreamPro qui n'existe pas.
La connexion se fait donc avec les identifiants du fournisseur IPTV, et l'écran *Appareils connectés*
affiche les vraies données du compte Xtream (connexions actives / maximum, date d'expiration).

## Fonctionnalités

- **Xtream Codes** : chaînes, films, séries (saisons/épisodes), fiches (synopsis, note, casting),
  guide TV, **replay** (timeshift), état du compte.
- **M3U** : catégories `group-title`, logos, guide **XMLTV** (`url-tvg`), séries reconstituées à partir
  des groupes « Nom - Saison N ».
- **Reprise de lecture** des films et épisodes, épisode suivant automatique, historique.
- **Ma liste** (♡, touche jaune sur TV), recherches récentes.
- **Contrôle parental** : code PIN, verrouillage des contenus adultes et de catégories au choix.
- **Paramètres** : langue (FR/EN, par défaut celle de l'appareil), qualité vidéo, lecture auto.
- **Plusieurs playlists**, bascule depuis le profil.
- **Télécommande** : navigation spatiale, Retour, CH+/CH−, chiffres (n° de chaîne), Play/Pause, touches couleur.
- Compatible vieux moteurs TV : bundle ES5 + polyfills, CSS sans Grid/`gap`/variables à l'exécution.

## Démarrage

```bash
cd app
npm install
npm run dev        # http://localhost:5173 — flèches/Entrée/Échap simulent la télécommande
npm test           # tests unitaires (M3U, séries, XMLTV)
npm run build      # build de production dans dist/
```

> En navigateur, certaines playlists échouent à cause du CORS : c'est normal,
> les versions Android/iOS/TV ne sont pas concernées.

## Android

Prérequis : Android Studio.

```bash
npm run cap:android   # build + sync + ouvre Android Studio
```

Identifiant : `com.streampro.app`. Le manifeste autorise les flux HTTP et déclare
la compatibilité **Android TV** (bannière `res/drawable/banner.png`).

## iOS

Prérequis : un Mac avec Xcode.

```bash
npm run cap:ios       # build + sync + ouvre Xcode
```

`Info.plist` autorise les flux HTTP (`NSAllowsArbitraryLoads`) — Apple peut demander une justification.

Icônes et splash natifs : régénérés depuis `resources/icon.png` avec
`npx @capacitor/assets generate --iconBackgroundColor '#060a1c' --splashBackgroundColor '#060a1c'`.

## Samsung TV (Tizen)

Prérequis : Tizen Studio (extension TV) et un **certificat Samsung**.

```bash
npm run build:tizen                      # → build/tizen/ (+ .wgt si le CLI `tizen` est dans le PATH)
TIZEN_PROFILE=monProfil npm run build:tizen
sdb connect <IP_TV> && tizen install -n build/StreamPro.wgt -t <nom_de_la_tv>
```

## LG TV (webOS)

Prérequis : `npm i -g @webos-tools/cli` et l'app **Developer Mode** sur la TV.

```bash
npm run build:webos
ares-setup-device
ares-install -d maTV build/com.streampro.app_1.0.0_all.ipk
```

## Architecture

```
app/src/
├── main.ts / app.ts      démarrage, routeur, barre latérale / onglets, télécommande
├── screens/              un fichier par groupe d'écrans (home, live, guide, vod, detail, player…)
├── ui/                   composants (cartes, rangées, puces, réglages, modales, PIN), icônes
├── catalog.ts            catalogue unifié M3U / Xtream (+ cache)
├── xtream.ts             API player_api.php (live, VOD, séries, EPG, replay, compte)
├── m3u.ts / epg.ts       parseurs M3U et XMLTV, programmes en cours
├── player.ts             moteur vidéo : HLS natif ou hls.js, pistes audio/sous-titres/qualité
├── navigation.ts         navigation spatiale
├── storage.ts            réglages, playlists, Ma liste, historique, contrôle parental
├── i18n.ts               textes FR / EN
└── styles.css            design system StreamPro
```

### Touches de la télécommande

| Touche | Navigation | Lecteur |
|---|---|---|
| Flèches | déplacer le focus (◀ au bord → menu latéral) | ▲▼ zapper (direct), ◀▶ ±10 s (VOD) |
| OK | ouvrir | afficher les contrôles / activer |
| Retour | écran précédent / quitter | revenir |
| CH+ / CH− | — | élément suivant / précédent |
| 0–9 | — | aller au numéro de chaîne |
| Jaune | ajouter à Ma liste | — |
| Play/Pause, Stop | — | pause / lecture, quitter |

## Limites connues

- Android : la WebView ne lit pas les flux MPEG-TS bruts (`.ts`) ; un lecteur natif (ExoPlayer)
  serait nécessaire pour ces flux.
- Guides XMLTV compressés (`.gz`) non pris en charge.
