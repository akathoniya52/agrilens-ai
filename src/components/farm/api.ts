import type { FarmDTO, FarmDetail, FieldDTO, GeoPoint, GeoPolygon, ReminderDTO, ReminderKind, WeatherReport } from "@/types/farm";

export interface FarmInput {
  name: string;
  location?: GeoPoint | null;
  crops?: string[];
  areaHa?: number | null;
  soilType?: FarmDTO["soilType"];
  irrigation?: FarmDTO["irrigation"];
}

export interface FieldInput {
  name: string;
  crop?: string;
  sowingDate?: string | null;
  boundary?: GeoPolygon | null;
  areaHa?: number | null;
}

export interface ReminderInput {
  title: string;
  dueAt: string;
  kind?: ReminderKind;
  farmId?: string | null;
  fieldId?: string | null;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    cache: "no-store",
    ...init,
    headers: init?.body ? { "Content-Type": "application/json", ...init.headers } : init?.headers,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(res.status, body?.error ?? `${url} → ${res.status}`);
  }
  return (await res.json()) as T;
}

const send = <T>(method: string, url: string, body?: unknown) =>
  request<T>(url, { method, ...(body !== undefined && { body: JSON.stringify(body) }) });

export const farmsApi = {
  list: () => request<{ farms: FarmDTO[]; activeFarmId: string | null }>("/api/farms"),
  create: (input: FarmInput) => send<FarmDTO>("POST", "/api/farms", input),
  get: (farmId: string) => request<FarmDetail>(`/api/farms/${farmId}`),
  update: (farmId: string, input: Partial<FarmInput>) => send<FarmDTO>("PATCH", `/api/farms/${farmId}`, input),
  remove: (farmId: string) => send<{ success: true }>("DELETE", `/api/farms/${farmId}`),
  setActive: (farmId: string | null) => send<{ activeFarmId: string | null }>("PATCH", "/api/me", { activeFarmId: farmId }),
  weather: (farmId: string) => request<WeatherReport>(`/api/weather?farmId=${farmId}`),
};

export const fieldsApi = {
  create: (farmId: string, input: FieldInput) => send<FieldDTO>("POST", `/api/farms/${farmId}/fields`, input),
  update: (fieldId: string, input: Partial<FieldInput>) => send<FieldDTO>("PATCH", `/api/fields/${fieldId}`, input),
  remove: (fieldId: string) => send<{ success: true }>("DELETE", `/api/fields/${fieldId}`),
};

export const remindersApi = {
  list: (query: { farmId?: string; fieldId?: string; status?: "open" | "done" | "all" } = {}) => {
    const params = new URLSearchParams(Object.entries(query).filter((e): e is [string, string] => !!e[1]));
    return request<ReminderDTO[]>(`/api/reminders?${params}`);
  },
  create: (input: ReminderInput) => send<ReminderDTO>("POST", "/api/reminders", input),
  createMany: (inputs: ReminderInput[]) => send<ReminderDTO[]>("POST", "/api/reminders", inputs),
  update: (id: string, patch: { done?: boolean; title?: string; dueAt?: string }) =>
    send<ReminderDTO>("PATCH", `/api/reminders/${id}`, patch),
  remove: (id: string) => send<{ success: true }>("DELETE", `/api/reminders/${id}`),
};
