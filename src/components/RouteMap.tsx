import L from "leaflet";
import { useEffect } from "react";
import { MapContainer, Marker, Polyline, TileLayer, useMap } from "react-leaflet";
import type { Coordinate } from "../types";

type MapRoute = {
  geometry: Coordinate[];
};

type RouteMapProps = {
  origin: Coordinate;
  route: MapRoute | null;
  trail?: Coordinate[];
};

const startIcon = L.divIcon({
  className: "map-pin start",
  html: "<span></span>",
  iconSize: [22, 22],
  iconAnchor: [11, 11]
});

const liveIcon = L.divIcon({
  className: "map-pin live",
  html: "<span></span>",
  iconSize: [18, 18],
  iconAnchor: [9, 9]
});

export function RouteMap({ origin, route, trail = [] }: RouteMapProps) {
  const routePositions = route?.geometry.map(toLatLng) ?? [];
  const trailPositions = trail.map(toLatLng);
  const lastTrailPoint = trail.at(-1);

  return (
    <MapContainer className="route-map" center={toLatLng(origin)} zoom={15} scrollWheelZoom>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitRoute origin={origin} positions={routePositions.length ? routePositions : trailPositions} />
      <Marker position={toLatLng(origin)} icon={startIcon} />
      {routePositions.length > 0 && <Polyline positions={routePositions} pathOptions={{ color: "#146b4f", weight: 6 }} />}
      {trailPositions.length > 1 && <Polyline positions={trailPositions} pathOptions={{ color: "#ef7b45", weight: 4 }} />}
      {lastTrailPoint && <Marker position={toLatLng(lastTrailPoint)} icon={liveIcon} />}
    </MapContainer>
  );
}

function FitRoute({ origin, positions }: { origin: Coordinate; positions: [number, number][] }) {
  const map = useMap();

  useEffect(() => {
    if (positions.length > 1) {
      map.fitBounds(L.latLngBounds(positions), { padding: [42, 42], maxZoom: 16 });
    } else {
      map.setView(toLatLng(origin), 15);
    }
  }, [map, origin.lat, origin.lng, positions]);

  return null;
}

function toLatLng(point: Coordinate): [number, number] {
  return [point.lat, point.lng];
}
