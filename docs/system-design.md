# Michi System Design

## Current Architecture

```text
React app
  -> API helper functions
  -> Express backend
  -> Drizzle ORM
  -> Postgres database
```

## Main Runtime Flows

- Signup/login creates or verifies a user, then sets a signed cookie.
- App boot calls `/api/auth/me` to restore the session.
- Route generation calls OpenRouteService through the backend proxy.
- Saving a route stores the selected generated route for the current cookie-authenticated user.
