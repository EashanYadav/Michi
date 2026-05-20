import type { Coordinate } from "../types";

export const DEMO_LOCATION: Coordinate = {
  lat: 12.9763,
  lng: 77.5929
};

export function haversineKm(a: Coordinate, b: Coordinate): number {
  const earthRadiusKm = 6371;
  const deltaLat = toRadians(b.lat - a.lat);
  const deltaLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const sinLat = Math.sin(deltaLat / 2);
  const sinLng = Math.sin(deltaLng / 2);
  const value = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;

  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

export function formatDistance(km: number): string {
  return `${km.toFixed(km < 10 ? 2 : 1)} km`;
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${Math.round(minutes)} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainder = Math.round(minutes % 60);
  return `${hours}h ${remainder}m`;
}

export function formatTimer(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [minutes, seconds].map((part) => String(part).padStart(2, "0"));

  return hours > 0 ? `${hours}:${parts.join(":")}` : parts.join(":");
}

export function paceFrom(distanceKm: number, durationSeconds: number): string {
  if (distanceKm <= 0 || durationSeconds <= 0) {
    return "--";
  }

  const paceSeconds = durationSeconds / distanceKm;
  const minutes = Math.floor(paceSeconds / 60);
  const seconds = Math.round(paceSeconds % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")} /km`;
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}
