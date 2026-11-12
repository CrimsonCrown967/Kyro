import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { Compass, Loader2, Search, Users } from "@/components/icons";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Discovery = {
  id: string;
  name: string;
  description: string | null;
  iconUrl: string | null;
  bannerUrl: string | null;
  tags: string[];
  memberCount: number;
  onlineCount: number;
  createdAt: number;
  isJoined: boolean;
  applyToJoin: boolean;
};

/**
 * `/dashboard/discover` — the public server browser. Search runs against the
 * backend (name, description and tags); joining is a real mutation.
 */
export function DiscoverView() {
  const navigate = useNavigate();
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const [tag, setTag] = useState("");
  const [sort, setSort] = useState("active");

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(term), 250);
    return () => window.clearTimeout(timer);
  }, [term]);

  const results = useQuery(api.servers.discover, { term: debounced });
  const tags = [...new Set((results ?? []).flatMap((server) => server.tags))]
    .sort()
    .slice(0, 8);
  const visible = (results ?? [])
    .filter((server) => !tag || server.tags.includes(tag))
    .sort((a, b) =>
      sort === "newest"
        ? b.createdAt - a.createdAt
        : b.onlineCount - a.onlineCount || b.memberCount - a.memberCount,
    );

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl p-4 sm:p-7">
        <header className="discovery-welcome relative mb-7 overflow-hidden rounded-3xl border border-primary/15 px-6 py-9 sm:px-9 sm:py-12">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
            <Compass className="size-4" /> Discover
          </p>
          <h1 className="mt-4 max-w-md text-3xl font-bold tracking-tight sm:text-4xl">
            A place for every
            <br />
            <span className="text-primary">side of you.</span>
          </h1>
          <p className="mt-3 max-w-sm text-sm leading-6 text-muted-foreground">
            Find people who share your interests. A new conversation is closer
            than you think.
          </p>
          <div className="relative mt-4 max-w-md">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="Search servers…"
              className="h-12 rounded-xl border-border bg-background/80 pl-10"
              aria-label="Search servers"
            />
          </div>
          <Compass
            aria-hidden="true"
            className="pointer-events-none absolute -right-10 top-9 hidden size-64 rotate-12 text-primary/10 lg:block"
          />
        </header>
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div
            className="flex max-w-full gap-2 overflow-x-auto pb-1"
            role="group"
            aria-label="Community interests"
          >
            {["", ...tags].map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={tag === value}
                onClick={() => setTag(value)}
                className={`shrink-0 rounded-full border px-3 py-2 text-xs transition-colors ${tag === value ? "border-primary/30 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-surface"}`}
              >
                {value || "All communities"}
              </button>
            ))}
          </div>
          <select
            aria-label="Sort communities"
            value={sort}
            onChange={(event) => setSort(event.target.value)}
            className="rounded-xl border border-border bg-panel px-3 py-2 text-xs"
          >
            <option value="active">Most active</option>
            <option value="newest">Newest first</option>
          </select>
        </div>

        {results === undefined ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <Compass className="size-8 text-muted-foreground" />
            <p className="text-sm font-medium">
              {tag
                ? `No matching communities tagged “${tag}”.`
                : debounced
                  ? `Nothing matches “${debounced}”.`
                  : "No public servers yet."}
            </p>
            {(tag || term) && (
              <Button
                variant="outline"
                className="mt-3"
                onClick={() => {
                  setTag("");
                  setTerm("");
                }}
              >
                Clear filters
              </Button>
            )}
            <p className="max-w-sm text-sm text-muted-foreground">
              {debounced
                ? "Try another name, topic or tag."
                : "Be the first — make one of your communities discoverable in Server Settings."}
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((server) => (
              <ServerCard
                key={server.id}
                server={server}
                onOpen={(id) => navigate(`/dashboard/s/${id}`)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ServerCard({
  server,
  onOpen,
}: {
  server: Discovery;
  onOpen: (serverId: string) => void;
}) {
  const join = useMutation(api.servers.join);
  const [busy, setBusy] = useState(false);

  const joinNow = async () => {
    if (busy) return;
    // Reviewed communities open their application form instead of joining
    // immediately; the route renders the form behind MembershipGate.
    if (server.applyToJoin) {
      onOpen(server.id);
      return;
    }
    setBusy(true);
    try {
      await join({ serverId: server.id as Id<"servers"> });
      toast.success(`Welcome to ${server.name}!`);
      onOpen(server.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not join.");
      setBusy(false);
    }
  };

  const est = new Date(server.createdAt).toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
  });

  return (
    <article
      aria-label={server.name}
      className="group flex flex-col overflow-hidden rounded-2xl border border-border/70 bg-panel transition-all hover:-translate-y-1 hover:border-primary/30 hover:shadow-xl hover:shadow-black/5"
    >
      <div className="relative h-32 bg-gradient-to-br from-brand/40 via-brand/15 to-cyan/30">
        {server.bannerUrl && (
          <img
            src={server.bannerUrl}
            alt=""
            className="size-full object-cover"
          />
        )}
        <div className="absolute -bottom-5 left-4 flex size-12 items-center justify-center overflow-hidden rounded-xl border-2 border-panel bg-gradient-to-br from-brand to-cyan text-xs font-bold text-white shadow-md">
          {server.iconUrl ? (
            <img
              src={server.iconUrl}
              alt=""
              className="size-full object-cover"
            />
          ) : (
            server.name.slice(0, 2).toUpperCase()
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col px-4 pt-8 pb-3">
        <h2 className="truncate text-base font-semibold">{server.name}</h2>
        <p className="mt-1 line-clamp-2 min-h-10 text-xs leading-5 text-muted-foreground">
          {server.description || "No description yet."}
        </p>

        {server.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {server.tags.slice(0, 4).map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-border/70 bg-surface px-2 py-0.5 text-[11px] text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/60 pt-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-2.5">
            <span className="flex items-center gap-1">
              <span className="size-1.5 rounded-full bg-success" />
              {server.onlineCount} online
            </span>
            <span className="flex items-center gap-1">
              <Users className="size-3.5" />
              {server.memberCount} members
            </span>
          </span>
          <span>Est. {est}</span>
        </div>

        {server.isJoined ? (
          <Button
            size="sm"
            variant="outline"
            className="mt-3 w-full"
            onClick={() => onOpen(server.id)}
          >
            Open
          </Button>
        ) : (
          <Button
            size="sm"
            className="mt-3 w-full"
            onClick={() => void joinNow()}
            disabled={busy}
          >
            {busy && <Loader2 className="mr-1.5 size-4 animate-spin" />}
            {server.applyToJoin ? "Apply to join" : "Join server"}
          </Button>
        )}
      </div>
    </article>
  );
}
