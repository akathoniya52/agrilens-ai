/** Where sign-in sends the user when no (valid) callback is given. */
export const DEFAULT_CALLBACK_URL = "/chat";

/**
 * Returns `value` only when it is a same-origin relative path ("/farms?x=1"), otherwise the default.
 * Rejects absolute and protocol-relative URLs ("//evil.com", "/\\evil.com") and control characters,
 * so a crafted `?callbackUrl=` can never become an open redirect.
 */
export function safeCallbackUrl(value: string | null | undefined): string {
  if (!value || value.length > 2048) return DEFAULT_CALLBACK_URL;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return DEFAULT_CALLBACK_URL;
  if (/[\u0000-\u001f\u007f\\]/.test(value)) return DEFAULT_CALLBACK_URL;
  try {
    const url = new URL(value, "https://agrilens.invalid");
    if (url.origin !== "https://agrilens.invalid") return DEFAULT_CALLBACK_URL;
    // Dot-segments can normalize back into a protocol-relative path: "/.//evil.com" → "//evil.com".
    if (url.pathname.startsWith("//") || url.pathname.includes("\\")) return DEFAULT_CALLBACK_URL;
    if (url.pathname.startsWith("/auth/signin")) return DEFAULT_CALLBACK_URL;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return DEFAULT_CALLBACK_URL;
  }
}

/** Sign-in page URL that returns to `path` (current pathname + search) afterwards. */
export function signInUrl(path?: string | null): string {
  const callback = safeCallbackUrl(path);
  return callback === DEFAULT_CALLBACK_URL
    ? "/auth/signin"
    : `/auth/signin?callbackUrl=${encodeURIComponent(callback)}`;
}
