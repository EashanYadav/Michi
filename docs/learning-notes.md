# Michi Learning Notes

## Current Topic

Installable PWA Foundation

## Concepts

- TypeScript type modeling
- React authenticated app state
- Express API routes
- Password hashing
- Signed cookies
- ORM table mapping with Drizzle
- Postgres-backed persistence
- Server-state management with TanStack Query
- PWA manifest and service worker caching

## TanStack Query Notes

- `useQuery` is for reading server data, such as the current user or saved routes.
- `useMutation` is for changing server data, such as login, logout, route generation, and saving a route.
- Query invalidation tells the app when cached server data should be reloaded.
- Local React state should still be used for UI-only details such as selected tabs, selected route ids, and form input text.

## PWA Notes

- A web app manifest tells the browser how Michi should look when installed.
- A service worker sits between the app and the network and can serve cached files.
- Phase 1 caches the app shell only; API calls still need the backend.
- Offline UX should be honest: show what is available, and block actions that require network.
