# Michi

Michi is a Phase 1 React MVP for finding realistic running routes that start and finish at the same point.

The app does not draw synthetic circle routes. Route previews are only rendered after the backend receives road-following geometry from OpenRouteService.

## Run Locally

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:5173
```

## OpenRouteService Setup

Create a `.env` file in the project root:

```env
OPENROUTESERVICE_API_KEY=your_openrouteservice_key_here
PORT=8787
```

Restart `npm run dev` after adding the key.

## Current MVP

- React + Vite + TypeScript frontend
- Leaflet map preview
- Browser geolocation with demo mode
- Express route proxy
- OpenRouteService `foot-walking` road-following route generation
- 2km, 5km, and 10km target distances
- Easy, Recovery, Tempo, and Long Run modes
- Live timer/tracker
- Run summary and local browser history
