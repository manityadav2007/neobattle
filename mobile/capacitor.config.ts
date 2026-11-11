import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'live.neobattle.twa',
  appName: 'NeoBattle',
  webDir: 'www',
  server: {
    url: 'https://neobattle.live',
    cleartext: false,
    allowNavigation: [
      'neobattle.live',
      '*.neobattle.live'
    ],
    errorPath: 'offline.html'
  },
  appendUserAgent: 'NeoBattleApp/1.0',
  backgroundColor: '#000000',
  android: {
    adjustMarginsForEdgeToEdge: 'force',
    allowMixedContent: false,
    captureInput: true,
    backgroundColor: '#000000'
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 4000,
      launchAutoHide: false,
      launchFadeOutDuration: 250,
      backgroundColor: '#000000',
      androidSplashResourceName: 'splash_icon_v31',
      androidScaleType: 'CENTER',
      showSpinner: false,
      splashFullScreen: false,
      splashImmersive: false
    },
    StatusBar: {
      backgroundColor: '#000000',
      style: 'DARK',
      overlaysWebView: false
    }
  }
};

export default config;
