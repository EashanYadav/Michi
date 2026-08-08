# Michi Learning Notes

## Current Topic

Database Migrations

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
- Client/API/database request boundaries
- Database-backed history versus browser-local history
- Schema migrations as an operational concern

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

## Run History Notes

- `RunTracker` owns live UI state such as timer seconds and GPS trail points.
- When a run is finished, the frontend sends a compact `RunSummary` to `POST /api/runs`.
- The backend validates the summary and attaches the authenticated `userId` from the signed cookie.
- The dashboard uses `GET /api/runs`, so account history can follow the user across browsers or devices.
- The client updates the query cache optimistically so the latest run appears immediately, then invalidates the query after the server confirms the write.

## Migration Notes

- A schema file tells TypeScript what tables should look like in code.
- A migration tells Postgres how to move from one database shape to the next.
- Michi stores migration history in `michi.schema_migrations`, so already-applied SQL files are skipped on future runs.
- Each SQL migration runs inside a transaction. If one statement fails, the migration rolls back and is not recorded as applied.
- Ordered file names such as `001_initial_schema.sql` and `002_run_history.sql` make the database timeline explicit.
