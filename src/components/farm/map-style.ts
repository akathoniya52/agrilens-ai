import type { ExpressionSpecification, StyleSpecification } from "maplibre-gl";
import type { DiagnosisPin, FieldDTO, LngLat } from "@/types/farm";

const ESRI_IMAGERY = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const ESRI_ATTRIBUTION =
  'Imagery © <a href="https://www.esri.com/" target="_blank" rel="noopener">Esri</a>, Maxar, Earthstar Geographics, and the GIS User Community';

export function mapStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {
      satellite: { type: "raster", tiles: [ESRI_IMAGERY], tileSize: 256, maxzoom: 19, attribution: ESRI_ATTRIBUTION },
    },
    layers: [{ id: "satellite", type: "raster", source: "satellite" }],
  };
}

/** Severity colours tuned for contrast on satellite imagery (both themes). */
export const PIN_COLOR: ExpressionSpecification = [
  "match",
  ["get", "severity"],
  "none", "#4ade80",
  "low", "#a3e635",
  "moderate", "#fbbf24",
  "high", "#fb923c",
  "critical", "#f87171",
  "#e5e7eb",
];

export function fieldFeatures(fields: FieldDTO[], selectedId: string | null): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: fields
      .filter((f) => f.boundary)
      .map((f) => ({
        type: "Feature",
        properties: { id: f._id, name: f.name, selected: f._id === selectedId },
        geometry: { type: "Polygon", coordinates: f.boundary?.coordinates ?? [] },
      })),
  };
}

const JITTER_DEG = 0.00012;

/** Diagnoses often share the farm point; spread identical coordinates on a small spiral so each pin is clickable. */
export function pinFeatures(pins: DiagnosisPin[]): GeoJSON.FeatureCollection {
  const seen = new Map<string, number>();
  return {
    type: "FeatureCollection",
    features: pins
      .filter((p) => p.location)
      .map((p) => {
        const [lon, lat] = p.location?.coordinates ?? [0, 0];
        const key = `${lon.toFixed(6)},${lat.toFixed(6)}`;
        const n = seen.get(key) ?? 0;
        seen.set(key, n + 1);
        const angle = n * 2.4;
        const r = n === 0 ? 0 : JITTER_DEG * Math.sqrt(n);
        const coordinates: LngLat = [lon + r * Math.cos(angle), lat + r * Math.sin(angle)];
        return {
          type: "Feature",
          properties: { id: p._id, condition: p.condition, crop: p.crop, severity: p.severity, createdAt: p.createdAt },
          geometry: { type: "Point", coordinates },
        };
      }),
  };
}
