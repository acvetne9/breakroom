import { CapacitorConfig } from '@capacitor/cli';

const isDev = process.env.CAP_ENV === 'dev';

const config: CapacitorConfig = {
    appId: 'com.acvetne.workaround',
    appName: 'workaround',
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
