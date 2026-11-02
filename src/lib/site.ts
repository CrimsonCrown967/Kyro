/**
 * Shareable links (server invites, join links) must always point at Kyro's
 * canonical domain — kyro-chat.cyou — even when the app is being previewed on
 * a staging hostname like kyro.freebuff.app. Localhost and custom preview
 * hosts keep their own origin so links still work while developing.
 */
const CANONICAL_HOST = "kyro-chat.cyou";

export function siteOrigin(): string {
  if (typeof window === "undefined") return `https://${CANONICAL_HOST}`;
  const { hostname, origin } = window.location;
  if (
    hostname === CANONICAL_HOST ||
    hostname === "localhost" ||
    hostname === "127.0.0.1"
  ) {
    return origin;
  }
  // Old/staging Kyro hostnames — rewrite to the real domain.
  if (hostname.includes("freebuff") || hostname.includes("kyro")) {
    return `https://${CANONICAL_HOST}`;
  }
  return origin;
}

/** The full invite link for a community invite or vanity code. */
export function inviteUrl(code: string): string {
  return `${siteOrigin()}/invite/${code}`;
}
