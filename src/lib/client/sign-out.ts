import { signOut } from "next-auth/react";

/** Longest the push cleanup may delay sign-out. */
const CLEANUP_TIMEOUT_MS = 3000;

async function currentPushSubscription(): Promise<PushSubscription | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator) || typeof window === "undefined" || !("PushManager" in window)) {
    return null;
  }
  const registration = await navigator.serviceWorker.getRegistration();
  return registration ? registration.pushManager.getSubscription() : null;
}

/** Detaches this device's push subscription from the account so the next user doesn't get its notifications. */
async function removePushSubscription(): Promise<void> {
  const sub = await currentPushSubscription();
  if (!sub) return;
  try {
    const res = await fetch("/api/push/subscribe", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: sub.endpoint }),
      signal: AbortSignal.timeout(CLEANUP_TIMEOUT_MS),
    });
    if (!res.ok) console.warn(`[sign-out] DELETE /api/push/subscribe → ${res.status}`);
  } catch (error) {
    console.warn("[sign-out] could not remove push subscription on the server", error instanceof Error ? error.name : error);
  }
  // Unsubscribing invalidates the endpoint, so even a failed server delete stops further pushes.
  await sub.unsubscribe();
}

/**
 * Signs out after detaching this device's push subscription. Cleanup is best effort and time-boxed:
 * sign-out always happens, even when the cleanup fails or hangs.
 */
export async function signOutCleanly(callbackUrl = "/"): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      removePushSubscription(),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, CLEANUP_TIMEOUT_MS + 500);
      }),
    ]);
  } catch (error) {
    console.warn("[sign-out] push cleanup failed", error instanceof Error ? error.name : error);
  } finally {
    clearTimeout(timer);
  }
  await signOut({ callbackUrl });
}
