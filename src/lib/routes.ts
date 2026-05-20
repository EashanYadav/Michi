import type { Coordinate, RouteOption, RunType } from "../types";

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
