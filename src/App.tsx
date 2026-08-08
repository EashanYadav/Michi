import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  BarChart3,
  Bookmark,
  CloudSun,
  Gauge,
  Library,
  LocateFixed,
  LogOut,
  MapPinned,
  Navigation,
  PanelLeft,
  Play,
  RefreshCw,
  Route,
  Settings,
  ShieldCheck,
  Sparkles,
  Timer,
  User,
  Zap
} from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { RouteMap } from "./components/RouteMap";
import { RunTracker } from "./components/RunTracker";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { DEMO_LOCATION, formatDistance, formatDuration } from "./lib/geo";
import { getCurrentUser, loginUser, logoutUser, registerUser } from "./lib/auth";
import { generateRoutes, loadSavedRoutes, saveRoute } from "./lib/routes";
import { loadRuns, saveRun } from "./lib/runs";
import { useOnlineStatus } from "./lib/network";
import { cn } from "./lib/utils";
import type { Coordinate, LocationState, RouteOption, RunSummary, RunType, SavedRoute, UserProfile } from "./types";

const DISTANCES = [2, 5, 10] as const;
const RUN_TYPES: RunType[] = ["Easy", "Recovery", "Tempo", "Long Run"];
const CURRENT_USER_QUERY_KEY = ["current-user"] as const;
const SAVED_ROUTES_QUERY_KEY = ["saved-routes"] as const;
const RUNS_QUERY_KEY = ["runs"] as const;

type View = "plan" | "tracking" | "summary";

const navItems = [
  { label: "Today", icon: MapPinned },
  { label: "Generate", icon: Route },
  { label: "Library", icon: Bookmark },
  { label: "Run", icon: Play },
  { label: "Dashboard", icon: BarChart3 },
  { label: "Insights", icon: Sparkles },
  { label: "Settings", icon: Settings }
] as const;

const quickPresets: Array<{ label: string; detail: string; distance: (typeof DISTANCES)[number]; runType: RunType; icon: typeof Route }> = [
  { label: "Easy 5k", detail: "5 km · Easy · flat", distance: 5, runType: "Easy", icon: Route },
  { label: "Recovery 2k", detail: "2 km · Recovery · quiet", distance: 2, runType: "Recovery", icon: Gauge },
  { label: "Tempo 10k", detail: "10 km · Tempo · low traffic", distance: 10, runType: "Tempo", icon: Zap }
];

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

  const savedRoutesQuery = useQuery({
    queryKey: SAVED_ROUTES_QUERY_KEY,
    queryFn: loadSavedRoutes,
    enabled: Boolean(user) && isOnline
  });

  const runsQuery = useQuery({
    queryKey: RUNS_QUERY_KEY,
    queryFn: loadRuns,
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

  const saveRunMutation = useMutation({
    mutationFn: saveRun,
    onSuccess: (saved) => {
      queryClient.setQueryData<RunSummary[]>(RUNS_QUERY_KEY, (current = []) => [
        saved,
        ...current.filter((run) => run.id !== saved.id)
      ].slice(0, 20));
      void queryClient.invalidateQueries({ queryKey: RUNS_QUERY_KEY });
    }
  });

  const logoutMutation = useMutation({
    mutationFn: logoutUser,
    onSettled: () => {
      queryClient.setQueryData(CURRENT_USER_QUERY_KEY, null);
      queryClient.removeQueries({ queryKey: SAVED_ROUTES_QUERY_KEY });
      queryClient.removeQueries({ queryKey: RUNS_QUERY_KEY });
      generateRoutesMutation.reset();
      setSelectedRouteId(null);
      setSelectedSavedRouteId(null);
    }
  });

  const routes = generateRoutesMutation.data ?? [];
  const savedRoutes = savedRoutesQuery.data ?? [];
  const runs = runsQuery.data ?? [];

  const selectedRoute = useMemo(() => {
    return routes.find((route) => route.id === selectedRouteId) ?? routes[0] ?? null;
  }, [routes, selectedRouteId]);

  const selectedSavedRoute = useMemo(() => {
    return savedRoutes.find((route) => route.id === selectedSavedRouteId) ?? null;
  }, [savedRoutes, selectedSavedRouteId]);

  const previewRoute = selectedSavedRoute ?? selectedRoute;
  const origin = previewRoute?.geometry[0] ?? (location.status === "ready" ? location.coordinate : DEMO_LOCATION);
  const totalSavedKm = savedRoutes.reduce((sum, route) => sum + route.distanceKm, 0);
  const latestRun = runs[0] ?? null;

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
    if (!selectedRoute || !isOnline) {
      return;
    }

    saveRouteMutation.mutate(selectedRoute);
  }

  function finishRun(summary: RunSummary) {
    setLastSummary(summary);
    queryClient.setQueryData<RunSummary[]>(RUNS_QUERY_KEY, (current = []) => [summary, ...current].slice(0, 20));
    saveRunMutation.mutate(summary);
    setView("summary");
  }

  if (view === "tracking" && location.status === "ready" && selectedRoute) {
    return <RunTracker origin={location.coordinate} route={selectedRoute} onFinish={finishRun} />;
  }

  if (currentUserQuery.isLoading && isOnline) {
    return (
      <main className="grid min-h-screen place-items-center bg-background p-6">
        <Card className="w-full max-w-md p-8">
          <LogoBlock />
          <h1 className="mt-8 font-serif text-4xl leading-none">Preparing your routes...</h1>
        </Card>
      </main>
    );
  }

  if (!isOnline && !user) {
    return (
      <main className="grid min-h-screen place-items-center bg-background p-6">
        <Card className="w-full max-w-md p-8">
          <LogoBlock />
          <h1 className="mt-8 font-serif text-4xl leading-none">Michi is offline.</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">Reconnect to restore your session or sign in.</p>
        </Card>
      </main>
    );
  }

  if (!user) {
    return <AuthScreen isOnline={isOnline} onAuthenticated={handleAuthenticated} />;
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="grid min-h-screen lg:grid-cols-[256px_1fr]">
        <Sidebar user={user} onLogout={handleLogout} logoutDisabled={logoutMutation.isPending || !isOnline} />
        <section className="min-w-0">
          <TopHeader location={location} />
          {!isOnline && (
            <div className="mx-auto mt-5 max-w-6xl px-5">
              <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
                Offline mode: saved app shell is available, but auth, route generation, and syncing need network.
              </div>
            </div>
          )}

          <div className="mx-auto grid max-w-6xl gap-10 px-5 py-6 lg:px-8">
            <section className="michi-grid-bg rounded-lg border border-border bg-card/70 p-5 shadow-soft md:p-10">
              <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
                <Card className="bg-card/95">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-xs font-medium uppercase tracking-[0.34em] text-muted-foreground">
                          Good evening, {firstName(user)}
                        </p>
                        <CardTitle className="mt-4 max-w-lg text-5xl md:text-6xl">
                          Find a real road route for today&apos;s run.
                        </CardTitle>
                      </div>
                      <ScoreBadge score={selectedRoute?.score ?? 81} />
                    </div>
                    <p className="max-w-xl text-sm leading-6 text-muted-foreground">
                      Michi looked at your start point, selected distance, and available routes to keep today&apos;s run simple.
                    </p>
                  </CardHeader>
                  <CardContent className="grid gap-5">
                    <RouteRecommendation route={selectedRoute} distance={distance} runType={runType} />
                    <MichiNote location={location} route={selectedRoute} />
                    <div className="flex flex-wrap gap-2">
                      <Button onClick={() => setView("tracking")} disabled={!selectedRoute || location.status !== "ready"}>
                        Start this run <ArrowRight className="h-4 w-4" />
                      </Button>
                      <Button variant="secondary" onClick={() => savedRoutes[0] && setSelectedSavedRouteId(savedRoutes[0].id)} disabled={!savedRoutes.length}>
                        Use saved route
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <div className="overflow-hidden rounded-md border border-border bg-[#dfe9da] shadow-card">
                  <RouteMap origin={origin} route={previewRoute} />
                </div>
              </div>
            </section>

            <section className="grid gap-4" id="generate">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <h2 className="font-serif text-2xl leading-tight">Quick generate</h2>
                  <p className="text-sm text-muted-foreground">Adjust the shape of today&apos;s run in one tap.</p>
                </div>
                <a className="hidden items-center gap-2 text-sm font-medium text-foreground sm:inline-flex" href="#planner">
                  Open planner <ArrowRight className="h-4 w-4" />
                </a>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                {quickPresets.map((preset) => {
                  const Icon = preset.icon;
                  return (
                    <button
                      key={preset.label}
                      className="flex items-center justify-between rounded-lg border border-border bg-card p-4 text-left shadow-card transition hover:-translate-y-0.5 hover:bg-card/80"
                      onClick={() => {
                        setDistance(preset.distance);
                        setRunType(preset.runType);
                      }}
                    >
                      <span className="flex items-center gap-3">
                        <span className="grid h-9 w-9 place-items-center rounded-md bg-secondary text-primary">
                          <Icon className="h-4 w-4" />
                        </span>
                        <span>
                          <span className="block text-sm font-medium">{preset.label}</span>
                          <span className="block text-xs text-muted-foreground">{preset.detail}</span>
                        </span>
                      </span>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="grid gap-4 xl:grid-cols-[0.92fr_1.08fr]" id="planner">
              <PlannerPanel
                distance={distance}
                runType={runType}
                location={location}
                isOnline={isOnline}
                isGenerating={generateRoutesMutation.isPending}
                validationError={routeValidationError}
                generationError={generateRoutesMutation.error instanceof Error ? generateRoutesMutation.error.message : null}
                onDistanceChange={setDistance}
                onRunTypeChange={setRunType}
                onUseLocation={requestLocation}
                onUseDemo={useDemoLocation}
                onGenerate={handleGenerateRoutes}
              />
              <RouteOptionsPanel
                routes={routes}
                selectedRoute={selectedRoute}
                onSelect={(routeId) => {
                  setSelectedRouteId(routeId);
                  setSelectedSavedRouteId(null);
                }}
                onStart={() => setView("tracking")}
                onSave={handleSaveSelectedRoute}
                isSaving={saveRouteMutation.isPending}
                isOnline={isOnline}
                saveError={saveRouteMutation.error instanceof Error ? saveRouteMutation.error.message : null}
              />
            </section>

            <section className="grid gap-4 xl:grid-cols-[1fr_0.82fr]" id="library">
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
              <DashboardPanel
                totalSavedKm={totalSavedKm}
                savedRoutes={savedRoutes}
                runs={runs}
                latestRun={latestRun}
                runHistoryError={runsQuery.error instanceof Error ? runsQuery.error.message : null}
                saveRunError={saveRunMutation.error instanceof Error ? saveRunMutation.error.message : null}
              />
            </section>
          </div>
        </section>
      </div>

      {view === "summary" && lastSummary && (
        <section className="fixed inset-x-4 bottom-4 z-[1000] ml-auto max-w-xl">
          <Card className="p-5 shadow-soft">
            <p className="text-xs font-medium uppercase tracking-[0.28em] text-muted-foreground">Run saved</p>
            <h2 className="mt-2 font-serif text-3xl">{lastSummary.routeName}</h2>
            <div className="mt-4 grid grid-cols-3 gap-3">
              <Metric label="Distance" value={formatDistance(lastSummary.distanceKm)} />
              <Metric label="Time" value={`${Math.round(lastSummary.durationSeconds / 60)} min`} />
              <Metric label="Pace" value={lastSummary.pace} />
            </div>
            <Button className="mt-4" variant="secondary" onClick={() => setView("plan")}>
              Back to planner
            </Button>
          </Card>
        </section>
      )}
    </main>
  );
}

function Sidebar({
  user,
  onLogout,
  logoutDisabled
}: {
  user: UserProfile;
  onLogout: () => void;
  logoutDisabled: boolean;
}) {
  return (
    <aside className="hidden min-h-screen border-r border-border bg-[#eef1ec] lg:flex lg:flex-col">
      <div className="p-4">
        <LogoBlock />
      </div>
      <nav className="grid gap-1 px-2 text-sm">
        <p className="px-2 py-2 text-xs text-muted-foreground">Plan</p>
        {navItems.map((item, index) => {
          const Icon = item.icon;
          return (
            <a
              key={item.label}
              href={item.label === "Generate" ? "#generate" : item.label === "Library" ? "#library" : "#"}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2.5 text-foreground transition hover:bg-accent",
                index === 0 && "bg-accent"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </a>
          );
        })}
      </nav>
      <div className="mt-auto flex items-center gap-3 p-4">
        <div className="grid h-9 w-9 place-items-center rounded-full bg-accent text-xs font-medium text-primary">
          {initials(user)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{user.fullName ?? "Michi runner"}</p>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
        </div>
        <Button size="icon" variant="ghost" onClick={onLogout} disabled={logoutDisabled} aria-label="Logout">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </aside>
  );
}

function TopHeader({ location }: { location: LocationState }) {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-background/92 px-4 backdrop-blur lg:px-6">
      <div className="flex items-center gap-4 text-sm">
        <PanelLeft className="h-4 w-4" />
        <span className="text-muted-foreground">michi</span>
        <span className="text-muted-foreground">/</span>
        <span>Today</span>
      </div>
      <StatusBadge location={location} />
    </header>
  );
}

function PlannerPanel({
  distance,
  runType,
  location,
  isOnline,
  isGenerating,
  validationError,
  generationError,
  onDistanceChange,
  onRunTypeChange,
  onUseLocation,
  onUseDemo,
  onGenerate
}: {
  distance: (typeof DISTANCES)[number];
  runType: RunType;
  location: LocationState;
  isOnline: boolean;
  isGenerating: boolean;
  validationError: string | null;
  generationError: string | null;
  onDistanceChange: (value: (typeof DISTANCES)[number]) => void;
  onRunTypeChange: (value: RunType) => void;
  onUseLocation: () => void;
  onUseDemo: () => void;
  onGenerate: () => void;
}) {
  return (
    <Card id="planner-controls">
      <CardHeader>
        <p className="text-xs font-medium uppercase tracking-[0.28em] text-muted-foreground">Route generator</p>
        <CardTitle>Shape the run without losing the road.</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="rounded-lg border border-border bg-secondary/60 p-4">
          <p className="text-sm leading-6 text-muted-foreground">{location.message}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={onUseLocation} disabled={location.status === "loading"}>
              <LocateFixed className="h-4 w-4" />
              {location.status === "loading" ? "Locating..." : "Use my location"}
            </Button>
            <Button variant="secondary" onClick={onUseDemo}>
              Demo mode
            </Button>
          </div>
        </div>

        <SegmentedControl
          label="Distance"
          values={DISTANCES}
          value={distance}
          renderValue={(value) => `${value} km`}
          onChange={onDistanceChange}
        />

        <SegmentedControl label="Run type" values={RUN_TYPES} value={runType} renderValue={(value) => value} onChange={onRunTypeChange} />

        <Button size="lg" onClick={onGenerate} disabled={isGenerating || !isOnline}>
          {isGenerating ? "Finding real routes..." : "Generate road routes"}
          <Navigation className="h-4 w-4" />
        </Button>

        {(!isOnline || validationError || generationError) && (
          <div className="rounded-md border border-destructive/25 bg-destructive/10 p-3 text-sm leading-6 text-destructive">
            {!isOnline ? "Route generation needs a network connection." : validationError ?? generationError ?? "Route generation failed."}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RouteOptionsPanel({
  routes,
  selectedRoute,
  onSelect,
  onStart,
  onSave,
  isSaving,
  isOnline,
  saveError
}: {
  routes: RouteOption[];
  selectedRoute: RouteOption | null;
  onSelect: (routeId: string) => void;
  onStart: () => void;
  onSave: () => void;
  isSaving: boolean;
  isOnline: boolean;
  saveError: string | null;
}) {
  return (
    <Card>
      <CardHeader>
        <p className="text-xs font-medium uppercase tracking-[0.28em] text-muted-foreground">Route options</p>
        <CardTitle>{routes.length ? "Choose your route" : "No fake circles here"}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-5">
        {routes.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-card p-4 text-sm leading-6 text-muted-foreground">
            Michi waits for real road-following geometry from the routing provider before drawing anything on the map.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {routes.map((route) => (
              <button
                key={route.id}
                className={cn(
                  "rounded-lg border border-border bg-card p-4 text-left shadow-card transition hover:-translate-y-0.5",
                  selectedRoute?.id === route.id && "border-primary bg-accent/60"
                )}
                onClick={() => onSelect(route.id)}
              >
                <span className="flex items-start justify-between gap-3">
                  <span>
                    <span className="block font-serif text-xl font-semibold">{route.name}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {formatDuration(route.durationMinutes)} · score {route.score}
                    </span>
                  </span>
                  <span className="rounded-md bg-secondary px-2 py-1 text-xs font-medium text-primary">
                    {formatDistance(route.distanceKm)}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}

        {selectedRoute && (
          <div className="rounded-lg bg-foreground p-5 text-background">
            <p className="text-xs font-medium uppercase tracking-[0.28em] text-background/60">Selected</p>
            <h3 className="mt-2 font-serif text-2xl">{selectedRoute.name}</h3>
            <ul className="mt-3 grid gap-2 text-sm leading-6 text-background/75">
              {selectedRoute.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button className="bg-background text-foreground hover:bg-background/90" onClick={onStart}>
                Start run
              </Button>
              <Button variant="secondary" onClick={onSave} disabled={isSaving || !isOnline}>
                {isSaving ? "Saving..." : "Save route"}
              </Button>
            </div>
            {saveError && (
              <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {saveError}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
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

  return (
    <Card>
      <CardHeader>
        <p className="text-xs font-medium uppercase tracking-[0.28em] text-muted-foreground">Library</p>
        <CardTitle>Saved routes</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading your saved routes...</p>
        ) : !isOnline && !routes.length ? (
          <p className="text-sm text-muted-foreground">Saved routes need a network connection the first time they load.</p>
        ) : error ? (
          <div className="grid gap-3">
            <div className="rounded-md border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
            <Button variant="secondary" onClick={onRefresh}>
              <RefreshCw className="h-4 w-4" />
              Retry
            </Button>
          </div>
        ) : !routes.length ? (
          <p className="text-sm leading-6 text-muted-foreground">Saved routes will appear here after you choose one from the generated options.</p>
        ) : (
          <div className="grid gap-4">
            <div className="grid grid-cols-3 gap-3">
              <Metric label="Routes" value={String(routes.length)} />
              <Metric label="Distance" value={formatDistance(totalKm)} />
              <Metric label="Latest" value={new Date(routes[0].createdAt).toLocaleDateString()} />
            </div>
            <div className="grid gap-2">
              {routes.slice(0, 6).map((route) => (
                <button
                  key={route.id}
                  className={cn(
                    "flex items-center justify-between gap-4 rounded-lg border border-border bg-card p-3 text-left transition hover:bg-secondary",
                    selectedRouteId === route.id && "border-primary bg-accent/70"
                  )}
                  onClick={() => onSelect(route.id)}
                >
                  <span>
                    <strong className="block text-sm">{route.name}</strong>
                    <span className="text-xs text-muted-foreground">
                      {formatDuration(route.durationMinutes)} · score {route.score}
                    </span>
                  </span>
                  <span className="text-sm font-medium text-muted-foreground">{formatDistance(route.distanceKm)}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DashboardPanel({
  totalSavedKm,
  savedRoutes,
  runs,
  latestRun,
  runHistoryError,
  saveRunError
}: {
  totalSavedKm: number;
  savedRoutes: SavedRoute[];
  runs: RunSummary[];
  latestRun: RunSummary | null;
  runHistoryError: string | null;
  saveRunError: string | null;
}) {
  return (
    <Card>
      <CardHeader>
        <p className="text-xs font-medium uppercase tracking-[0.28em] text-muted-foreground">Dashboard</p>
        <CardTitle>Run intelligence</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <Metric icon={Library} label="Saved routes" value={String(savedRoutes.length)} />
        <Metric icon={Route} label="Library distance" value={formatDistance(totalSavedKm)} />
        <Metric icon={Timer} label="Recorded runs" value={String(runs.length)} />
        {(runHistoryError || saveRunError) && (
          <div className="rounded-md border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
            {saveRunError ?? runHistoryError}
          </div>
        )}
        <div className="rounded-lg border border-border bg-secondary/60 p-4">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">Latest run</p>
          <p className="mt-2 font-serif text-xl">{latestRun?.routeName ?? "No run recorded yet"}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {latestRun ? `${formatDistance(latestRun.distanceKm)} · ${latestRun.pace}` : "Start a generated route to build this history."}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function RouteRecommendation({
  route,
  distance,
  runType
}: {
  route: RouteOption | null;
  distance: (typeof DISTANCES)[number];
  runType: RunType;
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.28em] text-muted-foreground">Best run today</p>
      <h3 className="mt-4 font-serif text-2xl font-semibold">{route?.name ?? "Green Chowk"}</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {route ? `${formatDistance(route.distanceKm)} · ${formatDuration(route.durationMinutes)} · ${runType}` : `${distance} km · ${runType} · Moderate`}
      </p>
      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        <InsightTile icon={Timer} label="Best time" value="6:15 AM" />
        <InsightTile icon={CloudSun} label="Weather" value="24°C, clear" />
        <InsightTile icon={Gauge} label="AQI" value="42 · Good" />
        <InsightTile icon={ShieldCheck} label="Safety" value="88/100" />
      </div>
    </div>
  );
}

function MichiNote({ location, route }: { location: LocationState; route: RouteOption | null }) {
  return (
    <div className="rounded-lg border border-accent bg-accent/55 p-4 text-sm leading-6">
      <p className="mb-1 flex items-center gap-2 text-xs font-medium text-primary">
        <Sparkles className="h-4 w-4" />
        Michi notes
      </p>
      <p className="text-muted-foreground">
        {route
          ? route.notes[0]
          : location.status === "ready"
            ? "Low traffic corridors, softer wind before 7 AM, and a fresh loop are ready to generate."
            : "Choose GPS or demo mode first so Michi can find calm road-following routes from a real start point."}
      </p>
    </div>
  );
}

function SegmentedControl<T extends string | number>({
  label,
  values,
  value,
  renderValue,
  onChange
}: {
  label: string;
  values: readonly T[];
  value: T;
  renderValue: (value: T) => string;
  onChange: (value: T) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium text-foreground">{label}</p>
      <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
        {values.map((option) => (
          <button
            key={String(option)}
            className={cn(
              "min-h-10 rounded-md border border-border bg-card px-3 text-sm font-medium shadow-card transition hover:bg-secondary",
              option === value && "border-primary bg-accent text-primary"
            )}
            onClick={() => onChange(option)}
          >
            {renderValue(option)}
          </button>
        ))}
      </div>
    </div>
  );
}

function InsightTile({ icon: Icon, label, value }: { icon: typeof Timer; label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </p>
      <p className="mt-2 text-sm font-medium">{value}</p>
    </div>
  );
}

function Metric({ label, value, icon: Icon }: { label: string; value: string; icon?: typeof Route }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {label}
      </span>
      <strong className="mt-2 block text-lg leading-none">{value}</strong>
    </div>
  );
}

function StatusBadge({ location }: { location: LocationState }) {
  const text = location.status === "ready" ? (location.isDemo ? "Demo start" : "GPS ready") : "Location needed";
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
      <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />
      {text}
    </span>
  );
}

function ScoreBadge({ score }: { score: number }) {
  return <span className="rounded-md bg-secondary px-3 py-1 text-xs font-semibold text-primary">score {score}</span>;
}

function LogoBlock() {
  return (
    <div className="flex items-center gap-2">
      <div className="grid h-8 w-8 place-items-center rounded-md bg-primary text-sm font-bold text-primary-foreground">m</div>
      <div>
        <p className="font-serif text-lg font-semibold leading-none">michi</p>
        <p className="mt-1 text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Run intelligence</p>
      </div>
    </div>
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
    <main className="grid min-h-screen place-items-center bg-background p-5">
      <Card className="michi-grid-bg w-full max-w-5xl overflow-hidden">
        <div className="grid md:grid-cols-[1fr_0.9fr]">
          <section className="p-8 md:p-12">
            <LogoBlock />
            <h1 className="mt-16 max-w-xl font-serif text-5xl leading-none md:text-6xl">
              {mode === "signup" ? "Create your running route account." : "Welcome back to Michi."}
            </h1>
            <p className="mt-5 max-w-md text-sm leading-6 text-muted-foreground">
              Plan calm road-following loops, save the routes you trust, and keep your run history in one quiet place.
            </p>
          </section>
          <section className="border-t border-border bg-card/95 p-6 md:border-l md:border-t-0 md:p-8">
            {!isOnline && (
              <div className="mb-4 rounded-md border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
                Signup and login need a network connection.
              </div>
            )}
            <form className="grid gap-4" onSubmit={handleSubmit}>
              {mode === "signup" && (
                <label className="grid gap-2 text-sm font-medium">
                  Full name
                  <input
                    className="h-11 rounded-md border border-input bg-background px-3 outline-none focus:ring-2 focus:ring-ring"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    autoComplete="name"
                  />
                </label>
              )}
              <label className="grid gap-2 text-sm font-medium">
                Email
                <input
                  className="h-11 rounded-md border border-input bg-background px-3 outline-none focus:ring-2 focus:ring-ring"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  type="email"
                  autoComplete="email"
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                Password
                <input
                  className="h-11 rounded-md border border-input bg-background px-3 outline-none focus:ring-2 focus:ring-ring"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  type="password"
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                />
              </label>
              {activeMutation.error && (
                <div className="rounded-md border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
                  {activeMutation.error instanceof Error ? activeMutation.error.message : "Authentication failed."}
                </div>
              )}
              <Button size="lg" disabled={activeMutation.isPending || !isOnline}>
                {activeMutation.isPending ? "Please wait..." : mode === "signup" ? "Sign up" : "Log in"}
              </Button>
            </form>
            <Button
              className="mt-3 w-full"
              variant="ghost"
              onClick={() => {
                registerMutation.reset();
                loginMutation.reset();
                setMode((value) => (value === "signup" ? "login" : "signup"));
              }}
            >
              {mode === "signup" ? "Already have an account? Log in" : "New here? Create an account"}
            </Button>
          </section>
        </div>
      </Card>
    </main>
  );
}

function initials(user: UserProfile) {
  const source = user.fullName ?? user.email;
  return source
    .split(/\s|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function firstName(user: UserProfile) {
  return (user.fullName ?? user.email).split(/\s|@/)[0] ?? "runner";
}

export default App;
