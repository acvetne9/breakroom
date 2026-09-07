# ios/

Capacitor 7 iOS project (Xcode workspace in `App/`).

```sh
npm run build && npx cap sync ios && npx cap open ios
```

Signing is managed in Xcode; nothing secret is stored in this folder. Tiles are served from the app bundle through the `gzpbf://` protocol handler, same as Android.
