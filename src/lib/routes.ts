import type { Coordinate, RouteOption, RunType, SavedRoute } from "../types";

export async function generateRoutes(
  origin: Coordinate,
  targetDistanceKm: 2 | 5 | 10,
  runType: RunType
): Promise<RouteOption[]> {
  const response = await fetch("/api/routes/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ origin, targetDistanceKm, runType })
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.message ?? "Route generation failed.");
  }

  return payload.routes as RouteOption[];
}

export async function loadSavedRoutes(): Promise<SavedRoute[]> {
  const response = await fetch("/api/routes/saved");
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.message ?? "Saved routes could not be loaded.");
  }

  return payload.routes as SavedRoute[];
}

export async function saveRoute(route: RouteOption): Promise<SavedRoute> {
  const response = await fetch("/api/routes/saved", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(route)
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.message ?? "Route could not be saved.");
  }

  return payload.route as SavedRoute;
}
