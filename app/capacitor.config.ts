import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.iptvplayer.app',
  appName: 'IPTV Player',
  webDir: 'dist',
  server: {
    // Beaucoup de flux IPTV sont servis en HTTP : on autorise le contenu mixte.
    androidScheme: 'http',
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
  },
};

export default config;
