# android/

Capacitor 7 Android project. Build the web app first, then sync:

```sh
npm run build && npx cap sync android && npx cap open android
```

Release signing reads `android/keystore.properties` (gitignored; copy `keystore.properties.example`) or the same keys from environment variables. **The previous keystore and its password were committed to git; treat that key as compromised.** A replacement was generated at `secrets/upload-key.jks` (gitignored) and `android/keystore.properties` already points at it. Back both up somewhere safe; if the app was ever published with the old key, request an upload-key reset in Play Console.

Tiles ship inside the APK under `assets/tiles`; the map uses `gzpbf://assets/tiles/...` so they are inflated in the WebView.

Dev mode points the shell at the host dev server (`http://10.0.2.2:8080` in the emulator), see `capacitor.config.ts`.
