import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { RouteMap } from "./components/RouteMap";
import { RunTracker } from "./components/RunTracker";
import { DEMO_LOCATION, formatDistance, formatDuration } from "./lib/geo";
import { getCurrentUser, loginUser, logoutUser, registerUser } from "./lib/auth";
import { generateRoutes, loadSavedRoutes, saveRoute } from "./lib/routes";
import { useOnlineStatus } from "./lib/network";
import { loadRuns, saveRun } from "./lib/storage";
import type { Coordinate, LocationState, RouteOption, RunSummary, RunType, SavedRoute, UserProfile } from "./types";

const DISTANCES = [2, 5, 10] as const;
const RUN_TYPES: RunType[] = ["Easy", "Recovery", "Tempo", "Long Run"];
const CURRENT_USER_QUERY_KEY = ["current-user"] as const;
const SAVED_ROUTES_QUERY_KEY = ["saved-routes"] as const;

type View = "plan" | "tracking" | "summary";

function App() {
  const queryClient = useQueryClient();
  const isOnline = useOnlineStatus();
  const currentUserQuery = useQuery({
    queryKey: CURRENT_USER_QUERY_KEY,
    queryFn: getCurrentUser,
    enabled: isOnline
  });
  const user = currentUserQuery.data ?? null;
  const [location, setLocation] = useState<LocationState>({
    status: "idle",
    coordinate: null,
    message: "Location helps Michi find road-following routes from your real start point."
  });
  const [distance, setDistance] = useState<(typeof DISTANCES)[number]>(5);
  const [runType, setRunType] = useState<RunType>("Easy");
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [selectedSavedRouteId, setSelectedSavedRouteId] = useState<string | null>(null);
  const [routeValidationError, setRouteValidationError] = useState<string | null>(null);
  const [view, setView] = useState<View>("plan");
  const [lastSummary, setLastSummary] = useState<RunSummary | null>(null);
  const [runs, setRuns] = useState<RunSummary[]>([]);

  const savedRoutesQuery = useQuery({
    queryKey: SAVED_ROUTES_QUERY_KEY,
    queryFn: loadSavedRoutes,
    enabled: Boolean(user) && isOnline
  });

  const generateRoutesMutation = useMutation({
    mutationFn: (input: { origin: Coordinate; targetDistanceKm: 2 | 5 | 10; runType: RunType }) =>
      generateRoutes(input.origin, input.targetDistanceKm, input.runType),
    onSuccess: (generated) => {
      setSelectedRouteId(generated[0]?.id ?? null);
      setSelectedSavedRouteId(null);
    }
  });

  const saveRouteMutation = useMutation({
    mutationFn: saveRoute,
    onSuccess: (saved) => {
      queryClient.setQueryData<SavedRoute[]>(SAVED_ROUTES_QUERY_KEY, (current = []) => [saved, ...current]);
      setSelectedSavedRouteId(saved.id);
      void queryClient.invalidateQueries({ queryKey: SAVED_ROUTES_QUERY_KEY });
    }
  });

  const logoutMutation = useMutation({
    mutationFn: logoutUser,
    onSettled: () => {
      queryClient.setQueryData(CURRENT_USER_QUERY_KEY, null);
      queryClient.removeQueries({ queryKey: SAVED_ROUTES_QUERY_KEY });
      generateRoutesMutation.reset();
      setSelectedRouteId(null);
      setSelectedSavedRouteId(null);
    }
  });

  useEffect(() => {
    setRuns(loadRuns());
  }, []);

  const routes = generateRoutesMutation.data ?? [];
  const savedRoutes = savedRoutesQuery.data ?? [];

  const selectedRoute = useMemo(() => {
    return routes.find((route) => route.id === selectedRouteId) ?? routes[0] ?? null;
  }, [routes, selectedRouteId]);

  const selectedSavedRoute = useMemo(() => {
    return savedRoutes.find((route) => route.id === selectedSavedRouteId) ?? null;
  }, [savedRoutes, selectedSavedRouteId]);

  const previewRoute = selectedSavedRoute ?? selectedRoute;
  const origin = previewRoute?.geometry[0] ?? (location.status === "ready" ? location.coordinate : DEMO_LOCATION);

  function handleAuthenticated(nextUser: UserProfile) {
    queryClient.setQueryData(CURRENT_USER_QUERY_KEY, nextUser);
  }

  function handleLogout() {
    logoutMutation.mutate();
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
      setRouteValidationError("Choose your current location or demo mode before generating a route.");
      return;
    }

    if (!isOnline) {
      setRouteValidationError("Route generation needs a network connection.");
      return;
    }

    setRouteValidationError(null);
    generateRoutesMutation.reset();
    setSelectedRouteId(null);
    setSelectedSavedRouteId(null);
    generateRoutesMutation.mutate({ origin: location.coordinate, targetDistanceKm: distance, runType });
  }

  function handleSaveSelectedRoute() {
    if (!selectedRoute) {
      return;
    }

    if (!isOnline) {
      return;
    }

    saveRouteMutation.mutate(selectedRoute);
  }

  function finishRun(summary: RunSummary) {
    setLastSummary(summary);
    setRuns(saveRun(summary));
    setView("summary");
  }

  if (view === "tracking" && location.status === "ready" && selectedRoute) {
    return <RunTracker origin={location.coordinate} route={selectedRoute} onFinish={finishRun} />;
  }

  if (currentUserQuery.isLoading && isOnline) {
    return (
      <main className="app-shell auth-shell">
        <div className="panel auth-card">
          <span className="eyebrow">Michi</span>
          <h1>Preparing your routes...</h1>
        </div>
      </main>
    );
  }

  if (!isOnline && !user) {
    return (
      <main className="app-shell auth-shell">
        <div className="panel auth-card">
          <span className="eyebrow">Michi</span>
          <h1>Michi is offline.</h1>
          <p className="muted">Reconnect to restore your session or sign in.</p>
        </div>
      </main>
    );
  }

  if (!user) {
    return <AuthScreen isOnline={isOnline} onAuthenticated={handleAuthenticated} />;
  }

  return (
    <main className="app-shell">
      {!isOnline && <div className="offline-banner">Offline mode: saved app shell is available, but auth, route generation, and syncing need network.</div>}
      <section className="topbar">
        <div>
          <span className="eyebrow">Michi</span>
          <h1>Find a real road route for today’s run.</h1>
        </div>
        <div className="topbar-actions">
          <div className="status-pill">{location.status === "ready" ? (location.isDemo ? "Demo start" : "GPS ready") : "Location needed"}</div>
          <div className="profile-pill">
            <span>{user.fullName ?? user.email}</span>
            <button className="secondary-button compact-button" onClick={handleLogout} disabled={logoutMutation.isPending || !isOnline}>
              {logoutMutation.isPending ? "Logging out" : "Logout"}
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

          <button className="generate-button" onClick={handleGenerateRoutes} disabled={generateRoutesMutation.isPending || !isOnline}>
            {generateRoutesMutation.isPending ? "Finding real routes..." : "Generate road routes"}
          </button>

          {(!isOnline || routeValidationError || generateRoutesMutation.error) && (
            <div className="error-box">
              {!isOnline
                ? "Route generation needs a network connection."
                : routeValidationError ??
                (generateRoutesMutation.error instanceof Error ? generateRoutesMutation.error.message : "Route generation failed.")}
            </div>
          )}
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
              <button className="secondary-button full-width save-route-button" onClick={handleSaveSelectedRoute} disabled={saveRouteMutation.isPending || !isOnline}>
                {saveRouteMutation.isPending ? "Saving..." : "Save route"}
              </button>
              {saveRouteMutation.error && (
                <div className="error-box">
                  {saveRouteMutation.error instanceof Error ? saveRouteMutation.error.message : "Route could not be saved."}
                </div>
              )}
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
            error={savedRoutesQuery.error instanceof Error ? savedRoutesQuery.error.message : null}
            isLoading={savedRoutesQuery.isLoading}
            isOnline={isOnline}
            onSelect={(routeId) => {
              setSelectedSavedRouteId(routeId);
              setSelectedRouteId(null);
            }}
            onRefresh={() => {
              void savedRoutesQuery.refetch();
            }}
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

function AuthScreen({ isOnline, onAuthenticated }: { isOnline: boolean; onAuthenticated: (user: UserProfile) => void }) {
  const [mode, setMode] = useState<"signup" | "login">("signup");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const registerMutation = useMutation({
    mutationFn: registerUser,
    onSuccess: onAuthenticated
  });

  const loginMutation = useMutation({
    mutationFn: loginUser,
    onSuccess: onAuthenticated
  });

  const activeMutation = mode === "signup" ? registerMutation : loginMutation;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isOnline) {
      return;
    }

    if (mode === "signup") {
      registerMutation.mutate({ fullName, email, password });
      return;
    }

    loginMutation.mutate({ email, password });
  }

  return (
    <main className="app-shell auth-shell">
      <div className="panel auth-card">
        <span className="eyebrow">Michi</span>
        <h1>{mode === "signup" ? "Create your running route account." : "Welcome back to Michi."}</h1>
        {!isOnline && <div className="error-box">Signup and login need a network connection.</div>}
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
          {activeMutation.error && (
            <div className="error-box">
              {activeMutation.error instanceof Error ? activeMutation.error.message : "Authentication failed."}
            </div>
          )}
          <button className="generate-button" disabled={activeMutation.isPending || !isOnline}>
            {activeMutation.isPending ? "Please wait..." : mode === "signup" ? "Sign up" : "Log in"}
          </button>
        </form>
        <button
          className="auth-switch"
          onClick={() => {
            registerMutation.reset();
            loginMutation.reset();
            setMode((value) => (value === "signup" ? "login" : "signup"));
          }}
        >
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
  isLoading,
  isOnline,
  onSelect,
  onRefresh
}: {
  routes: SavedRoute[];
  selectedRouteId: string | null;
  error: string | null;
  isLoading: boolean;
  isOnline: boolean;
  onSelect: (routeId: string) => void;
  onRefresh: () => void;
}) {
  const totalKm = routes.reduce((sum, route) => sum + route.distanceKm, 0);

  if (isLoading) {
    return <p className="muted">Loading your saved routes...</p>;
  }

  if (!isOnline && !routes.length) {
    return <p className="muted">Saved routes need a network connection the first time they load.</p>;
  }

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
