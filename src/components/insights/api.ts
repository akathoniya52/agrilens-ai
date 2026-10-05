import type { MarketResult, NdviResult, OutbreakResponse, SensorSnapshot, YieldEstimate, CaseDTO, CaseStatus } from "@/types/insights";

export class InsightsError extends Error {
  constructor(readonly status: number, message: string) {
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
    throw new InsightsError(res.status, body?.error ?? `${url} → ${res.status}`);
  }
  return (await res.json()) as T;
}

const qs = (params: Record<string, string | number | null | undefined>) =>
  new URLSearchParams(
    Object.entries(params).flatMap(([k, v]) => (v === null || v === undefined || v === "" ? [] : [[k, String(v)]]))
  ).toString();

export const insightsApi = {
  ndvi: (fieldId: string) => request<NdviResult>(`/api/fields/${fieldId}/ndvi`),
  ndviImageUrl: (fieldId: string) => `/api/fields/${fieldId}/ndvi?format=png`,
  yield: (fieldId: string, ndvi?: number | null) => request<YieldEstimate>(`/api/fields/${fieldId}/yield?${qs({ ndvi })}`),
  sensors: (fieldId: string) => request<SensorSnapshot>(`/api/iot/${fieldId}/readings`),
  createDeviceToken: (fieldId: string) =>
    request<{ token: string; endpoint: string }>(`/api/fields/${fieldId}/iot-token`, { method: "POST" }),
  revokeDeviceToken: (fieldId: string) => request<{ success: true }>(`/api/fields/${fieldId}/iot-token`, { method: "DELETE" }),
  market: (commodity: string, state?: string | null) => request<MarketResult>(`/api/market?${qs({ commodity, state })}`),
  outbreaks: (params: { lat?: number; lon?: number; radiusKm?: number; days?: number } = {}) =>
    request<OutbreakResponse>(`/api/outbreaks?${qs(params)}`),
};

export const casesApi = {
  list: (scope: "mine" | "all" = "mine") => request<{ expert: boolean; cases: CaseDTO[] }>(`/api/cases?${qs({ scope })}`),
  create: (messageId: string, note?: string) =>
    request<CaseDTO>("/api/cases", { method: "POST", body: JSON.stringify({ messageId, ...(note && { note }) }) }),
  update: (caseId: string, patch: { status?: CaseStatus; note?: string; assignToMe?: boolean }) =>
    request<CaseDTO>(`/api/cases/${caseId}`, { method: "PATCH", body: JSON.stringify(patch) }),
};
