import { useEffect, useMemo, useState, type FormEvent } from "react";
import { RouteMap } from "./components/RouteMap";
import { RunTracker } from "./components/RunTracker";
import { DEMO_LOCATION, formatDistance, formatDuration } from "./lib/geo";
import { getCurrentUser, loginUser, logoutUser, registerUser } from "./lib/auth";
import { generateRoutes, loadSavedRoutes, saveRoute } from "./lib/routes";
import { loadRuns, saveRun } from "./lib/storage";
import type { Coordinate, LocationState, RouteOption, RunSummary, RunType, SavedRoute, UserProfile } from "./types";

const DISTANCES = [2, 5, 10] as const;
const RUN_TYPES: RunType[] = ["Easy", "Recovery", "Tempo", "Long Run"];

type View = "plan" | "tracking" | "summary";

function App() {
  const [authStatus, setAuthStatus] = useState<"loading" | "authenticated" | "guest">("loading");
  const [user, setUser] = useState<UserProfile | null>(null);
  const [location, setLocation] = useState<LocationState>({
    status: "idle",
    coordinate: null,
    message: "Location helps Michi find road-following routes from your real start point."
  });
  const [distance, setDistance] = useState<(typeof DISTANCES)[number]>(5);
  const [runType, setRunType] = useState<RunType>("Easy");
  const [routes, setRoutes] = useState<RouteOption[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [savedRoutes, setSavedRoutes] = useState<SavedRoute[]>([]);
  const [selectedSavedRouteId, setSelectedSavedRouteId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSavingRoute, setIsSavingRoute] = useState(false);
  const [savedRouteError, setSavedRouteError] = useState<string | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [view, setView] = useState<View>("plan");
  const [lastSummary, setLastSummary] = useState<RunSummary | null>(null);
  const [runs, setRuns] = useState<RunSummary[]>([]);

  useEffect(() => {
    setRuns(loadRuns());
  }, []);

  useEffect(() => {
    getCurrentUser()
      .then((currentUser) => {
        setUser(currentUser);
        setAuthStatus(currentUser ? "authenticated" : "guest");
      })
      .catch(() => {
        setUser(null);
        setAuthStatus("guest");
      });
  }, []);

  useEffect(() => {
    if (!user) {
      setSavedRoutes([]);
      return;
    }

    refreshSavedRoutes();
  }, [user]);

  const selectedRoute = useMemo(() => {
    return routes.find((route) => route.id === selectedRouteId) ?? routes[0] ?? null;
  }, [routes, selectedRouteId]);

  const selectedSavedRoute = useMemo(() => {
    return savedRoutes.find((route) => route.id === selectedSavedRouteId) ?? null;
  }, [savedRoutes, selectedSavedRouteId]);

  const previewRoute = selectedSavedRoute ?? selectedRoute;
  const origin = previewRoute?.geometry[0] ?? (location.status === "ready" ? location.coordinate : DEMO_LOCATION);

  async function refreshSavedRoutes() {
    try {
      setSavedRouteError(null);
      setSavedRoutes(await loadSavedRoutes());
    } catch (error) {
      setSavedRouteError(error instanceof Error ? error.message : "Saved routes could not be loaded.");
    }
  }

  function handleAuthenticated(nextUser: UserProfile) {
    setUser(nextUser);
    setAuthStatus("authenticated");
  }

  async function handleLogout() {
    await logoutUser().catch(() => undefined);
    setUser(null);
    setAuthStatus("guest");
    setRoutes([]);
    setSavedRoutes([]);
    setSelectedRouteId(null);
    setSelectedSavedRouteId(null);
  }

  function requestLocation() {
    if (!navigator.geolocation) {
      setLocation({
        status: "error",
        coordinate: null,
        message: "This browser does not support geolocation. Use demo mode to explore Michi."
      });
      return;
    }

    setLocation({
      status: "loading",
      coordinate: null,
      message: "Finding your current start point..."
    });

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          status: "ready",
          coordinate: {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          },
          isDemo: false,
          message: "Current location ready."
        });
      },
      () => {
        setLocation({
          status: "error",
          coordinate: null,
          message: "Location permission was denied or unavailable. Demo mode can still show the full route flow."
        });
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 12000 }
    );
  }

  function useDemoLocation() {
    setLocation({
      status: "ready",
      coordinate: DEMO_LOCATION,
      isDemo: true,
      message: "Demo location active near Cubbon Park, Bengaluru."
    });
  }

  async function handleGenerateRoutes() {
    if (location.status !== "ready") {
      setRouteError("Choose your current location or demo mode before generating a route.");
      return;
    }

    setIsGenerating(true);
    setRouteError(null);
    setRoutes([]);
    setSelectedRouteId(null);
    setSelectedSavedRouteId(null);

    try {
      const generated = await generateRoutes(location.coordinate, distance, runType);
      setRoutes(generated);
      setSelectedRouteId(generated[0]?.id ?? null);
    } catch (error) {
      setRouteError(error instanceof Error ? error.message : "Route generation failed.");
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleSaveSelectedRoute() {
    if (!selectedRoute) {
      return;
    }

    setIsSavingRoute(true);
    setSavedRouteError(null);

    try {
      const saved = await saveRoute(selectedRoute);
      setSavedRoutes((current) => [saved, ...current]);
      setSelectedSavedRouteId(saved.id);
    } catch (error) {
      setSavedRouteError(error instanceof Error ? error.message : "Route could not be saved.");
    } finally {
      setIsSavingRoute(false);
    }
  }

  function finishRun(summary: RunSummary) {
    setLastSummary(summary);
    setRuns(saveRun(summary));
    setView("summary");
  }

  if (view === "tracking" && location.status === "ready" && selectedRoute) {
    return <RunTracker origin={location.coordinate} route={selectedRoute} onFinish={finishRun} />;
  }

  if (authStatus === "loading") {
    return (
      <main className="app-shell auth-shell">
        <div className="panel auth-card">
          <span className="eyebrow">Michi</span>
          <h1>Preparing your routes...</h1>
        </div>
      </main>
    );
  }

  if (!user) {
    return <AuthScreen onAuthenticated={handleAuthenticated} />;
  }

  return (
    <main className="app-shell">
      <section className="topbar">
        <div>
          <span className="eyebrow">Michi</span>
          <h1>Find a real road route for today’s run.</h1>
        </div>
        <div className="topbar-actions">
          <div className="status-pill">{location.status === "ready" ? (location.isDemo ? "Demo start" : "GPS ready") : "Location needed"}</div>
          <div className="profile-pill">
            <span>{user.fullName ?? user.email}</span>
            <button className="secondary-button compact-button" onClick={handleLogout}>
              Logout
            </button>
          </div>
        </div>
      </section>

      <section className="hero-grid">
        <div className="panel planner-panel">
          <div className="section-heading">
            <span className="eyebrow">Route generator</span>
            <h2>Start and finish at the same point, using actual roads.</h2>
          </div>

          <div className="location-box">
            <p>{location.message}</p>
            <div className="control-row">
              <button className="primary-button" onClick={requestLocation} disabled={location.status === "loading"}>
                {location.status === "loading" ? "Locating..." : "Use my location"}
              </button>
              <button className="secondary-button" onClick={useDemoLocation}>
                Demo mode
              </button>
            </div>
          </div>

          <div className="field-group">
            <label>Distance</label>
            <div className="segmented">
              {DISTANCES.map((value) => (
                <button
                  key={value}
                  className={distance === value ? "active" : ""}
                  onClick={() => setDistance(value)}
                >
                  {value} km
                </button>
              ))}
            </div>
          </div>

          <div className="field-group">
            <label>Run type</label>
            <div className="segmented run-type">
              {RUN_TYPES.map((value) => (
                <button
                  key={value}
                  className={runType === value ? "active" : ""}
                  onClick={() => setRunType(value)}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>

          <button className="generate-button" onClick={handleGenerateRoutes} disabled={isGenerating}>
            {isGenerating ? "Finding real routes..." : "Generate road routes"}
          </button>

          {routeError && <div className="error-box">{routeError}</div>}
        </div>

        <div className="map-panel">
          <RouteMap origin={origin} route={previewRoute} />
        </div>
      </section>

      <section className="content-grid">
        <div className="panel route-panel">
          <div className="section-heading">
            <span className="eyebrow">Route options</span>
            <h2>{routes.length ? "Choose your route" : "No fake circles here"}</h2>
          </div>

          {routes.length === 0 ? (
            <p className="muted">
              Michi waits for real road-following geometry from the routing provider before drawing anything on the map.
            </p>
          ) : (
            <div className="route-list">
              {routes.map((route) => (
                <button
                  key={route.id}
                  className={`route-card ${selectedRoute?.id === route.id ? "selected" : ""}`}
                  onClick={() => {
                    setSelectedRouteId(route.id);
                    setSelectedSavedRouteId(null);
                  }}
                >
                  <span>{route.name}</span>
                  <strong>{formatDistance(route.distanceKm)}</strong>
                  <small>{formatDuration(route.durationMinutes)} · score {route.score}</small>
                </button>
              ))}
            </div>
          )}

          {selectedRoute && (
            <div className="selected-route">
              <div>
                <span className="eyebrow">Selected</span>
                <h3>{selectedRoute.name}</h3>
              </div>
              <ul>
                {selectedRoute.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
              <button className="primary-button full-width" onClick={() => setView("tracking")}>
                Start run
              </button>
              <button className="secondary-button full-width save-route-button" onClick={handleSaveSelectedRoute} disabled={isSavingRoute}>
                {isSavingRoute ? "Saving..." : "Save route"}
              </button>
            </div>
          )}
        </div>

        <div className="panel dashboard-panel">
          <div className="section-heading">
            <span className="eyebrow">Library</span>
            <h2>Saved routes</h2>
          </div>
          <SavedRoutesPanel
            routes={savedRoutes}
            selectedRouteId={selectedSavedRouteId}
            error={savedRouteError}
            onSelect={(routeId) => {
              setSelectedSavedRouteId(routeId);
              setSelectedRouteId(null);
            }}
            onRefresh={refreshSavedRoutes}
          />
        </div>
      </section>

      {view === "summary" && lastSummary && (
        <section className="summary-drawer">
          <div className="panel summary-panel">
            <span className="eyebrow">Run saved</span>
            <h2>{lastSummary.routeName}</h2>
            <div className="metric-row">
              <Metric label="Distance" value={formatDistance(lastSummary.distanceKm)} />
              <Metric label="Time" value={`${Math.round(lastSummary.durationSeconds / 60)} min`} />
              <Metric label="Pace" value={lastSummary.pace} />
            </div>
            <button className="secondary-button" onClick={() => setView("plan")}>
              Back to planner
            </button>
          </div>
        </section>
      )}
    </main>
  );
}

function AuthScreen({ onAuthenticated }: { onAuthenticated: (user: UserProfile) => void }) {
  const [mode, setMode] = useState<"signup" | "login">("signup");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const nextUser =
        mode === "signup"
          ? await registerUser({ fullName, email, password })
          : await loginUser({ email, password });
      onAuthenticated(nextUser);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Authentication failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="app-shell auth-shell">
      <div className="panel auth-card">
        <span className="eyebrow">Michi</span>
        <h1>{mode === "signup" ? "Create your running route account." : "Welcome back to Michi."}</h1>
        <form className="auth-form" onSubmit={handleSubmit}>
          {mode === "signup" && (
            <label>
              Full name
              <input value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" />
            </label>
          )}
          <label>
            Email
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" />
          </label>
          <label>
            Password
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
            />
          </label>
          {error && <div className="error-box">{error}</div>}
          <button className="generate-button" disabled={isSubmitting}>
            {isSubmitting ? "Please wait..." : mode === "signup" ? "Sign up" : "Log in"}
          </button>
        </form>
        <button className="auth-switch" onClick={() => setMode((value) => (value === "signup" ? "login" : "signup"))}>
          {mode === "signup" ? "Already have an account? Log in" : "New here? Create an account"}
        </button>
      </div>
    </main>
  );
}

function SavedRoutesPanel({
  routes,
  selectedRouteId,
  error,
  onSelect,
  onRefresh
}: {
  routes: SavedRoute[];
  selectedRouteId: string | null;
  error: string | null;
  onSelect: (routeId: string) => void;
  onRefresh: () => void;
}) {
  const totalKm = routes.reduce((sum, route) => sum + route.distanceKm, 0);

  if (error) {
    return (
      <>
        <div className="error-box">{error}</div>
        <button className="secondary-button full-width retry-button" onClick={onRefresh}>
          Retry
        </button>
      </>
    );
  }

  if (!routes.length) {
    return <p className="muted">Saved routes will appear here after you choose one from the generated options.</p>;
  }

  return (
    <>
      <div className="metric-row">
        <Metric label="Routes" value={String(routes.length)} />
        <Metric label="Distance" value={formatDistance(totalKm)} />
        <Metric label="Latest" value={new Date(routes[0].createdAt).toLocaleDateString()} />
      </div>
      <div className="history-list">
        {routes.slice(0, 6).map((route) => (
          <button
            key={route.id}
            className={`saved-route-item ${selectedRouteId === route.id ? "selected" : ""}`}
            onClick={() => onSelect(route.id)}
          >
            <div>
              <strong>{route.name}</strong>
              <span>{formatDuration(route.durationMinutes)} · score {route.score}</span>
            </div>
            <span>{formatDistance(route.distanceKm)}</span>
          </button>
        ))}
      </div>
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export default App;
