import type { CurrentWeather, DailyPoint, HourlyPoint, WeatherReport } from "@/types/farm";
import { blightRisk, isLeafWet, sprayWindows } from "@/lib/weather-rules";

const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const REVALIDATE_SECONDS = 30 * 60;

type Series = Array<number | null>;

interface OpenMeteoResponse {
  timezone: string;
  utc_offset_seconds: number;
  current: {
    time: string;
    temperature_2m: number;
    relative_humidity_2m: number;
    apparent_temperature: number;
    precipitation: number;
    weather_code: number;
    wind_speed_10m: number;
  };
  hourly: {
    time: string[];
    temperature_2m: Series;
    relative_humidity_2m: Series;
    precipitation: Series;
    precipitation_probability: Series;
    wind_speed_10m: Series;
  };
  daily: {
    time: string[];
    weather_code: Series;
    temperature_2m_max: Series;
    temperature_2m_min: Series;
    precipitation_sum: Series;
    precipitation_probability_max: Series;
    wind_speed_10m_max: Series;
  };
}

const num = (value: number | null | undefined, fallback = 0) => (typeof value === "number" ? value : fallback);

export function forecastUrl(lat: number, lon: number): string {
  const params = new URLSearchParams({
    latitude: lat.toFixed(3),
    longitude: lon.toFixed(3),
    current: "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m",
    hourly: "temperature_2m,relative_humidity_2m,precipitation,precipitation_probability,wind_speed_10m",
    daily:
      "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max",
    timezone: "auto",
    forecast_days: "7",
    wind_speed_unit: "kmh",
  });
  return `${FORECAST_URL}?${params}`;
}

/** Open-Meteo returns local wall-clock times; convert with the reported UTC offset. */
const localToTs = (time: string, offsetSeconds: number) => Date.parse(`${time}:00Z`) - offsetSeconds * 1000;

export function parseHourly(data: OpenMeteoResponse): HourlyPoint[] {
  const h = data.hourly;
  return h.time.map((time, i) => ({
    time,
    ts: localToTs(time, data.utc_offset_seconds),
    temp: num(h.temperature_2m[i]),
    rh: num(h.relative_humidity_2m[i]),
    precip: num(h.precipitation[i]),
    wind: num(h.wind_speed_10m[i]),
    precipProb: h.precipitation_probability[i] ?? null,
  }));
}

function parseDaily(data: OpenMeteoResponse, hourly: HourlyPoint[]): DailyPoint[] {
  const d = data.daily;
  return d.time.map((date, i) => ({
    date,
    code: num(d.weather_code[i]),
    tMax: num(d.temperature_2m_max[i]),
    tMin: num(d.temperature_2m_min[i]),
    precipSum: num(d.precipitation_sum[i]),
    precipProb: d.precipitation_probability_max[i] ?? null,
    windMax: num(d.wind_speed_10m_max[i]),
    wetHours: hourly.filter((p) => p.time.startsWith(date) && isLeafWet(p)).length,
  }));
}

function parseCurrent(data: OpenMeteoResponse): CurrentWeather {
  const c = data.current;
  return {
    time: c.time,
    temp: c.temperature_2m,
    apparent: c.apparent_temperature,
    rh: c.relative_humidity_2m,
    precip: c.precipitation,
    wind: c.wind_speed_10m,
    code: c.weather_code,
  };
}

export async function getWeather(lat: number, lon: number, now: number = Date.now()): Promise<WeatherReport> {
  const res = await fetch(forecastUrl(lat, lon), {
    next: { revalidate: REVALIDATE_SECONDS },
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
  const data = (await res.json()) as OpenMeteoResponse;
  const hourly = parseHourly(data);
  return {
    location: { lat, lon },
    timezone: data.timezone,
    current: parseCurrent(data),
    daily: parseDaily(data, hourly),
    risk: blightRisk(hourly),
    windows: sprayWindows(hourly, { now }),
    fetchedAt: new Date(now).toISOString(),
  };
}

export type WeatherGroup = "clear" | "partly" | "cloudy" | "fog" | "drizzle" | "rain" | "snow" | "storm";

/** WMO weather interpretation codes → coarse groups for icons and labels. */
export function weatherGroup(code: number): WeatherGroup {
  if (code === 0) return "clear";
  if (code <= 2) return "partly";
  if (code === 3) return "cloudy";
  if (code === 45 || code === 48) return "fog";
  if (code >= 51 && code <= 57) return "drizzle";
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if (code >= 95) return "storm";
  return "cloudy";
}

export function weatherSummary(report: WeatherReport): string {
  const { current, daily, risk, windows } = report;
  const lines = [
    `Now: ${Math.round(current.temp)}°C, humidity ${Math.round(current.rh)}%, wind ${Math.round(current.wind)} km/h, ${weatherGroup(current.code)}.`,
    `Next 7 days: ${daily
      .map((d) => `${d.date.slice(5)} ${Math.round(d.tMin)}–${Math.round(d.tMax)}°C rain ${d.precipSum.toFixed(1)}mm`)
      .join("; ")}.`,
    `Late-blight risk (Hutton criteria): ${risk.level}${risk.periodStart ? ` from ${risk.periodStart}` : ""}.`,
  ];
  const next = windows[0];
  lines.push(next ? `Next spray window: ${next.start} for ${next.hours}h.` : "No suitable spray window in the forecast.");
  return lines.join("\n");
}
