# Michi Learning Notes

## Current Topic

Email Auth + Saved Routes

## Concepts

- TypeScript type modeling
- React authenticated app state
- Express API routes
- Password hashing
- Signed cookies
- ORM table mapping with Drizzle
- Postgres-backed persistence
- Server-state management with TanStack Query

## TanStack Query Notes

- `useQuery` is for reading server data, such as the current user or saved routes.
- `useMutation` is for changing server data, such as login, logout, route generation, and saving a route.
- Query invalidation tells the app when cached server data should be reloaded.
- Local React state should still be used for UI-only details such as selected tabs, selected route ids, and form input text.
