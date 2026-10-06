import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const signOut = vi.fn(async () => undefined);
vi.mock("next-auth/react", () => ({ signOut }));

const { signOutCleanly } = await import("@/lib/client/sign-out");
const { syncTimeZone } = await import("@/lib/client/time-zone-sync");

function stubPush(subscription: { endpoint: string; unsubscribe: () => Promise<boolean> } | null) {
  vi.stubGlobal("window", { PushManager: class {} });
  vi.stubGlobal("navigator", {
    serviceWorker: {
      getRegistration: async () => ({ pushManager: { getSubscription: async () => subscription } }),
    },
  });
}

beforeEach(() => {
  signOut.mockClear();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("signOutCleanly", () => {
  it("deletes the push subscription on the server, unsubscribes, then signs out", async () => {
    const unsubscribe = vi.fn(async () => true);
    stubPush({ endpoint: "https://push.example/abc", unsubscribe });
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await signOutCleanly();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/push/subscribe",
      expect.objectContaining({ method: "DELETE", body: JSON.stringify({ endpoint: "https://push.example/abc" }) })
    );
    expect(unsubscribe).toHaveBeenCalled();
    expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/" });
  });

  it("still signs out when the server call and unsubscribe both fail", async () => {
    stubPush({ endpoint: "https://push.example/abc", unsubscribe: async () => Promise.reject(new Error("boom")) });
    vi.stubGlobal("fetch", async () => Promise.reject(new TypeError("offline")));

    await signOutCleanly();

    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("signs out on browsers without push support", async () => {
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("window", {});
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await signOutCleanly();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});

describe("syncTimeZone", () => {
  const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    });
  });

  it("saves the browser zone once per session when it differs", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await syncTimeZone({ _id: "u1", timeZone: null });
    await syncTimeZone({ _id: "u1", timeZone: null });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/me",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ timeZone: browserZone }) })
    );
  });

  it("does nothing when the stored zone already matches", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await syncTimeZone({ _id: "u2", timeZone: browserZone });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("logs instead of throwing when the save fails", async () => {
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 500 }));

    await expect(syncTimeZone({ _id: "u3" })).resolves.toBeUndefined();
    expect(console.warn).toHaveBeenCalled();
  });
});
