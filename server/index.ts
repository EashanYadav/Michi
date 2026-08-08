import bcrypt from "bcryptjs";
import cookieParser from "cookie-parser";
import cors from "cors";
import { desc, eq } from "drizzle-orm";
import "dotenv/config";
import express, { type Request, type Response } from "express";
import { db } from "./db";
import { routes, runHistory, users, type RunHistory, type SavedRoute, type User } from "./schema";

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
  geojson: unknown;
};

type RunSummaryRequest = {
  id?: string;
  routeName: string;
  distanceKm: number;
  targetDistanceKm: number;
  durationSeconds: number;
  pace: string;
  completedAt: string;
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
const cookieSecret = process.env.COOKIE_SECRET ?? "michi-dev-cookie-secret";
const isProduction = process.env.NODE_ENV === "production";

if (!process.env.COOKIE_SECRET) {
  console.warn("COOKIE_SECRET is not configured. Using a development-only fallback secret.");
}

app.use(cors({ credentials: true, origin: true }));
app.use(cookieParser(cookieSecret));
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/auth/register", async (req, res) => {
  const parsed = parseRegisterRequest(req.body);

  if (!parsed.ok) {
    res.status(400).json({ message: parsed.message });
    return;
  }

  try {
    const existingUser = await findUserByEmail(parsed.value.email);

    if (existingUser) {
      res.status(409).json({ message: "An account with this email already exists. Log in instead." });
      return;
    }

    const passwordHash = await bcrypt.hash(parsed.value.password, 12);
    const [user] = await db
      .insert(users)
      .values({
        fullName: parsed.value.fullName,
        email: parsed.value.email,
        passwordHash,
        authProvider: "email",
        updatedAt: new Date()
      })
      .returning();

    setSessionCookie(res, user.id);
    res.status(201).json({ user: toSafeUser(user) });
  } catch (error) {
    console.error(error);
    res.status(503).json({ message: "Registration failed while connecting to the database." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const parsed = parseLoginRequest(req.body);

  if (!parsed.ok) {
    res.status(400).json({ message: parsed.message });
    return;
  }

  try {
    const user = await findUserByEmail(parsed.value.email);

    if (!user || !(await bcrypt.compare(parsed.value.password, user.passwordHash))) {
      res.status(401).json({ message: "Email or password is incorrect." });
      return;
    }

    setSessionCookie(res, user.id);
    res.json({ user: toSafeUser(user) });
  } catch (error) {
    console.error(error);
    res.status(503).json({ message: "Login failed while connecting to the database." });
  }
});

app.get("/api/auth/me", async (req, res) => {
  const userId = getSessionUserId(req);

  if (!userId) {
    res.status(401).json({ message: "Not logged in." });
    return;
  }

  try {
    const user = await findUserById(userId);

    if (!user) {
      clearSessionCookie(res);
      res.status(401).json({ message: "Session expired. Log in again." });
      return;
    }

    res.json({ user: toSafeUser(user) });
  } catch (error) {
    console.error(error);
    res.status(503).json({ message: "Session restore failed while connecting to the database." });
  }
});

app.post("/api/auth/logout", (_req, res) => {
  clearSessionCookie(res);
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

app.get("/api/routes/saved", async (req, res) => {
  const userId = requireSession(req, res);

  if (!userId) {
    return;
  }

  try {
    const savedRoutes = await db
      .select()
      .from(routes)
      .where(eq(routes.userId, userId))
      .orderBy(desc(routes.createdAt));

    res.json({ routes: savedRoutes.map(toSavedRouteResponse) });
  } catch (error) {
    console.error(error);
    res.status(503).json({ message: "Saved routes could not be loaded." });
  }
});

app.post("/api/routes/saved", async (req, res) => {
  const userId = requireSession(req, res);

  if (!userId) {
    return;
  }

  const parsed = parseSaveRouteRequest(req.body);

  if (!parsed.ok) {
    res.status(400).json({ message: parsed.message });
    return;
  }

  try {
    const start = parsed.value.geometry[0];
    const [savedRoute] = await db
      .insert(routes)
      .values({
        userId,
        routeName: parsed.value.name,
        distanceKm: parsed.value.distanceKm.toFixed(2),
        estimatedDurationMinutes: Math.round(parsed.value.durationMinutes),
        elevationGainMeters: 0,
        startLatitude: start.lat.toFixed(8),
        startLongitude: start.lng.toFixed(8),
        routeCoordinates: parsed.value.geometry,
        geojson: parsed.value.geojson ?? null,
        noveltyScore: parsed.value.score
      })
      .returning();

    res.status(201).json({ route: toSavedRouteResponse(savedRoute) });
  } catch (error) {
    console.error(error);
    res.status(503).json({ message: "Route could not be saved." });
  }
});

app.get("/api/runs", async (req, res) => {
  const userId = requireSession(req, res);

  if (!userId) {
    return;
  }

  try {
    const runs = await db
      .select()
      .from(runHistory)
      .where(eq(runHistory.userId, userId))
      .orderBy(desc(runHistory.completedAt))
      .limit(20);

    res.json({ runs: runs.map(toRunHistoryResponse) });
  } catch (error) {
    console.error(error);
    res.status(503).json({ message: "Run history could not be loaded." });
  }
});

app.post("/api/runs", async (req, res) => {
  const userId = requireSession(req, res);

  if (!userId) {
    return;
  }

  const parsed = parseSaveRunRequest(req.body);

  if (!parsed.ok) {
    res.status(400).json({ message: parsed.message });
    return;
  }

  try {
    const [savedRun] = await db
      .insert(runHistory)
      .values({
        userId,
        routeName: parsed.value.routeName,
        distanceKm: parsed.value.distanceKm.toFixed(2),
        targetDistanceKm: parsed.value.targetDistanceKm.toFixed(2),
        durationSeconds: Math.round(parsed.value.durationSeconds),
        pace: parsed.value.pace,
        completedAt: new Date(parsed.value.completedAt)
      })
      .returning();

    res.status(201).json({ run: toRunHistoryResponse(savedRun) });
  } catch (error) {
    console.error(error);
    res.status(503).json({ message: "Run could not be saved." });
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

function parseRegisterRequest(body: unknown):
  | { ok: true; value: { fullName: string; email: string; password: string } }
  | { ok: false; message: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, message: "Request body is required." };
  }

  const input = body as Partial<{ fullName: string; email: string; password: string }>;
  const fullName = String(input.fullName ?? "").trim();
  const email = normalizeEmail(input.email);
  const password = String(input.password ?? "");

  if (fullName.length < 2) {
    return { ok: false, message: "Full name must be at least 2 characters." };
  }

  if (!isValidEmail(email)) {
    return { ok: false, message: "Enter a valid email address." };
  }

  if (password.length < 8) {
    return { ok: false, message: "Password must be at least 8 characters." };
  }

  return { ok: true, value: { fullName, email, password } };
}

function parseLoginRequest(body: unknown):
  | { ok: true; value: { email: string; password: string } }
  | { ok: false; message: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, message: "Request body is required." };
  }

  const input = body as Partial<{ email: string; password: string }>;
  const email = normalizeEmail(input.email);
  const password = String(input.password ?? "");

  if (!isValidEmail(email) || !password) {
    return { ok: false, message: "Email and password are required." };
  }

  return { ok: true, value: { email, password } };
}

function parseSaveRouteRequest(body: unknown):
  | { ok: true; value: CandidateRoute }
  | { ok: false; message: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, message: "Request body is required." };
  }

  const input = body as Partial<CandidateRoute>;

  if (!input.name || typeof input.name !== "string") {
    return { ok: false, message: "Route name is required." };
  }

  if (!Number.isFinite(input.distanceKm) || Number(input.distanceKm) <= 0) {
    return { ok: false, message: "A valid route distance is required." };
  }

  if (!Number.isFinite(input.durationMinutes) || Number(input.durationMinutes) <= 0) {
    return { ok: false, message: "A valid route duration is required." };
  }

  if (!Number.isFinite(input.score)) {
    return { ok: false, message: "A valid route score is required." };
  }

  if (!Array.isArray(input.geometry) || input.geometry.length < 2 || !input.geometry.every(isFiniteCoordinate)) {
    return { ok: false, message: "Route coordinates are required." };
  }

  return {
    ok: true,
    value: {
      id: String(input.id ?? crypto.randomUUID()),
      name: input.name.trim(),
      distanceKm: Number(input.distanceKm),
      durationMinutes: Number(input.durationMinutes),
      score: Math.round(Number(input.score)),
      geometry: input.geometry,
      targetDistanceKm: Number(input.targetDistanceKm ?? input.distanceKm),
      runType: input.runType ?? "Easy",
      notes: Array.isArray(input.notes) ? input.notes : [],
      geojson: input.geojson ?? null
    }
  };
}

function parseSaveRunRequest(body: unknown):
  | { ok: true; value: RunSummaryRequest }
  | { ok: false; message: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, message: "Request body is required." };
  }

  const input = body as Partial<RunSummaryRequest>;
  const routeName = String(input.routeName ?? "").trim();
  const pace = String(input.pace ?? "").trim();
  const completedAt = String(input.completedAt ?? "");
  const completedDate = new Date(completedAt);

  if (routeName.length < 1) {
    return { ok: false, message: "Route name is required." };
  }

  if (!Number.isFinite(input.distanceKm) || Number(input.distanceKm) <= 0) {
    return { ok: false, message: "A valid run distance is required." };
  }

  if (!Number.isFinite(input.targetDistanceKm) || Number(input.targetDistanceKm) <= 0) {
    return { ok: false, message: "A valid target distance is required." };
  }

  if (!Number.isFinite(input.durationSeconds) || Number(input.durationSeconds) < 0) {
    return { ok: false, message: "A valid run duration is required." };
  }

  if (!pace) {
    return { ok: false, message: "Pace is required." };
  }

  if (Number.isNaN(completedDate.getTime())) {
    return { ok: false, message: "A valid completion time is required." };
  }

  return {
    ok: true,
    value: {
      id: typeof input.id === "string" ? input.id : undefined,
      routeName,
      distanceKm: Number(input.distanceKm),
      targetDistanceKm: Number(input.targetDistanceKm),
      durationSeconds: Math.round(Number(input.durationSeconds)),
      pace,
      completedAt: completedDate.toISOString()
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
    ],
    geojson: feature
  };
}

async function findUserByEmail(email: string): Promise<User | undefined> {
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return user;
}

async function findUserById(id: string): Promise<User | undefined> {
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return user;
}

function setSessionCookie(res: Response, userId: string) {
  res.cookie("michi_session", userId, {
    httpOnly: true,
    signed: true,
    sameSite: "lax",
    secure: isProduction,
    maxAge: 1000 * 60 * 60 * 24 * 30
  });
}

function clearSessionCookie(res: Response) {
  res.clearCookie("michi_session", {
    httpOnly: true,
    signed: true,
    sameSite: "lax",
    secure: isProduction
  });
}

function getSessionUserId(req: Request): string | null {
  const value = req.signedCookies?.michi_session;
  return typeof value === "string" && isUuid(value) ? value : null;
}

function requireSession(req: Request, res: Response): string | null {
  const userId = getSessionUserId(req);

  if (!userId) {
    res.status(401).json({ message: "Log in to continue." });
    return null;
  }

  return userId;
}

function toSafeUser(user: User) {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    profileImage: user.profileImage,
    authProvider: user.authProvider
  };
}

function toSavedRouteResponse(route: SavedRoute) {
  const geometry = Array.isArray(route.routeCoordinates) ? route.routeCoordinates : [];

  return {
    id: route.id,
    name: route.routeName ?? "Saved route",
    distanceKm: Number(route.distanceKm),
    durationMinutes: route.estimatedDurationMinutes ?? 0,
    score: route.noveltyScore ?? 0,
    geometry,
    geojson: route.geojson,
    createdAt: route.createdAt?.toISOString() ?? new Date().toISOString()
  };
}

function toRunHistoryResponse(run: RunHistory) {
  return {
    id: run.id,
    routeName: run.routeName,
    distanceKm: Number(run.distanceKm),
    targetDistanceKm: Number(run.targetDistanceKm),
    durationSeconds: run.durationSeconds,
    pace: run.pace,
    completedAt: run.completedAt.toISOString()
  };
}

function normalizeEmail(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
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
