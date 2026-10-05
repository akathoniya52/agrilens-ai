/**
 * Fire a short vibration on devices that support it (most Android phones).
 * Silently does nothing elsewhere, e.g. iOS Safari and desktop browsers.
 */
export function haptic(pattern: number | number[] = 12): boolean {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return false;
  try {
    return navigator.vibrate(pattern);
  } catch {
    return false;
  }
}
