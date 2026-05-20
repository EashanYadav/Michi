import cors from "cors";
import "dotenv/config";
import express from "express";

type Coordinate = {
  lat: number;
  lng: number;
};

type GenerateRoutesRequest = {
  origin: Coordinate;
  targetDistanceKm: 2 | 5 | 10;
  runType: "Easy" | "Recovery" | "Tempo" | "Long Run";
};

type CandidateRoute = {
  id: string;
  name: string;
  distanceKm: number;
  durationMinutes: number;
  score: number;
  geometry: Coordinate[];
  targetDistanceKm: number;
  runType: GenerateRoutesRequest["runType"];
  notes: string[];
};

type OrsFeatureCollection = {
  features?: Array<{
    geometry?: {
      coordinates?: [number, number][];
    };
    properties?: {
      summary?: {
        distance?: number;
        duration?: number;
      };
    };
  }>;
};

const app = express();
const port = Number(process.env.PORT ?? 8787);
const orsApiKey = process.env.OPENROUTESERVICE_API_KEY;

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/routes/generate", async (req, res) => {
  const parsed = parseGenerateRoutesRequest(req.body);

  if (!parsed.ok) {
    res.status(400).json({ message: parsed.message });
    return;
  }

  if (!orsApiKey) {
    res.status(503).json({
      message:
        "OpenRouteService is not configured. Add OPENROUTESERVICE_API_KEY to .env and restart the dev server."
    });
    return;
  }

  try {
    const candidates = buildWaypointCandidates(parsed.value);
    const settled = await Promise.allSettled(
      candidates.map((candidate) => fetchRoadRoute(candidate, parsed.value))
    );

    const providerError = settled.find(
      (result): result is PromiseRejectedResult =>
        result.status === "rejected" && result.reason instanceof ProviderAccessError
    );

    if (providerError) {
      res.status(502).json({
        message: providerError.reason.message
      });
      return;
    }

    const routes = settled
      .filter((result): result is PromiseFulfilledResult<CandidateRoute | null> => result.status === "fulfilled")
      .map((result) => result.value)
      .filter((route): route is CandidateRoute => Boolean(route))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    if (routes.length === 0) {
      res.status(422).json({
        message:
          "No realistic return-to-start road route was found for that distance. Try another distance or location."
      });
      return;
    }

    res.json({ routes });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Route generation failed while contacting the routing provider."
    });
  }
});

app.listen(port, () => {
  console.log(`Michi route proxy running on http://localhost:${port}`);
});

class ProviderAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderAccessError";
  }
}

function parseGenerateRoutesRequest(body: unknown):
  | { ok: true; value: GenerateRoutesRequest }
  | { ok: false; message: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, message: "Request body is required." };
  }

  const input = body as Partial<GenerateRoutesRequest>;
  const distances = [2, 5, 10];
  const runTypes = ["Easy", "Recovery", "Tempo", "Long Run"];

  if (!input.origin || !isFiniteCoordinate(input.origin)) {
    return { ok: false, message: "A valid origin with lat/lng is required." };
  }

  if (!distances.includes(Number(input.targetDistanceKm))) {
    return { ok: false, message: "targetDistanceKm must be 2, 5, or 10." };
  }

  if (!runTypes.includes(String(input.runType))) {
    return { ok: false, message: "runType must be Easy, Recovery, Tempo, or Long Run." };
  }

  return {
    ok: true,
    value: {
      origin: input.origin,
      targetDistanceKm: Number(input.targetDistanceKm) as 2 | 5 | 10,
      runType: input.runType as GenerateRoutesRequest["runType"]
    }
  };
}

function isFiniteCoordinate(coordinate: Coordinate): boolean {
  return (
    Number.isFinite(coordinate.lat) &&
    Number.isFinite(coordinate.lng) &&
    Math.abs(coordinate.lat) <= 90 &&
    Math.abs(coordinate.lng) <= 180
  );
}

function buildWaypointCandidates(request: GenerateRoutesRequest) {
  return [11, 29, 47, 71, 89, 113, 137, 163].map((seed, index) => ({
    id: `route-${index + 1}`,
    name: routeName(index),
    seed,
    points: request.targetDistanceKm <= 2 ? 3 : 4,
    lengthMeters: request.targetDistanceKm * 1000
  }));
}

async function fetchRoadRoute(
  candidate: ReturnType<typeof buildWaypointCandidates>[number],
  request: GenerateRoutesRequest
): Promise<CandidateRoute | null> {
  const url = new URL("https://api.openrouteservice.org/v2/directions/foot-walking/geojson");
  url.searchParams.set("api_key", orsApiKey ?? "");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      coordinates: [[request.origin.lng, request.origin.lat]],
      instructions: false,
      elevation: false,
      preference: preferenceForRunType(request.runType),
      options: {
        round_trip: {
          length: candidate.lengthMeters,
          points: candidate.points,
          seed: candidate.seed
        }
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");

    if (response.status === 401 || response.status === 403 || errorText.includes("disallowed")) {
      throw new ProviderAccessError(
        "OpenRouteService rejected this key for the Directions API. Confirm the full key was copied, regenerate the Basic Key if needed, and make sure Directions API access is enabled for your account."
      );
    }

    return null;
  }

  const payload = (await response.json()) as OrsFeatureCollection;
  const feature = payload.features?.[0];
  const coordinates = feature?.geometry?.coordinates;
  const summary = feature?.properties?.summary;

  if (!coordinates?.length || !summary?.distance || !summary?.duration) {
    return null;
  }

  const geometry = coordinates.map(([lng, lat]) => ({ lat, lng }));
  const distanceKm = summary.distance / 1000;
  const start = geometry[0];
  const end = geometry[geometry.length - 1];

  if (!start || !end || haversineMeters(start, end) > 120) {
    return null;
  }

  const tolerance = request.targetDistanceKm <= 2 ? 0.45 : 0.35;
  const distanceErrorRatio = Math.abs(distanceKm - request.targetDistanceKm) / request.targetDistanceKm;

  if (distanceErrorRatio > tolerance) {
    return null;
  }

  const score = Math.max(52, Math.round(100 - distanceErrorRatio * 120 - repeatedSegmentPenalty(geometry)));

  return {
    id: candidate.id,
    name: candidate.name,
    distanceKm,
    durationMinutes: summary.duration / 60,
    score,
    geometry,
    targetDistanceKm: request.targetDistanceKm,
    runType: request.runType,
    notes: [
      "Road-following route from OpenRouteService",
      `Within ${Math.round(distanceErrorRatio * 100)}% of your target distance`,
      "Starts and finishes near your current location"
    ]
  };
}

function haversineMeters(a: Coordinate, b: Coordinate): number {
  const earthRadius = 6371000;
  const deltaLat = toRadians(b.lat - a.lat);
  const deltaLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const sinLat = Math.sin(deltaLat / 2);
  const sinLng = Math.sin(deltaLng / 2);
  const value = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * earthRadius * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function repeatedSegmentPenalty(geometry: Coordinate[]): number {
  const rounded = new Set<string>();
  let repeats = 0;

  for (const point of geometry.filter((_, index) => index % 8 === 0)) {
    const key = `${point.lat.toFixed(4)},${point.lng.toFixed(4)}`;
    if (rounded.has(key)) {
      repeats += 1;
    }
    rounded.add(key);
  }

  return repeats * 4;
}

function preferenceForRunType(runType: GenerateRoutesRequest["runType"]) {
  if (runType === "Tempo" || runType === "Long Run") {
    return "recommended";
  }

  return "shortest";
}

function routeName(index: number): string {
  const names = ["North Arc", "East Return", "Garden Side", "Quiet Stretch", "West Bend", "South Ease", "Fresh Line", "City Edge"];
  return names[index] ?? `Route ${index + 1}`;
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}
