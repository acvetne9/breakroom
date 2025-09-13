import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.acvetne.breakroom',  // unique app ID
  appName: 'breakroom',
  webDir: 'dist',                  // 👈 match Vite’s build output
  bundledWebRuntime: false
};

export default config;
