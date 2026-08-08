# Architecture Decisions

## ADR 001: Use Drizzle ORM

Michi uses Drizzle for database access because it keeps us close to SQL while giving TypeScript-aware table models and query results.

## ADR 002: Use Signed HTTP-Only Cookie Sessions

Michi stores session identity in a signed `httpOnly` cookie instead of localStorage. This keeps the user id away from frontend JavaScript and makes route-saving APIs derive identity from the server-side request.

## ADR 003: Keep OAuth Out Of Phase 1

Phase 1 uses email/password authentication so we can learn auth fundamentals before adding an external identity provider.

## ADR 004: Use TanStack Query For Server State

Michi uses TanStack Query for API-backed state such as the current user, saved routes, route generation, login, logout, and route saving. This separates server state from local UI state and gives us caching, retries, loading states, error states, and invalidation as the product grows.

## ADR 005: Build PWA-First

Michi uses a PWA-first approach so the current React/Vite app can become installable without a native rewrite. The service worker caches the app shell and static assets, while API-backed actions such as auth, route generation, and route saving still require network access.

## ADR 006: Store Completed Runs In Postgres

Michi stores completed run summaries in Postgres instead of localStorage. This makes run history account-scoped, available across devices, and queryable by the backend for future insights. Live tracking state remains local UI state until the user finishes the run.

## ADR 007: Use SQL Files For Migrations

Michi uses ordered SQL migration files plus a small `pg` runner instead of introducing a migration package immediately. This keeps the learning path close to the database: every schema change is visible as SQL, applied in order, wrapped in a transaction, and recorded in `michi.schema_migrations`.
