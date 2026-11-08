import { useAction, useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, Star } from "@/components/icons";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export interface GifResult {
  id: string;
  slug: string;
  title: string;
  url: string;
  previewUrl: string;
  width: number;
  height: number;
}

export function GifPicker({
  onSelect,
}: {
  onSelect: (gif: GifResult) => void;
}) {
  const searchGifs = useAction(api.gifs.search);
  const favorites = useQuery(api.gifs.favorites);
  const toggleFavorite = useMutation(api.gifs.toggleFavorite);
  const [tab, setTab] = useState<"discover" | "favorites">("discover");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GifResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (tab !== "discover") return;
    let active = true;
    const timer = window.setTimeout(
      () => {
        setLoading(true);
        setError(null);
        void searchGifs({ query: query.trim() || undefined, limit: 24 })
          .then((next) => {
            if (active) setResults(next);
          })
          .catch((reason: unknown) => {
            if (!active) return;
            const message =
              reason instanceof Error ? reason.message : "GIF search failed.";
            setError(
              message.includes("Could not find public function")
                ? "GIF search will be available after the Kyro backend update."
                : message,
            );
            setResults([]);
          })
          .finally(() => active && setLoading(false));
      },
      query ? 300 : 0,
    );
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [query, searchGifs, tab]);

  const favoriteIds = useMemo(
    () => new Set((favorites ?? []).map((gif) => gif.id)),
    [favorites],
  );
  const visible = tab === "favorites" ? (favorites ?? []) : results;
  const waiting =
    tab === "favorites"
      ? favorites === undefined
      : loading && results.length === 0;

  const toggle = async (gif: GifResult) => {
    if (busyId) return;
    setBusyId(gif.id);
    try {
      const result = await toggleFavorite({
        gifId: gif.id,
        slug: gif.slug,
        title: gif.title,
        url: gif.url,
        previewUrl: gif.previewUrl,
        width: gif.width,
        height: gif.height,
      });
      toast.success(
        result.favorite ? "GIF added to favorites." : "GIF removed.",
      );
    } catch (reason) {
      toast.error(
        reason instanceof Error ? reason.message : "Could not save GIF.",
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="w-[min(25rem,calc(100vw-2rem))]">
      <div className="mb-2 flex rounded-lg bg-surface p-1">
        {(["discover", "favorites"] as const).map((entry) => (
          <button
            key={entry}
            type="button"
            onClick={() => setTab(entry)}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 text-xs font-semibold capitalize",
              tab === entry
                ? "bg-panel text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {entry}
            {entry === "favorites" && favorites?.length
              ? ` (${favorites.length})`
              : ""}
          </button>
        ))}
      </div>

      {tab === "discover" ? (
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search GIFs"
            className="pl-8"
            aria-label="Search KLIPY GIFs"
          />
        </div>
      ) : null}

      <div className="mt-2 max-h-[22rem] overflow-y-auto overscroll-contain">
        {waiting ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : error && tab === "discover" ? (
          <p className="px-4 py-12 text-center text-sm text-muted-foreground">
            {error}
          </p>
        ) : visible.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-muted-foreground">
            {tab === "favorites"
              ? "Favorite GIFs with the star and they will stay here."
              : "No GIFs found."}
          </p>
        ) : (
          <div className="columns-2 gap-2">
            {visible.map((gif) => {
              const favorite = favoriteIds.has(gif.id);
              return (
                <div
                  key={gif.id}
                  className="group relative mb-2 break-inside-avoid overflow-hidden rounded-lg bg-surface"
                >
                  <button
                    type="button"
                    title={gif.title}
                    onClick={() => onSelect(gif)}
                    className="block w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <img
                      src={gif.previewUrl}
                      alt={gif.title}
                      loading="lazy"
                      className="h-auto w-full object-cover transition-transform group-hover:scale-[1.02]"
                    />
                  </button>
                  <button
                    type="button"
                    title={favorite ? "Remove favorite" : "Add favorite"}
                    aria-label={favorite ? "Remove favorite" : "Add favorite"}
                    disabled={busyId === gif.id}
                    onClick={() => void toggle(gif)}
                    className={cn(
                      "absolute right-1.5 top-1.5 flex size-8 items-center justify-center rounded-full bg-black/65 text-white shadow transition hover:bg-black/85",
                      favorite
                        ? "opacity-100"
                        : "opacity-0 group-hover:opacity-100",
                    )}
                  >
                    <Star
                      className={cn(
                        "size-4",
                        favorite && "fill-current text-warning",
                      )}
                    />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <a
        href="https://klipy.com"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 block text-right text-[10px] font-semibold tracking-wide text-muted-foreground hover:text-foreground"
      >
        POWERED BY KLIPY
      </a>
    </div>
  );
}
