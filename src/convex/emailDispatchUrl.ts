/** Send credentials directly to the canonical host, never through a redirect. */
export function emailDispatchUrl(value: string): URL {
  const url = new URL(value.trim());
  if (
    !["https://kyro-chat.cyou", "https://www.kyro-chat.cyou"].includes(
      url.origin,
    ) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/api/email/dispatch"
  )
    throw new Error("INVALID_DISPATCH_URL");
  url.hostname = "www.kyro-chat.cyou";
  return url;
}
