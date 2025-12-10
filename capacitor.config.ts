import { CapacitorConfig } from '@capacitor/cli';

const isDev = process.env.NODE_ENV === 'development';

const config: CapacitorConfig = {
  appId: 'com.acvetne.breakroom',
  appName: 'breakroom',
  webDir: 'dist',
  bundledWebRuntime: false,
  ...(isDev
    ? {
        server: {
          url: 'http://10.0.2.2:8080',
          cleartext: true,
        },
      }
    : {}),
};

export default config;
