import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { action, mutation, query } from "./_generated/server";
import { requireUser } from "./lib";

const KLIPY_BASE = "https://api.klipy.com/api/v1";
const MAX_GIF_FAVORITES = 100;

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

const gifArgs = {
  gifId: v.string(),
  slug: v.string(),
  title: v.string(),
  url: v.string(),
  previewUrl: v.string(),
  width: v.number(),
  height: v.number(),
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

/** Account-synced favourite GIFs, newest first. */
export const favorites = query({
  args: {},
  handler: async (ctx) => {
    const { id } = await requireUser(ctx);
    const rows = await ctx.db
      .query("gifFavorites")
      .withIndex("by_user", (q) => q.eq("userId", id))
      .order("desc")
      .take(100);
    return rows.map((row) => ({
      id: row.gifId,
      slug: row.slug,
      title: row.title,
      url: row.url,
      previewUrl: row.previewUrl,
      width: row.width,
      height: row.height,
    }));
  },
});

/** Adds or removes one KLIPY result from the signed-in user's favourites. */
export const toggleFavorite = mutation({
  args: gifArgs,
  handler: async (ctx, args) => {
    const { id } = await requireUser(ctx);
    const gifId = args.gifId.trim().slice(0, 160);
    if (!gifId) throw new Error("That GIF is missing an identifier.");
    const existing = await ctx.db
      .query("gifFavorites")
      .withIndex("by_user_gif", (q) => q.eq("userId", id).eq("gifId", gifId))
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
      return { favorite: false };
    }
    const url = args.url.trim().slice(0, 1000);
    const previewUrl = args.previewUrl.trim().slice(0, 1000);
    if (!/^https:\/\//i.test(url) || !/^https:\/\//i.test(previewUrl)) {
      throw new Error("GIF URLs must use HTTPS.");
    }
    if (!Number.isFinite(args.width) || !Number.isFinite(args.height)) {
      throw new Error("That GIF has invalid dimensions.");
    }
    const favorites = await ctx.db
      .query("gifFavorites")
      .withIndex("by_user", (q) => q.eq("userId", id))
      .take(MAX_GIF_FAVORITES);
    if (favorites.length >= MAX_GIF_FAVORITES) {
      throw new Error(`You can favorite up to ${MAX_GIF_FAVORITES} GIFs.`);
    }
    await ctx.db.insert("gifFavorites", {
      userId: id,
      gifId,
      slug: args.slug.trim().slice(0, 160),
      title: args.title.trim().slice(0, 200) || "Favourite GIF",
      url,
      previewUrl,
      width: Math.max(1, Math.min(Math.floor(args.width), 4000)),
      height: Math.max(1, Math.min(Math.floor(args.height), 4000)),
      createdAt: Date.now(),
    });
    return { favorite: true };
  },
});
