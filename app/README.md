# IPTV Player — Android · iOS · Samsung (Tizen) · LG (webOS)

Un lecteur IPTV unique, écrit une seule fois en TypeScript, et packagé pour :

| Plateforme | Technologie | Format livré |
|---|---|---|
| Android (téléphone, tablette, **Android TV**) | Capacitor | `.apk` / `.aab` |
| iOS / iPadOS | Capacitor | App Store / TestFlight |
| TV Samsung (Tizen 3.0+, 2017+) | Web-app Tizen | `.wgt` |
| TV LG (webOS 3.0+, 2016+) | Web-app webOS | `.ipk` |

> L'application est un **lecteur** : elle ne fournit aucun contenu. L'utilisateur
> ajoute ses propres playlists (lien M3U ou compte Xtream Codes).

## Fonctionnalités

- Ajout de playlists **M3U / M3U8** (URL) ou **Xtream Codes** (serveur + identifiants)
- Catégories (`group-title`), recherche, onglets TV en direct / Films / Séries
- **Favoris** (touche jaune de la télécommande, clic droit / appui long sur mobile) et **Récents**
- Lecteur plein écran : HLS natif (iOS, Tizen, webOS) ou **hls.js** (Android, navigateurs)
- Zapping ▲▼ / CH+ CH−, saisie du numéro de chaîne au pavé numérique, pause/lecture
- **Navigation à la télécommande** (flèches, OK, Retour, touches média et couleur) et interface tactile
- Mise en cache locale de la playlist (rechargement via ⟳)
- Bundle compatible avec les vieux moteurs des TV (ES5 + polyfills, pas de CSS Grid/variables)
- Bouton « Essayer avec la playlist d'exemple » qui charge `list.m3u` de ce dépôt

## Démarrage

```bash
cd app
npm install
npm run dev        # http://localhost:5173 — flèches/Entrée/Échap simulent la télécommande
npm test           # tests du parseur M3U
npm run build      # build de production dans dist/
```

> En navigateur, certaines playlists échouent à cause du CORS : c'est normal,
> les versions Android/iOS/TV ne sont pas concernées.

## Android

Prérequis : Android Studio.

```bash
npm run cap:android   # build + sync + ouvre Android Studio
```

Puis *Run* sur un appareil/émulateur, ou *Build › Generate Signed Bundle* pour le Play Store.
Le manifeste autorise déjà les flux HTTP (`usesCleartextTraffic`) et déclare la
compatibilité **Android TV** (`LEANBACK_LAUNCHER`). Pour Android TV, remplacez la bannière
par une image 320×180 dans `android/app/src/main/res/mipmap-*/`.

## iOS

Prérequis : un Mac avec Xcode.

```bash
npm run cap:ios       # build + sync + ouvre Xcode
```

Choisissez votre *Team* de signature puis lancez. `Info.plist` autorise déjà les flux HTTP
(`NSAllowsArbitraryLoads`) — Apple peut demander une justification lors de la revue.

## Samsung TV (Tizen)

Prérequis : [Tizen Studio](https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/installing-tv-sdk.html)
avec l'extension TV et un **certificat Samsung** (Certificate Manager).

```bash
npm run build:tizen                      # → build/tizen/ (+ .wgt si le CLI `tizen` est dans le PATH)
TIZEN_PROFILE=monProfil npm run build:tizen
```

Installation sur la TV (mode développeur activé, IP du PC renseignée) :

```bash
sdb connect <IP_TV>
tizen install -n build/IPTVPlayer.wgt -t <nom_de_la_tv>
```

Configuration : `platforms/tizen/config.xml` (identifiant, privilèges, `access origin="*"`).

## LG TV (webOS)

Prérequis : `npm i -g @webos-tools/cli` et l'app **Developer Mode** installée sur la TV.

```bash
npm run build:webos                      # → build/webos/ + .ipk
ares-setup-device                        # déclarer la TV (IP, passphrase du Developer Mode)
ares-install -d maTV build/com.iptvplayer.app_1.0.0_all.ipk
ares-launch  -d maTV com.iptvplayer.app
```

Configuration : `platforms/webos/appinfo.json`.

## Architecture

```
app/
├── src/
│   ├── main.ts          point d'entrée
│   ├── app.ts           écrans : accueil, ajout de playlist, catalogue, lecteur
│   ├── m3u.ts           parseur M3U (+ tests)
│   ├── xtream.ts        API Xtream Codes (player_api.php)
│   ├── player.ts        lecture (HLS natif ou hls.js chargé à la demande)
│   ├── navigation.ts    navigation spatiale à la télécommande
│   ├── platform.ts      détection Tizen/webOS/Android/iOS, codes touches
│   ├── http.ts          requêtes (HTTP natif Capacitor sur mobile → pas de CORS)
│   ├── storage.ts       playlists, favoris, récents, cache (localStorage)
│   └── styles.css
├── platforms/tizen/     config.xml + icône
├── platforms/webos/     appinfo.json + icônes
├── android/  ios/       projets natifs Capacitor
└── scripts/package-tv.mjs
```

### Touches de la télécommande

| Touche | Catalogue | Lecteur |
|---|---|---|
| Flèches | déplacer le focus | ▲▼ changer de chaîne, ◀▶ boutons |
| OK | ouvrir | afficher les contrôles / activer |
| Retour | écran précédent / quitter | revenir au catalogue |
| CH+ / CH− | — | chaîne suivante / précédente |
| 0–9 | — | aller au numéro de chaîne |
| Jaune | favori | favori |
| Play/Pause | — | pause / lecture |

## Pistes d'évolution

- Guide des programmes (EPG XMLTV via `tvg-id`)
- Séries Xtream (`get_series` / `get_series_info`)
- Lecteur natif (ExoPlayer / AVPlay Samsung) pour les flux MPEG-TS bruts non lus par la WebView
- Contrôle parental (code PIN par catégorie)
