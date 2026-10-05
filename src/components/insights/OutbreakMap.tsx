"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import { MapLibreMap, NavigationControl, Popup, type GeoJSONSource, type MapMouseEvent } from "maplibre-gl";
import { mapStyle, PIN_COLOR } from "@/components/farm/map-style";
import type { LngLat } from "@/types/farm";
import type { OutbreakCell } from "@/types/insights";

export interface OutbreakMapProps {
  center: LngLat | null;
  radiusKm: number;
  cells: OutbreakCell[];
  className?: string;
}

function cellFeatures(cells: OutbreakCell[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: cells.map((c, i) => {
      const angle = i * 2.4;
      const r = cells.findIndex((o) => o.center[0] === c.center[0] && o.center[1] === c.center[1]) === i ? 0 : 0.012;
      return {
        type: "Feature",
        properties: { condition: c.condition, crop: c.crop, users: c.users, cases: c.cases, severity: c.severity, latest: c.latest },
        geometry: { type: "Point", coordinates: [c.center[0] + r * Math.cos(angle), c.center[1] + r * Math.sin(angle)] },
      };
    }),
  };
}

function zoomFor(radiusKm: number) {
  return Math.max(5, Math.min(11, 9.6 - Math.log2(radiusKm / 25)));
}

export default function OutbreakMap({ center, radiusKm, cells, className }: OutbreakMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const initial = useRef({ center, radiusKm });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const start = initial.current;
    const map = new MapLibreMap({
      container,
      style: mapStyle(),
      center: start.center ?? [78.9, 21.5],
      zoom: start.center ? zoomFor(start.radiusKm) : 3.5,
      maxZoom: 13,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");

    map.on("load", () => {
      map.addSource("cells", { type: "geojson", data: cellFeatures([]) });
      map.addSource("home", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "cells-heat",
        type: "circle",
        source: "cells",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["get", "users"], 5, 22, 30, 48],
          "circle-color": PIN_COLOR,
          "circle-opacity": 0.28,
          "circle-blur": 0.6,
        },
      });
      map.addLayer({
        id: "cells",
        type: "circle",
        source: "cells",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["get", "users"], 5, 8, 30, 16],
          "circle-color": PIN_COLOR,
          "circle-stroke-color": "#0b0f0c",
          "circle-stroke-width": 2,
        },
      });
      map.addLayer({
        id: "home",
        type: "circle",
        source: "home",
        paint: { "circle-radius": 6, "circle-color": "#38bdf8", "circle-stroke-color": "#ffffff", "circle-stroke-width": 2 },
      });
      setReady(true);
    });

    map.on("click", "cells", (event: MapMouseEvent & { features?: GeoJSON.Feature[] }) => {
      const feature = event.features?.[0];
      if (!feature || feature.geometry.type !== "Point" || !feature.properties) return;
      const p = feature.properties;
      const box = document.createElement("div");
      box.className = "text-xs";
      const title = document.createElement("strong");
      title.textContent = String(p.condition);
      const meta = document.createElement("div");
      meta.textContent = `${p.crop ? `${p.crop} · ` : ""}${p.users} farms · ${p.cases} reports · ${p.severity} · week of ${p.latest}`;
      box.append(title, meta);
      new Popup({ closeButton: false, offset: 12 }).setLngLat(feature.geometry.coordinates as LngLat).setDOMContent(box).addTo(map);
    });
    map.on("mouseenter", "cells", () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", "cells", () => (map.getCanvas().style.cursor = ""));

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    mapRef.current?.getSource<GeoJSONSource>("cells")?.setData(cellFeatures(cells));
  }, [ready, cells]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    map.getSource<GeoJSONSource>("home")?.setData({
      type: "FeatureCollection",
      features: center ? [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: center } }] : [],
    });
    if (center) map.easeTo({ center, zoom: zoomFor(radiusKm), duration: 600 });
  }, [ready, center, radiusKm]);

  return <div ref={containerRef} className={className} style={{ position: "relative" }} />;
}
