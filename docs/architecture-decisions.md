# Architecture Decisions

## ADR 001: Use Drizzle ORM

Michi uses Drizzle for database access because it keeps us close to SQL while giving TypeScript-aware table models and query results.

## ADR 002: Use Signed HTTP-Only Cookie Sessions

Michi stores session identity in a signed `httpOnly` cookie instead of localStorage. This keeps the user id away from frontend JavaScript and makes route-saving APIs derive identity from the server-side request.

## ADR 003: Keep OAuth Out Of Phase 1

Phase 1 uses email/password authentication so we can learn auth fundamentals before adding an external identity provider.
