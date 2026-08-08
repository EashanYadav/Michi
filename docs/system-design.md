# Michi System Design

## Current Architecture

```text
React app
  -> API helper functions
  -> Express backend
  -> Drizzle ORM
  -> Postgres database
```

## Bounded Data Flows

```text
Route planning
  React planner
  -> POST /api/routes/generate
  -> OpenRouteService
  -> route options kept in TanStack Query mutation state

Route library
  React library
  -> GET/POST /api/routes/saved
  -> signed cookie identifies user
  -> michi.routes table

Run history
  RunTracker finish action
  -> POST /api/runs
  -> signed cookie identifies user
  -> michi.run_history table
  -> GET /api/runs refreshes dashboard metrics
```

## Main Runtime Flows

- Signup/login creates or verifies a user, then sets a signed cookie.
- App boot calls `/api/auth/me` to restore the session.
- Route generation calls OpenRouteService through the backend proxy.
- Saving a route stores the selected generated route for the current cookie-authenticated user.
- Finishing a run writes the summary through the backend, then the dashboard reads the latest run history from Postgres.

## System Design Notes

- Local storage is useful for offline-first drafts, but it does not work across devices and cannot power account-level history.
- Michi now treats run history as server state: the client reads it with `useQuery`, writes it with `useMutation`, and invalidates the query after a successful save.
- The API, not the browser, decides the `userId` from the signed cookie. That prevents one user from writing run history into another user's account by changing request JSON.
- Schema changes are applied with ordered SQL files in `migrations/` and tracked in `michi.schema_migrations`.
- `server/schema.ts` describes tables for TypeScript and Drizzle; migrations describe how the actual database changes over time.

## Migration Flow

```text
Developer adds SQL file
  -> npm run db:migrate
  -> server/migrate.ts reads pending files
  -> each file runs inside a transaction
  -> michi.schema_migrations records success
```

- A migration should be append-only after it has been shared or applied.
- Each migration file should be safe to run once and easy to review.
- The migration runner stops on the first failure so a broken schema change does not quietly roll forward.
