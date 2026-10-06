import { signInUrl } from "@/lib/callback-url";

/** Sign-in page URL that brings the user back to the page they are on now. */
export function signInUrlForCurrentPage(): string {
  return signInUrl(window.location.pathname + window.location.search);
}
