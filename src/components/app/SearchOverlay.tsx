import { useMutation, useQuery } from "convex/react";
import { useEffect, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router";
import {
  Hash,
  Loader2,
  MessagesSquare,
  Search,
  UserPlus,
  Users,
} from "@/components/icons";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { UserAvatar } from "@/components/app/UserAvatar";
import { StyledDisplayName } from "@/components/app/StyledDisplayName";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

type Section = "people" | "messages" | "communities";

const SECTIONS: { id: Section; label: string }[] = [
  { id: "people", label: "People" },
  { id: "messages", label: "Messages" },
  { id: "communities", label: "Communities" },
];

/**
 * Global search (⌘K): people, messages and public communities, scoped to what
 * this account can actually reach.
 */
export function SearchOverlay({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const [section, setSection] = useState<Section>("people");
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();

  const sendRequest = useMutation(api.social.sendRequest);
  const joinServer = useMutation(api.servers.join);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => setDebounced(term.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [term, open]);

  const query = debounced.length === 0 ? "skip" : debounced;
  const people = useQuery(
    api.users.searchUsers,
    query === "skip" ? "skip" : { term: query },
  );
  const messages = useQuery(
    api.users.searchMessages,
    query === "skip" ? "skip" : { term: query },
  );
  const communities = useQuery(
    api.servers.discover,
    query === "skip" ? "skip" : { term: query },
  );

  const close = () => onOpenChange(false);

  const openProfile = (userId: string) => {
    const next = new URLSearchParams(params);
    next.set("user", userId);
    setParams(next, { replace: false });
    close();
  };

  const openMessage = (hit: {
    containerType: string;
    containerId: string;
    serverId: string | null;
  }) => {
    if (hit.containerType === "channel") {
      if (!hit.serverId) return;
      navigate(`/dashboard/s/${hit.serverId}/c/${hit.containerId}`);
    } else {
      navigate(`/dashboard/dm/${hit.containerId}`);
    }
    close();
  };

  const addFriend = async (userId: string, username: string | null) => {
    try {
      await sendRequest(
        username ? { username } : { userId: userId as Id<"users"> },
      );
      toast.success("Friend request sent.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not send request.",
      );
    }
  };

  const searching = debounced.length > 0;
  const loading = searching && (people === undefined || messages === undefined);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[18%] flex max-h-[70vh] translate-y-0 flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="sr-only">
          <DialogTitle>Search Kyro</DialogTitle>
          <DialogDescription>
            Search people, messages and communities you have access to.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <Input
            autoFocus
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Search people, messages, communities…"
            className="h-8 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
            aria-label="Search Kyro"
          />
          {loading && (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          )}
        </div>

        <div className="flex gap-1 border-b border-border/60 px-3 py-2">
          {SECTIONS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setSection(entry.id)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                section === entry.id
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-surface hover:text-foreground",
              )}
            >
              {entry.label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {!searching && (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              Start typing to search across Kyro.
            </p>
          )}

          {searching && section === "people" && (
            <Results loading={people === undefined} empty="No people matched.">
              {people?.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-surface"
                >
                  <button
                    type="button"
                    onClick={() => openProfile(user.id)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <UserAvatar user={user} size="md" />
                    <span className="min-w-0">
                      <StyledDisplayName
                        user={user}
                        className="block truncate text-sm"
                      />
                      <span className="block truncate text-xs text-muted-foreground">
                        {user.username
                          ? `@${user.username}`
                          : "no username yet"}
                      </span>
                    </span>
                  </button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void addFriend(user.id, user.username)}
                  >
                    <UserPlus className="mr-1.5 size-4" /> Add
                  </Button>
                </div>
              ))}
            </Results>
          )}

          {searching && section === "messages" && (
            <Results
              loading={messages === undefined}
              empty="No messages matched."
            >
              {messages?.map((hit) => (
                <button
                  key={hit.message.id}
                  type="button"
                  onClick={() =>
                    openMessage({
                      containerType: hit.message.containerType,
                      containerId: hit.message.containerId,
                      serverId: hit.serverId,
                    })
                  }
                  className="flex w-full items-start gap-3 rounded-md px-3 py-2 text-left hover:bg-surface"
                >
                  <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-surface text-muted-foreground">
                    {hit.message.containerType === "channel" ? (
                      <Hash className="size-3.5" />
                    ) : (
                      <MessagesSquare className="size-3.5" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span className="truncate text-sm font-semibold">
                        {hit.message.author?.name ?? "Unknown"}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {hit.containerName ?? "conversation"} ·{" "}
                        {formatRelative(hit.message.createdAt)}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-sm text-muted-foreground">
                      {hit.message.content}
                    </span>
                  </span>
                </button>
              ))}
            </Results>
          )}

          {searching && section === "communities" && (
            <Results
              loading={communities === undefined}
              empty="No public communities matched."
            >
              {communities?.map((server) => (
                <div
                  key={server.id}
                  className="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-surface"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                    <Users className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                      {server.name}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {server.memberCount} members
                      {server.description ? ` · ${server.description}` : ""}
                    </span>
                  </span>
                  <Button
                    size="sm"
                    onClick={() => {
                      void joinServer({ serverId: server.id as Id<"servers"> })
                        .then(() => {
                          navigate(`/dashboard/s/${server.id}`);
                          close();
                        })
                        .catch((error) =>
                          toast.error(
                            error instanceof Error
                              ? error.message
                              : "Could not join community.",
                          ),
                        );
                    }}
                  >
                    Join
                  </Button>
                </div>
              ))}
            </Results>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Results({
  loading,
  empty,
  children,
}: {
  loading: boolean;
  empty: string;
  children?: ReactNode;
}) {
  const items = Array.isArray(children)
    ? children.filter(Boolean)
    : children
      ? [children]
      : [];
  if (loading) {
    return (
      <p className="px-3 py-6 text-sm text-muted-foreground">Searching…</p>
    );
  }
  if (items.length === 0) {
    return <p className="px-3 py-6 text-sm text-muted-foreground">{empty}</p>;
  }
  return <div className="space-y-0.5">{items}</div>;
}
