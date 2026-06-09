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
