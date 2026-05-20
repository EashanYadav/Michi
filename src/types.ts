export type Coordinate = {
  lat: number;
  lng: number;
};

export type RunType = "Easy" | "Recovery" | "Tempo" | "Long Run";

export type RouteOption = {
  id: string;
  name: string;
  distanceKm: number;
  durationMinutes: number;
  score: number;
  geometry: Coordinate[];
  targetDistanceKm: 2 | 5 | 10;
  runType: RunType;
  notes: string[];
};

export type RunSummary = {
  id: string;
  routeName: string;
  distanceKm: number;
  targetDistanceKm: number;
  durationSeconds: number;
  pace: string;
  completedAt: string;
};

export type LocationState =
  | { status: "idle"; coordinate: null; message: string }
  | { status: "loading"; coordinate: null; message: string }
  | { status: "ready"; coordinate: Coordinate; message: string; isDemo: boolean }
  | { status: "error"; coordinate: null; message: string };
