"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import { LngLatBounds, MapLibreMap, NavigationControl, Popup, type GeoJSONSource, type MapMouseEvent } from "maplibre-gl";
import type { DiagnosisPin, FieldDTO, LngLat } from "@/types/farm";
import { closeRing } from "@/lib/geo";
import DrawToolbar from "./DrawToolbar";
import { mapStyle, pinFeatures, PIN_COLOR, fieldFeatures } from "./map-style";

export interface FieldMapProps {
  center: LngLat | null;
  fields: FieldDTO[];
  pins: DiagnosisPin[];
  selectedFieldId: string | null;
  onSelectField: (fieldId: string) => void;
  drawing: boolean;
  onDrawComplete: (ring: LngLat[]) => void;
  onDrawCancel: () => void;
  className?: string;
}

const SNAP_PX = 14;

type Handlers = Pick<FieldMapProps, "onSelectField" | "onDrawComplete" | "onDrawCancel"> & { drawing: boolean };

export default function FieldMap(props: FieldMapProps) {
  const { center, fields, pins, selectedFieldId, drawing, className } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const handlersRef = useRef<Handlers>(props);
  const verticesRef = useRef<LngLat[]>([]);
  const initialCenter = useRef(center);
  const [ready, setReady] = useState(false);
  const [vertices, setVertices] = useState<LngLat[]>([]);

  useEffect(() => {
    handlersRef.current = props;
    verticesRef.current = vertices;
  });

  function finish(ring: LngLat[]) {
    if (ring.length < 3) return;
    setVertices([]);
    handlersRef.current.onDrawComplete(ring);
  }

  function cancel() {
    setVertices([]);
    handlersRef.current.onDrawCancel();
  }

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const start = initialCenter.current;
    const map = new MapLibreMap({
      container,
      style: mapStyle(),
      center: start ?? [78.9, 21.5],
      zoom: start ? 15 : 3.5,
      maxZoom: 19,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");

    map.on("load", () => {
      map.addSource("fields", { type: "geojson", data: fieldFeatures([], null) });
      map.addSource("pins", { type: "geojson", data: pinFeatures([]) });
      map.addSource("draft", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({ id: "field-fill", type: "fill", source: "fields", paint: { "fill-color": ["case", ["get", "selected"], "#fbbf24", "#4ade80"], "fill-opacity": ["case", ["get", "selected"], 0.32, 0.18] } });
      map.addLayer({ id: "field-line", type: "line", source: "fields", paint: { "line-color": ["case", ["get", "selected"], "#fbbf24", "#86efac"], "line-width": ["case", ["get", "selected"], 3, 2] } });
      map.addLayer({ id: "draft-line", type: "line", source: "draft", filter: ["==", ["geometry-type"], "LineString"], paint: { "line-color": "#38bdf8", "line-width": 2.5, "line-dasharray": [2, 1.5] } });
      map.addLayer({ id: "draft-pts", type: "circle", source: "draft", filter: ["==", ["geometry-type"], "Point"], paint: { "circle-radius": 5, "circle-color": "#0b0f0c", "circle-stroke-color": "#38bdf8", "circle-stroke-width": 2.5 } });
      map.addLayer({ id: "pins-halo", type: "circle", source: "pins", paint: { "circle-radius": 13, "circle-color": PIN_COLOR, "circle-opacity": 0.25 } });
      map.addLayer({ id: "pins", type: "circle", source: "pins", paint: { "circle-radius": 6.5, "circle-color": PIN_COLOR, "circle-stroke-color": "#0b0f0c", "circle-stroke-width": 2 } });
      setReady(true);
    });

    map.on("click", (event: MapMouseEvent) => {
      const h = handlersRef.current;
      if (h.drawing) {
        const ring = verticesRef.current;
        if (ring.length >= 3) {
          const first = map.project(ring[0]);
          if (first.dist(event.point) <= SNAP_PX) return finish(ring);
        }
        setVertices([...ring, [event.lngLat.lng, event.lngLat.lat]]);
        return;
      }
      const pin = map.queryRenderedFeatures(event.point, { layers: ["pins"] })[0];
      if (pin && pin.geometry.type === "Point") {
        const box = document.createElement("div");
        box.className = "text-xs";
        const title = document.createElement("strong");
        title.textContent = String(pin.properties.condition || pin.properties.crop || "");
        const meta = document.createElement("div");
        meta.textContent = `${pin.properties.severity} · ${new Date(String(pin.properties.createdAt)).toLocaleDateString()}`;
        box.append(title, meta);
        new Popup({ closeButton: false, offset: 10 })
          .setLngLat(pin.geometry.coordinates as LngLat)
          .setDOMContent(box)
          .addTo(map);
        return;
      }
      const field = map.queryRenderedFeatures(event.point, { layers: ["field-fill"] })[0];
      if (field?.properties.id) h.onSelectField(String(field.properties.id));
    });

    map.on("dblclick", (event: MapMouseEvent) => {
      if (!handlersRef.current.drawing) return;
      event.preventDefault();
      finish(verticesRef.current);
    });

    const enter = () => !handlersRef.current.drawing && (map.getCanvas().style.cursor = "pointer");
    const leave = () => !handlersRef.current.drawing && (map.getCanvas().style.cursor = "");
    for (const layer of ["pins", "field-fill"]) {
      map.on("mouseenter", layer, enter);
      map.on("mouseleave", layer, leave);
    }

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.getCanvas().style.cursor = drawing ? "crosshair" : "";
    if (drawing) map.doubleClickZoom.disable();
    else map.doubleClickZoom.enable();
  }, [drawing, ready]);

  useEffect(() => {
    if (!ready) return;
    mapRef.current?.getSource<GeoJSONSource>("fields")?.setData(fieldFeatures(fields, selectedFieldId));
  }, [ready, fields, selectedFieldId]);

  useEffect(() => {
    if (!ready) return;
    mapRef.current?.getSource<GeoJSONSource>("pins")?.setData(pinFeatures(pins));
  }, [ready, pins]);

  useEffect(() => {
    if (!ready) return;
    const line = vertices.length >= 2 ? [{ type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: vertices.length >= 3 ? closeRing(vertices) : vertices } }] : [];
    const points = vertices.map((coordinates) => ({ type: "Feature" as const, properties: {}, geometry: { type: "Point" as const, coordinates } }));
    mapRef.current?.getSource<GeoJSONSource>("draft")?.setData({ type: "FeatureCollection", features: [...line, ...points] });
  }, [ready, vertices]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const coords = fields.flatMap((f) => f.boundary?.coordinates[0] ?? []);
    if (coords.length) {
      const bounds = coords.reduce((b, c) => b.extend(c), new LngLatBounds(coords[0], coords[0]));
      map.fitBounds(bounds, { padding: 60, maxZoom: 17, duration: 0 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fit only once when the map becomes ready
  }, [ready]);

  return (
    <div className={className} style={{ position: "relative" }}>
      <div ref={containerRef} className="absolute inset-0" />
      {drawing && (
        <DrawToolbar
          vertices={vertices}
          onUndo={() => setVertices((v) => v.slice(0, -1))}
          onFinish={() => finish(vertices)}
          onCancel={cancel}
        />
      )}
    </div>
  );
}
