import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.newton.gravity',
  appName: "Newton's Gravity",
  webDir: 'dist/newton-game/browser',
  server: {
    androidScheme: 'https',
    iosScheme: 'https',
  },
  android: {
    allowMixedContent: true,
    backgroundColor: '#1a0a00',
  },
  ios: {
    backgroundColor: '#1a0a00',
    contentInset: 'always',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: '#1a0a00',
      showSpinner: false,
    },
  },
};

export default config;
