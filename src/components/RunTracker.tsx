import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, Square } from "lucide-react";
import { formatDistance, formatTimer, haversineKm, paceFrom } from "../lib/geo";
import type { Coordinate, RouteOption, RunSummary } from "../types";
import { RouteMap } from "./RouteMap";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

type RunTrackerProps = {
  origin: Coordinate;
  route: RouteOption;
  onFinish: (summary: RunSummary) => void;
};

export function RunTracker({ origin, route, onFinish }: RunTrackerProps) {
  const [isRunning, setIsRunning] = useState(true);
  const [seconds, setSeconds] = useState(0);
  const [trail, setTrail] = useState<Coordinate[]>([origin]);
  const watchId = useRef<number | null>(null);

  useEffect(() => {
    if (!isRunning) {
      return;
    }

    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [isRunning]);

  useEffect(() => {
    if (!navigator.geolocation || !isRunning) {
      return;
    }

    watchId.current = navigator.geolocation.watchPosition(
      (position) => {
        setTrail((current) => [
          ...current,
          {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          }
        ]);
      },
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 12000 }
    );

    return () => {
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current);
      }
    };
  }, [isRunning]);

  const coveredKm = useMemo(() => {
    return trail.reduce((total, point, index) => {
      const previous = trail[index - 1];
      return previous ? total + haversineKm(previous, point) : total;
    }, 0);
  }, [trail]);

  function finishRun() {
    setIsRunning(false);
    onFinish({
      id: crypto.randomUUID(),
      routeName: route.name,
      distanceKm: coveredKm > 0.05 ? coveredKm : route.distanceKm,
      targetDistanceKm: route.targetDistanceKm,
      durationSeconds: seconds,
      pace: paceFrom(coveredKm > 0.05 ? coveredKm : route.distanceKm, seconds),
      completedAt: new Date().toISOString()
    });
  }

  return (
    <section className="grid min-h-screen gap-4 bg-background p-4 text-foreground lg:grid-cols-[1.5fr_360px]">
      <div className="overflow-hidden rounded-lg border border-border bg-[#dfe9da] shadow-soft">
        <RouteMap origin={origin} route={route} trail={trail} />
      </div>
      <Card className="self-stretch">
        <CardHeader>
          <p className="text-xs font-medium uppercase tracking-[0.28em] text-muted-foreground">Live run</p>
          <CardTitle>{route.name}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-3">
            <TrackerMetric label="Time" value={formatTimer(seconds)} />
            <TrackerMetric label="Distance" value={formatDistance(coveredKm)} />
            <TrackerMetric label="Pace" value={paceFrom(coveredKm, seconds)} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setIsRunning((value) => !value)}>
              {isRunning ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {isRunning ? "Pause" : "Resume"}
            </Button>
            <Button onClick={finishRun}>
              <Square className="h-4 w-4" />
              Finish
            </Button>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function TrackerMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <span className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">{label}</span>
      <strong className="mt-2 block text-2xl leading-none">{value}</strong>
    </div>
  );
}
