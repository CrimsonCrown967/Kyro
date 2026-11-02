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

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(term), 250);
    return () => window.clearTimeout(timer);
  }, [term]);

  const results = useQuery(api.servers.discover, { term: debounced });

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-6 py-8">
        <header className="mb-6">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
            <Compass className="size-4" /> Discover
          </p>
          <h1 className="mt-2 text-2xl font-bold">Find your people</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Public servers on Kyro. Search by name, topic or tag.
          </p>
          <div className="relative mt-4 max-w-md">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="Search servers…"
              className="pl-9"
              aria-label="Search servers"
            />
          </div>
        </header>

        {results === undefined ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : results.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <Compass className="size-8 text-muted-foreground" />
            <p className="text-sm font-medium">
              {debounced
                ? `Nothing matches “${debounced}”.`
                : "No public servers yet."}
            </p>
            <p className="max-w-sm text-sm text-muted-foreground">
              {debounced
                ? "Try another name, topic or tag."
                : "Be the first — make one of your communities discoverable in Server Settings."}
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {results.map((server) => (
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
    <article className="group flex flex-col overflow-hidden rounded-xl border border-border/70 bg-panel transition-colors hover:border-border">
      <div className="relative h-20 bg-gradient-to-br from-brand/70 to-cyan/70">
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
        <h2 className="truncate text-sm font-semibold">{server.name}</h2>
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
