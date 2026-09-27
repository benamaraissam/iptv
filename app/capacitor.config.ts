import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.streampro.app',
  appName: 'StreamPro',
  webDir: 'dist',
  server: {
    // Beaucoup de flux IPTV sont servis en HTTP : on autorise le contenu mixte.
    androidScheme: 'http',
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
    // WebView transparente : la vidéo du lecteur natif (libVLC) est dessinée dessous.
    backgroundColor: '#00000000',
  },
};

export default config;
