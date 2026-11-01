import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { action } from "./_generated/server";

const KLIPY_BASE = "https://api.klipy.com/api/v1";

type KlipyAsset = {
  url?: string;
  width?: number;
  height?: number;
};

type KlipyItem = {
  id?: string | number;
  slug?: string;
  title?: string;
  file?: Record<string, Record<string, KlipyAsset>>;
};

function apiKey() {
  const value = process.env.KLIPY_API_KEY?.trim();
  if (!value) throw new Error("KLIPY GIF search is not configured yet.");
  return value;
}

function asset(item: KlipyItem, size: "sm" | "md", format: "gif" | "webp") {
  return item.file?.[size]?.[format];
}

/** Server-side KLIPY proxy: the API key never reaches a browser bundle. */
export const search = action({
  args: {
    query: v.optional(v.string()),
    locale: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { query, locale, limit }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in to search GIFs.");
    const key = apiKey();
    const cleanQuery = query?.trim().slice(0, 100) ?? "";
    const endpoint = cleanQuery ? "search" : "trending";
    const params = new URLSearchParams({
      page: "1",
      per_page: String(Math.max(8, Math.min(Math.floor(limit ?? 24), 36))),
      customer_id: userId,
      locale: (locale ?? "us").slice(0, 5),
      content_filter: "medium",
      format_filter: "gif,webp",
    });
    if (cleanQuery) params.set("q", cleanQuery);
    const response = await fetch(
      `${KLIPY_BASE}/${encodeURIComponent(key)}/gifs/${endpoint}?${params}`,
      { headers: { Accept: "application/json" } },
    );
    if (!response.ok) {
      throw new Error(`KLIPY search failed (${response.status}).`);
    }
    const payload = (await response.json()) as {
      result?: boolean;
      data?: { data?: KlipyItem[] };
    };
    return (payload.data?.data ?? []).flatMap((item) => {
      const full = asset(item, "md", "gif") ?? asset(item, "sm", "gif");
      const preview =
        asset(item, "sm", "webp") ?? asset(item, "sm", "gif") ?? full;
      if (!full?.url || !preview?.url || !item.slug) return [];
      return [
        {
          id: String(item.id ?? item.slug),
          slug: item.slug,
          title: item.title?.trim() || "KLIPY GIF",
          url: full.url,
          previewUrl: preview.url,
          width: full.width ?? preview.width ?? 220,
          height: full.height ?? preview.height ?? 220,
        },
      ];
    });
  },
});

/** KLIPY asks integrations to register a share after the user picks a GIF. */
export const registerShare = action({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return;
    const key = apiKey();
    const safeSlug = slug.trim().slice(0, 160);
    if (!safeSlug) return;
    await fetch(
      `${KLIPY_BASE}/${encodeURIComponent(key)}/gifs/share/${encodeURIComponent(
        safeSlug,
      )}?customer_id=${encodeURIComponent(userId)}`,
      { method: "POST", headers: { Accept: "application/json" } },
    ).catch(() => undefined);
  },
});
