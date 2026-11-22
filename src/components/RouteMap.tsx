import "mapbox-gl/dist/mapbox-gl.css";
import * as mapboxgl from "mapbox-gl/esm";
import { useEffect, useRef, useState } from "react";
import type { LineString } from "@/lib/route-geometry";

const PRIMARY = "#ecc813"; // amarillo del tema (--primary)
const SURFACE = "#1e1f27"; // fondo del tema (--background aprox.)

export type MapPoint = { lng: number; lat: number; label?: string };
export type Corridor = {
  from: MapPoint;
  to: MapPoint;
  geometry?: LineString | null;
  via?: MapPoint[];
  label?: string;
  onClick?: () => void;
};
export type RouteMapProps = {
  corridors: Corridor[];
  markers?: (MapPoint & { color?: string })[];
  onPick?: ((p: { lng: number; lat: number }) => void) | undefined;
  className?: string;
};

function straight(from: MapPoint, to: MapPoint): LineString {
  return {
    type: "LineString",
    coordinates: [
      [from.lng, from.lat],
      [to.lng, to.lat],
    ],
  };
}

function dot(kind: "from" | "to" | "via" | "extra", color?: string): HTMLDivElement {
  const el = document.createElement("div");
  const base = `border-radius:50%;box-sizing:border-box;border:2px solid ${PRIMARY};cursor:pointer;`;
  el.style.cssText =
    kind === "from"
      ? `${base}width:14px;height:14px;background:${PRIMARY};`
      : kind === "to"
        ? `${base}width:14px;height:14px;background:${SURFACE};`
        : kind === "via"
          ? `${base}width:9px;height:9px;background:${PRIMARY};opacity:.85;cursor:default;`
          : `${base}width:12px;height:12px;background:${color ?? "#4aa3df"};border-color:#f4f4ec;`;
  return el;
}

export default function RouteMap({ corridors, markers, onPick, className }: RouteMapProps) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const fittedRef = useRef(false);
  const [ready, setReady] = useState(false);
  // Los callers crean los arrays inline: sincronizar solo cuando cambian los
  // datos serializables; los onClick se leen del ref siempre fresco.
  const corridorsRef = useRef(corridors);
  corridorsRef.current = corridors;
  const markersRef2 = useRef(markers);
  markersRef2.current = markers;
  const corridorsKey = JSON.stringify(
    corridors.map((c) => [c.from, c.to, c.geometry, c.via, c.label]),
  );
  const markersKey = JSON.stringify(markers);

  // Un mapa = un "map load" facturable: se crea una sola vez y luego solo se
  // actualizan fuentes y marcadores.
  useEffect(() => {
    const el = boxRef.current;
    const token = import.meta.env["VITE_MAPBOX_TOKEN"] as string | undefined;
    if (!el || !token) return;
    const map = new mapboxgl.Map({
      accessToken: token,
      container: el,
      style: "mapbox://styles/mapbox/dark-v11",
      attributionControl: false,
      cooperativeGestures: true,
    });
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right");
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    if (onPick) {
      map.getCanvas().style.cursor = "crosshair";
      map.on("click", (e) => onPickRef.current?.({ lng: e.lngLat.lng, lat: e.lngLat.lat }));
    }
    map.on("load", () => setReady(true));
    mapRef.current = map;
    return () => {
      mapRef.current = null;
      setReady(false);
      map.remove();
    };
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- deps son las claves serializadas
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const corridors = corridorsRef.current;
    const markers = markersRef2.current;
    const features = corridors.map((c) => ({
      type: "Feature" as const,
      properties: { est: c.geometry ? 0 : 1 },
      geometry: c.geometry ?? straight(c.from, c.to),
    }));
    const collection = { type: "FeatureCollection" as const, features };
    const src = map.getSource<mapboxgl.GeoJSONSource>("routes");
    if (src) {
      src.setData(collection);
    } else {
      map.addSource("routes", { type: "geojson", data: collection });
      map.addLayer({
        id: "routes-solid",
        type: "line",
        source: "routes",
        filter: ["==", ["get", "est"], 0],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": PRIMARY, "line-width": 4, "line-opacity": 0.85 },
      });
      map.addLayer({
        id: "routes-est",
        type: "line",
        source: "routes",
        filter: ["==", ["get", "est"], 1],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": PRIMARY,
          "line-width": 3,
          "line-opacity": 0.5,
          "line-dasharray": [2, 1.6],
        },
      });
    }
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    const addMarker = (
      p: MapPoint,
      kind: "from" | "to" | "via" | "extra",
      color?: string,
      onClick?: () => void,
    ) => {
      const el = dot(kind, color);
      if (p.label) el.title = p.label;
      if (onClick) el.addEventListener("click", onClick);
      markersRef.current.push(
        new mapboxgl.Marker({ element: el }).setLngLat([p.lng, p.lat]).addTo(map),
      );
    };
    for (const c of corridors) {
      addMarker(c.from, "from", undefined, c.onClick);
      addMarker(c.to, "to", undefined, c.onClick);
      c.via?.forEach((p) => addMarker(p, "via"));
    }
    markers?.forEach((p) => addMarker(p, "extra", p.color));

    const bounds = new mapboxgl.LngLatBounds();
    let any = false;
    for (const f of features)
      for (const c of f.geometry.coordinates) {
        bounds.extend(c as [number, number]);
        any = true;
      }
    markers?.forEach((p) => {
      bounds.extend([p.lng, p.lat]);
      any = true;
    });
    // En modo "escoger en el mapa" solo se encuadra una vez: re-encuadrar al
    // marcar un punto le cambiaría el zoom al usuario en cada clic.
    if (fittedRef.current && onPickRef.current) return;
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    if (any && sw.lng === ne.lng && sw.lat === ne.lat)
      // Un solo punto (ej. picker abriendo sobre un lugar elegido): centrar cerca.
      map.jumpTo({ center: [sw.lng, sw.lat], zoom: 11 });
    else if (any) map.fitBounds(bounds, { padding: 48, maxZoom: 8, duration: 0 });
    // Sin corredores ni puntos (modo "escoger en el mapa"): encuadrar Venezuela.
    else
      map.fitBounds(
        [
          [-73.5, 0.6],
          [-59.8, 12.4],
        ],
        { duration: 0 },
      );
    fittedRef.current = true;
  }, [ready, corridorsKey, markersKey]);

  return <div ref={boxRef} className={className} />;
}
