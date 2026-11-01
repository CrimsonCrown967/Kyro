import { useAction } from "convex/react";
import { useEffect, useState } from "react";
import { Loader2, Search } from "@/components/icons";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";

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
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GifResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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
  }, [query, searchGifs]);

  return (
    <div className="w-[min(25rem,calc(100vw-2rem))]">
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
      <div className="mt-2 max-h-[22rem] overflow-y-auto overscroll-contain">
        {loading && results.length === 0 ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <p className="px-4 py-12 text-center text-sm text-muted-foreground">
            {error}
          </p>
        ) : results.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-muted-foreground">
            No GIFs found.
          </p>
        ) : (
          <div className="columns-2 gap-2">
            {results.map((gif) => (
              <button
                key={gif.id}
                type="button"
                title={gif.title}
                onClick={() => onSelect(gif)}
                className="mb-2 block w-full break-inside-avoid overflow-hidden rounded-lg bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <img
                  src={gif.previewUrl}
                  alt={gif.title}
                  loading="lazy"
                  className="h-auto w-full object-cover transition-transform hover:scale-[1.02]"
                />
              </button>
            ))}
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
