const BLOB_HOST_SUFFIX = ".public.blob.vercel-storage.com";

/**
 * Client-side version of the host rule in the server's `isTrustedImageUrl`: only https images from
 * our Vercel Blob storage are rendered inline. Anything else in an AI answer is shown as a link, so a
 * prompt-injected image can't make the browser call (and leak data to) another host.
 */
export function isOwnStorageImageUrl(
  url: string | null | undefined,
  storeHost: string | undefined = process.env.NEXT_PUBLIC_BLOB_HOST
): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    const hostOk = storeHost
      ? parsed.hostname === storeHost
      : process.env.NODE_ENV !== "production" &&
        parsed.hostname.length > BLOB_HOST_SUFFIX.length &&
        parsed.hostname.endsWith(BLOB_HOST_SUFFIX);
    return (
      parsed.protocol === "https:" &&
      !parsed.username &&
      !parsed.password &&
      !parsed.port &&
      !parsed.search &&
      parsed.pathname.startsWith("/uploads/") &&
      hostOk
    );
  } catch {
    return false;
  }
}

/** Only http(s) and mailto links are clickable; everything else (javascript:, data:, …) is dropped. */
export function safeLinkHref(href: string | null | undefined): string | undefined {
  if (!href) return undefined;
  try {
    const { protocol } = new URL(href);
    return protocol === "https:" || protocol === "http:" || protocol === "mailto:" ? href : undefined;
  } catch {
    return undefined;
  }
}
