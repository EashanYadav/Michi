import { useEffect, useMemo, useRef, useState } from "react";
import { formatDistance, formatTimer, haversineKm, paceFrom } from "../lib/geo";
import type { Coordinate, RouteOption, RunSummary } from "../types";
import { RouteMap } from "./RouteMap";

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
    <section className="tracker-grid">
      <div className="map-panel">
        <RouteMap origin={origin} route={route} trail={trail} />
      </div>
      <aside className="panel tracker-panel">
        <span className="eyebrow">Live run</span>
        <h2>{route.name}</h2>
        <div className="metric-stack">
          <div>
            <span>Time</span>
            <strong>{formatTimer(seconds)}</strong>
          </div>
          <div>
            <span>Distance</span>
            <strong>{formatDistance(coveredKm)}</strong>
          </div>
          <div>
            <span>Pace</span>
            <strong>{paceFrom(coveredKm, seconds)}</strong>
          </div>
        </div>
        <div className="control-row">
          <button className="secondary-button" onClick={() => setIsRunning((value) => !value)}>
            {isRunning ? "Pause" : "Resume"}
          </button>
          <button className="primary-button" onClick={finishRun}>
            Finish
          </button>
        </div>
      </aside>
    </section>
  );
}
