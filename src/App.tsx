import { useEffect, useMemo, useState } from "react";
import { RouteMap } from "./components/RouteMap";
import { RunTracker } from "./components/RunTracker";
import { DEMO_LOCATION, formatDistance, formatDuration } from "./lib/geo";
import { generateRoutes } from "./lib/routes";
import { loadRuns, saveRun } from "./lib/storage";
import type { Coordinate, LocationState, RouteOption, RunSummary, RunType } from "./types";

const DISTANCES = [2, 5, 10] as const;
const RUN_TYPES: RunType[] = ["Easy", "Recovery", "Tempo", "Long Run"];

type View = "plan" | "tracking" | "summary";

function App() {
  const [location, setLocation] = useState<LocationState>({
    status: "idle",
    coordinate: null,
    message: "Location helps Michi find road-following routes from your real start point."
  });
  const [distance, setDistance] = useState<(typeof DISTANCES)[number]>(5);
  const [runType, setRunType] = useState<RunType>("Easy");
  const [routes, setRoutes] = useState<RouteOption[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [view, setView] = useState<View>("plan");
  const [lastSummary, setLastSummary] = useState<RunSummary | null>(null);
  const [runs, setRuns] = useState<RunSummary[]>([]);

  useEffect(() => {
    setRuns(loadRuns());
  }, []);

  const selectedRoute = useMemo(() => {
    return routes.find((route) => route.id === selectedRouteId) ?? routes[0] ?? null;
  }, [routes, selectedRouteId]);

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

  function finishRun(summary: RunSummary) {
    setLastSummary(summary);
    setRuns(saveRun(summary));
    setView("summary");
  }

  if (view === "tracking" && location.status === "ready" && selectedRoute) {
    return <RunTracker origin={location.coordinate} route={selectedRoute} onFinish={finishRun} />;
  }

  const origin = location.status === "ready" ? location.coordinate : DEMO_LOCATION;

  return (
    <main className="app-shell">
      <section className="topbar">
        <div>
          <span className="eyebrow">Michi</span>
          <h1>Find a real road route for today’s run.</h1>
        </div>
        <div className="status-pill">{location.status === "ready" ? (location.isDemo ? "Demo start" : "GPS ready") : "Location needed"}</div>
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
          <RouteMap origin={origin} route={selectedRoute} />
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
                  onClick={() => setSelectedRouteId(route.id)}
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
            </div>
          )}
        </div>

        <div className="panel dashboard-panel">
          <div className="section-heading">
            <span className="eyebrow">Dashboard</span>
            <h2>Local run history</h2>
          </div>
          <Dashboard runs={runs} />
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

function Dashboard({ runs }: { runs: RunSummary[] }) {
  const totalKm = runs.reduce((sum, run) => sum + run.distanceKm, 0);

  if (!runs.length) {
    return <p className="muted">Finished runs will appear here. Everything stays in this browser for the MVP.</p>;
  }

  return (
    <>
      <div className="metric-row">
        <Metric label="Runs" value={String(runs.length)} />
        <Metric label="Distance" value={formatDistance(totalKm)} />
      </div>
      <div className="history-list">
        {runs.slice(0, 5).map((run) => (
          <div key={run.id} className="history-item">
            <div>
              <strong>{run.routeName}</strong>
              <span>{new Date(run.completedAt).toLocaleDateString()}</span>
            </div>
            <span>{formatDistance(run.distanceKm)}</span>
          </div>
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
