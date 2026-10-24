# src/contexts/

- `DeviceContext.tsx` — exposes `deviceId` and `isFirstSession`. Thin wrapper over `utils/deviceId.ts`; the id itself is read synchronously, there is no loading state.
- `ConnectionContext.tsx` — `isOnline` plus a registry of reconnect callbacks (`useReconnectionHandler` in hooks/ subscribes to it) and a `retryWithBackoff` helper.
- `CityContext.tsx` — `city`, `cityId`, `setCityId`. Wraps the synchronous store in `utils/cities.ts`; switching clears the tile, details and search caches. Sits above `PostsProvider` so the feed reloads per city.

There is no auth context: the app is account-less on purpose.
