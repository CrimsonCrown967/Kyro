/** Keep the application and developer documentation on the same deployment. */
const DEFAULT_CONVEX_URL = "https://giant-cricket-958.convex.cloud";
const configured = import.meta.env.VITE_CONVEX_URL as string | undefined;
const local = Boolean(import.meta.env.DEV && configured && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(configured));
export const CONVEX_URL = configured && (/^https:\/\/[a-z0-9-]+\.convex\.cloud$/.test(configured) || local) ? configured : DEFAULT_CONVEX_URL;
const site = local
  ? import.meta.env.VITE_CONVEX_SITE_URL || CONVEX_URL.replace(/:(\d+)$/, (_, port: string) => `:${Number(port) + 1}`)
  : CONVEX_URL.replace(/\.convex\.cloud$/, ".convex.site");
export const BOT_API_BASE = (import.meta.env.VITE_BOT_API_URL || `${site}/bot-api/v1`) as string;
