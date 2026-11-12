export const KYRO_ORIGIN = "https://www.kyro-chat.cyou";
export const KYRO_HOME = `${KYRO_ORIGIN}/dashboard`;
// Vercel redirects the apex domain to www. Keep both exact first-party
// origins trusted so old links and future canonical redirects still work.
const KYRO_ORIGINS = new Set([KYRO_ORIGIN, "https://kyro-chat.cyou"]);

export function isKyroUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return KYRO_ORIGINS.has(url.origin) && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function externalUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (
      !["https:", "http:", "mailto:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}

export function canRequestPermission(
  origin: string,
  mainFrame: boolean,
  permission: string,
): boolean {
  return (
    mainFrame &&
    isKyroUrl(origin) &&
    [
      "media",
      "display-capture",
      "notifications",
      "fullscreen",
      "clipboard-sanitized-write",
    ].includes(permission)
  );
}
