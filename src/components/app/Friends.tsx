import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import {
  Ban,
  Check,
  Clock,
  ArrowRight,
  Compass,
  Ellipsis,
  Sparkles,
  MessageCircle,
  Search,
  UserCheck,
  UserPlus,
  Users,
  X,
} from "@/components/icons";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { UserAvatar } from "@/components/app/UserAvatar";
import { StyledDisplayName } from "@/components/app/StyledDisplayName";
import { KyroMark } from "@/components/KyroMark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  PRESENCE_META,
  formatRelative,
  type PresenceState,
} from "@/lib/format";
import { cn } from "@/lib/utils";

type Tab = "online" | "all" | "pending" | "blocked" | "suggested" | "add";

const TABS: { id: Tab; label: string }[] = [
  { id: "online", label: "Online" },
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "blocked", label: "Blocked" },
  { id: "suggested", label: "Suggested" },
  { id: "add", label: "Add friend" },
];

const TAB_IDS: Tab[] = [
  "online",
  "all",
  "pending",
  "blocked",
  "suggested",
  "add",
];

type PublicUser = {
  id: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
  presence: PresenceState;
  customStatus: string | null;
  official?: boolean;
  badges?: string[];
  primaryBadge?: string | null;
  displayNameFont?: string | null;
  displayNameColorMode?: "none" | "solid" | "gradient" | null;
  displayNameColor?: string | null;
  displayNameColor2?: string | null;
};

/** The `/dashboard` home: friends, requests and discover-by-username. */
export function FriendsView() {
  const social = useQuery(api.social.list);
  const me = useQuery(api.users.me);
  const [params, setParams] = useSearchParams();
  // The sidebar's "Find people" deep-links to /dashboard?tab=add, so the tab
  // also lives in the URL. The URL wins over any locally selected tab, which
  // keeps deep-links working without a state-syncing effect.
  const tabParam = params.get("tab");
  const [fallbackTab, setFallbackTab] = useState<Tab>("online");
  const [friendQuery, setFriendQuery] = useState("");
  const tab: Tab = TAB_IDS.includes(tabParam as Tab)
    ? (tabParam as Tab)
    : fallbackTab;
  const setTab = (next: Tab) => {
    setFallbackTab(next);
    const nextParams = new URLSearchParams(params);
    nextParams.set("tab", next);
    setParams(nextParams, { replace: true });
  };
  const pendingCount =
    (social?.incoming?.length ?? 0) + (social?.outgoing?.length ?? 0);

  const openProfile = (userId: string) => {
    const next = new URLSearchParams(params);
    next.set("previewUser", userId);
    setParams(next, { replace: false });
  };

  const friends = social?.friends ?? [];
  const online = friends.filter((user) =>
    ["online", "idle", "dnd"].includes(user.presence),
  );
  const listedFriends = tab === "online" ? online : friends;
  const visibleFriends = listedFriends.filter((user) => {
    const needle = friendQuery.trim().toLowerCase();
    if (!needle) return true;
    return (
      user.name.toLowerCase().includes(needle) ||
      (user.username ?? "").toLowerCase().includes(needle) ||
      (user.customStatus ?? "").toLowerCase().includes(needle)
    );
  });

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-border/70 px-5 sm:px-7">
        <span className="flex items-center gap-3 text-sm font-semibold">
          <span className="flex size-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Users className="size-4" />
          </span>{" "}
          Friends
        </span>
        <Button
          size="sm"
          onClick={() => setTab("add")}
          className="rounded-lg text-xs"
        >
          <UserPlus className="mr-1.5 size-3.5" /> Add friend
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[1500px] p-4 sm:p-7">
          <section className="friends-welcome relative mb-7 overflow-hidden rounded-2xl border border-primary/15 p-6 sm:px-8 sm:py-7">
            <div className="relative z-10 max-w-[75%]">
              <p className="mb-3 text-[10px] font-bold tracking-[.2em] text-primary">
                THIS IS YOUR CORNER
              </p>
              <h1 className="text-2xl font-bold tracking-tight sm:text-[30px]">
                Good to see you
                {me?.name ? `, ${me.name.split(" ")[0].slice(0, 24)}` : ""}
                <span className="text-primary">.</span>
              </h1>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground sm:text-sm">
                Catch up, find your people, and make yourself at home.
              </p>
              <button
                type="button"
                onClick={() => setTab("online")}
                className="mt-5 inline-flex items-center gap-2 rounded-full border border-success/20 bg-success/8 px-3 py-1.5 text-[11px] font-medium"
              >
                <span className="size-1.5 rounded-full bg-success" />
                {social === undefined
                  ? "Finding your friends…"
                  : `${online.length} friend${online.length === 1 ? "" : "s"} around right now`}
                <ArrowRight className="ml-1 size-3" />
              </button>
            </div>
            <div className="friends-orbit" aria-hidden="true">
              <div className="friends-orbit-core">
                <KyroMark className="size-12 sm:size-16" />
              </div>
              <span className="friends-orbit-spark">
                <Sparkles className="size-5" />
              </span>
              <span className="friends-orbit-message">
                <MessageCircle className="size-5" />
              </span>
            </div>
          </section>
          <div className="flex min-w-0 items-start gap-7">
            <section className="min-w-0 flex-1" aria-label="Your friends">
              <nav
                aria-label="Friend filters"
                className="mb-5 flex items-center gap-1 overflow-x-auto border-b border-border pb-3"
              >
                {TABS.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => setTab(entry.id)}
                    aria-pressed={tab === entry.id}
                    className={cn(
                      "relative whitespace-nowrap rounded-lg px-3 py-2 text-xs font-medium transition-colors",
                      tab === entry.id
                        ? entry.id === "add"
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "bg-primary/12 text-primary"
                        : "text-muted-foreground hover:bg-surface/70 hover:text-foreground",
                    )}
                  >
                    {entry.label}
                    {entry.id === "pending" && pendingCount > 0 && (
                      <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">
                        {pendingCount}
                      </span>
                    )}
                  </button>
                ))}
              </nav>

              {(tab === "online" || tab === "all") && (
                <div className="mb-5">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={friendQuery}
                      onChange={(event) => setFriendQuery(event.target.value)}
                      placeholder="Search friends"
                      className="h-10 rounded-xl border-border bg-panel/60 pl-10 text-xs"
                      aria-label="Search friends"
                    />
                  </div>
                  <p className="mt-6 text-[10px] font-semibold uppercase tracking-[.15em] text-muted-foreground">
                    {tab === "online" ? "Around right now" : "Your people"}{" "}
                    <span className="ml-1 text-foreground">
                      {social === undefined ? "" : visibleFriends.length}
                    </span>
                  </p>
                </div>
              )}

              <div aria-live="polite">
                {tab === "add" ? (
                  <AddFriendPanel />
                ) : social === undefined ? (
                  <p className="p-8 text-center text-sm text-muted-foreground">
                    Loading…
                  </p>
                ) : tab === "pending" ? (
                  <PendingList
                    incoming={social.incoming}
                    outgoing={social.outgoing}
                    onOpenProfile={openProfile}
                  />
                ) : tab === "blocked" ? (
                  <BlockedList
                    blocked={social.blocked}
                    onOpenProfile={openProfile}
                  />
                ) : tab === "suggested" ? (
                  <SuggestedPanel onOpenProfile={openProfile} />
                ) : (
                  <UserList
                    users={visibleFriends}
                    emptyHint={
                      friendQuery.trim()
                        ? "No friends match your search. Try a different name or username."
                        : tab === "online"
                          ? "None of your friends are online right now."
                          : "You haven't added anyone yet. Find people with “Add friend”."
                    }
                    emptyAction={() =>
                      friendQuery.trim()
                        ? setFriendQuery("")
                        : setTab(tab === "online" ? "all" : "add")
                    }
                    emptyActionLabel={
                      friendQuery.trim()
                        ? "Clear search"
                        : tab === "online"
                          ? "View all friends"
                          : "Find a friend"
                    }
                    onOpenProfile={openProfile}
                    showPresence
                  />
                )}
              </div>
            </section>
            <aside
              className="hidden w-60 shrink-0 space-y-5 xl:block"
              aria-label="Friend activity"
            >
              <div className="rounded-2xl border border-border bg-panel/50 p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-sm font-semibold">Your circle</h2>
                  <span className="size-1.5 rounded-full bg-primary" />
                </div>
                <div className="grid grid-cols-2 gap-3 border-b border-border pb-5">
                  <button
                    type="button"
                    onClick={() => setTab("all")}
                    className="rounded-lg p-2 text-left hover:bg-surface"
                  >
                    <span className="block text-2xl font-semibold tracking-tight">
                      {social === undefined ? "—" : friends.length}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      Friends
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab("pending")}
                    className="rounded-lg p-2 text-left hover:bg-surface"
                  >
                    <span className="block text-2xl font-semibold tracking-tight">
                      {social === undefined ? "—" : pendingCount}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      Requests
                    </span>
                  </button>
                </div>
                <p className="mb-3 mt-5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Around now
                </p>
                {online.length ? (
                  online.slice(0, 3).map((friend) => (
                    <button
                      key={friend.id}
                      type="button"
                      onClick={() => openProfile(friend.id)}
                      className="-mx-1 mb-1 flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left hover:bg-surface"
                    >
                      <UserAvatar user={friend} size="sm" />
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-medium">
                          {friend.name}
                        </span>
                        <span className="block truncate text-[10px] text-muted-foreground">
                          {friend.customStatus ||
                            PRESENCE_META[friend.presence]?.label}
                        </span>
                      </span>
                    </button>
                  ))
                ) : (
                  <p className="text-xs leading-5 text-muted-foreground">
                    {social === undefined
                      ? "Loading your circle…"
                      : "It's quiet for now. A little hello can change that."}
                  </p>
                )}
              </div>
              <Link
                to="/dashboard/discover"
                className="group block rounded-2xl border border-primary/20 bg-primary/5 p-5 transition-colors hover:bg-primary/10"
              >
                <span className="mb-4 flex size-10 items-center justify-center rounded-xl bg-primary/12 text-primary">
                  <Compass className="size-5" />
                </span>
                <h2 className="text-sm font-semibold">
                  Find your kind of people.
                </h2>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  There's a community for whatever you're into.
                </p>
                <span className="mt-4 flex items-center gap-2 text-xs font-semibold text-primary">
                  Explore communities{" "}
                  <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" />
                </span>
              </Link>
              <p className="px-2 text-[10px] leading-5 text-muted-foreground">
                A shortcut to anywhere.
                <br />
                <kbd className="mr-1 rounded border border-border px-1.5 py-0.5">
                  Ctrl K
                </kbd>{" "}
                to search Kyro.
              </p>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}

/** People you share a community with — one tap to send a friend request. */
function SuggestedPanel({
  onOpenProfile,
}: {
  onOpenProfile: (userId: string) => void;
}) {
  const suggestions = useQuery(api.users.suggest);
  const sendRequest = useMutation(api.social.sendRequest);
  const [sent, setSent] = useState<string[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  if (suggestions === undefined) {
    return (
      <p className="p-8 text-center text-sm text-muted-foreground">Loading…</p>
    );
  }
  if (suggestions.length === 0) {
    return (
      <p className="p-8 text-center text-sm text-muted-foreground">
        No suggestions right now. Join communities in Discover and the people
        you meet will show up here.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border/60">
      {suggestions.map((user) => {
        const alreadySent = sent.includes(user.id);
        return (
          <li
            key={user.id}
            className="flex items-center gap-3 px-6 py-3 transition-colors hover:bg-panel/60"
          >
            <button
              type="button"
              onClick={() => onOpenProfile(user.id)}
              className="flex min-w-0 flex-1 items-center gap-3 text-left"
            >
              <UserAvatar user={user} size="md" />
              <span className="min-w-0">
                <StyledDisplayName
                  user={user}
                  className="block truncate text-sm"
                />
                <span className="block truncate text-xs text-muted-foreground">
                  @{user.username ?? "no username"} ·{" "}
                  {user.presence === "offline" ? "offline" : user.presence}
                </span>
              </span>
            </button>
            <Button
              size="sm"
              variant={alreadySent ? "outline" : "default"}
              disabled={alreadySent || busyId === user.id}
              onClick={async () => {
                if (busyId) return;
                setBusyId(user.id);
                try {
                  await sendRequest({ userId: user.id as Id<"users"> });
                  setSent((state) => [...state, user.id]);
                  toast.success(`Friend request sent to ${user.name}.`);
                } catch (error) {
                  toast.error(
                    error instanceof Error
                      ? error.message
                      : "Could not send the request.",
                  );
                } finally {
                  setBusyId(null);
                }
              }}
            >
              {alreadySent ? (
                <>
                  <Check className="mr-1.5 size-4" /> Request sent
                </>
              ) : (
                <>
                  <UserPlus className="mr-1.5 size-4" /> Add friend
                </>
              )}
            </Button>
          </li>
        );
      })}
    </ul>
  );
}

function RowActions({
  user,
  onOpenProfile,
}: {
  user: PublicUser;
  onOpenProfile: (userId: string) => void;
}) {
  const navigate = useNavigate();
  const createDirect = useMutation(api.conversations.createDirect);
  const removeFriend = useMutation(api.social.removeFriend);
  const block = useMutation(api.social.block);
  const [busy, setBusy] = useState(false);

  const message = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const conversationId = await createDirect({
        userId: user.id as Id<"users">,
      });
      navigate(`/dashboard/dm/${conversationId}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not open DM.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <button
        type="button"
        aria-label={`Message ${user.name}`}
        title={`Message ${user.name}`}
        disabled={busy}
        onClick={() => void message()}
        className="rounded-full bg-surface/65 p-2.5 text-muted-foreground transition-colors hover:bg-primary/15 hover:text-primary disabled:opacity-50"
      >
        <MessageCircle className="size-4" />
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`More options for ${user.name}`}
            className="rounded-full p-2.5 text-muted-foreground hover:bg-surface hover:text-foreground"
          >
            <Ellipsis className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => onOpenProfile(user.id)}>
            <UserPlus className="mr-2 size-4" />
            View profile
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive"
            onSelect={() => {
              void removeFriend({ userId: user.id as Id<"users"> }).catch(
                (error) =>
                  toast.error(
                    error instanceof Error
                      ? error.message
                      : "Could not remove friend.",
                  ),
              );
            }}
          >
            <X className="mr-2 size-4" />
            Remove friend
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive"
            onSelect={() => {
              void block({ userId: user.id as Id<"users"> }).catch((error) =>
                toast.error(
                  error instanceof Error
                    ? error.message
                    : "Could not block user.",
                ),
              );
            }}
          >
            <Ban className="mr-2 size-4" />
            Block
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function UserList({
  users,
  emptyHint,
  onOpenProfile,
  showPresence,
  emptyAction,
  emptyActionLabel,
}: {
  users: PublicUser[];
  emptyHint: string;
  onOpenProfile: (userId: string) => void;
  showPresence?: boolean;
  emptyAction?: () => void;
  emptyActionLabel?: string;
}) {
  if (users.length === 0) {
    return (
      <div className="flex flex-col items-center rounded-2xl border border-dashed border-border px-6 py-12 text-center">
        <span className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary/8 text-primary">
          <MessageCircle className="size-6" />
        </span>
        <h2 className="mb-2 text-base font-semibold">
          Room for a little connection
        </h2>
        <p className="max-w-xs text-xs leading-5 text-muted-foreground">
          {emptyHint}
        </p>
        {emptyAction && (
          <Button
            variant="outline"
            size="sm"
            className="mt-5 text-xs"
            onClick={emptyAction}
          >
            {emptyActionLabel}
            <ArrowRight className="ml-2 size-3.5" />
          </Button>
        )}
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {users.map((user) => (
        <li
          key={user.id}
          className="list-row flex items-center gap-3 rounded-xl border border-border/60 bg-panel/35 px-3 py-3.5 transition-colors hover:border-primary/20 hover:bg-panel"
        >
          <button
            type="button"
            onClick={() => onOpenProfile(user.id)}
            className="flex min-w-0 flex-1 items-center gap-3 text-left"
          >
            <UserAvatar user={user} size="md" />
            <span className="min-w-0">
              <span className="flex items-center gap-1.5">
                <StyledDisplayName user={user} className="truncate text-sm" />
                {user.username && (
                  <span className="hidden truncate text-xs text-muted-foreground sm:inline">
                    @{user.username}
                  </span>
                )}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {user.customStatus ||
                  (showPresence
                    ? PRESENCE_META[user.presence ?? "offline"]?.label
                    : "")}
              </span>
            </span>
          </button>
          <RowActions user={user} onOpenProfile={onOpenProfile} />
        </li>
      ))}
    </ul>
  );
}

function PendingList({
  incoming,
  outgoing,
  onOpenProfile,
}: {
  incoming: {
    connectionId: string;
    createdAt: number;
    user: PublicUser | null;
  }[];
  outgoing: {
    connectionId: string;
    createdAt: number;
    user: PublicUser | null;
  }[];
  onOpenProfile: (userId: string) => void;
}) {
  const respond = useMutation(api.social.respond);
  const cancel = useMutation(api.social.cancel);

  const run = (action: Promise<unknown>) => {
    void action.catch((error) =>
      toast.error(
        error instanceof Error ? error.message : "Something went wrong.",
      ),
    );
  };

  if (incoming.length === 0 && outgoing.length === 0) {
    return (
      <p className="p-8 text-center text-sm text-muted-foreground">
        No pending friend requests. Send one from “Add friend”.
      </p>
    );
  }

  const section = (
    title: string,
    rows: typeof incoming,
    kind: "incoming" | "outgoing",
  ) => (
    <>
      <p className="mx-auto max-w-4xl px-4 pb-1 pt-5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title} · {rows.length}
      </p>
      <ul className="mx-auto max-w-4xl divide-y divide-border/60 px-2">
        {rows
          .filter((row) => row.user)
          .map((row) => (
            <li
              key={row.connectionId}
              className="flex items-center gap-3 rounded-md px-3 py-2.5 hover:bg-panel"
            >
              <button
                type="button"
                onClick={() => onOpenProfile(row.user!.id)}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <UserAvatar user={row.user!} size="md" />
                <span className="min-w-0">
                  <StyledDisplayName
                    user={row.user!}
                    className="block truncate text-sm"
                  />
                  <span className="block truncate text-xs text-muted-foreground">
                    {row.user!.username ? `@${row.user!.username} · ` : ""}
                    {formatRelative(row.createdAt)}
                  </span>
                </span>
              </button>
              <div className="flex items-center gap-1">
                {kind === "incoming" ? (
                  <>
                    <Button
                      size="sm"
                      onClick={() =>
                        run(
                          respond({
                            connectionId: row.connectionId as Id<"connections">,
                            accept: true,
                          }),
                        )
                      }
                      aria-label="Accept request"
                    >
                      <Check className="mr-1 size-4" /> Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        run(
                          respond({
                            connectionId: row.connectionId as Id<"connections">,
                            accept: false,
                          }),
                        )
                      }
                      aria-label="Ignore request"
                    >
                      <X className="size-4" />
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      run(
                        cancel({
                          connectionId: row.connectionId as Id<"connections">,
                        }),
                      )
                    }
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </li>
          ))}
      </ul>
    </>
  );

  return (
    <div className="pb-6">
      {section("Received", incoming, "incoming")}
      {section("Sent", outgoing, "outgoing")}
    </div>
  );
}

function BlockedList({
  blocked,
  onOpenProfile,
}: {
  blocked: { blockId: string; createdAt: number; user: PublicUser | null }[];
  onOpenProfile: (userId: string) => void;
}) {
  const unblock = useMutation(api.social.unblock);
  if (blocked.length === 0) {
    return (
      <p className="p-8 text-center text-sm text-muted-foreground">
        You haven't blocked anyone.
      </p>
    );
  }
  return (
    <ul className="mx-auto max-w-4xl divide-y divide-border/60 p-2">
      {blocked
        .filter((row) => row.user)
        .map((row) => (
          <li
            key={row.blockId}
            className="flex items-center gap-3 rounded-md px-3 py-2.5 hover:bg-panel"
          >
            <button
              type="button"
              onClick={() => onOpenProfile(row.user!.id)}
              className="flex min-w-0 flex-1 items-center gap-3 text-left"
            >
              <UserAvatar user={row.user!} size="md" showStatus={false} />
              <span className="min-w-0">
                <StyledDisplayName
                  user={row.user!}
                  className="block truncate text-sm"
                />
                <span className="block truncate text-xs text-muted-foreground">
                  Blocked {formatRelative(row.createdAt)}
                </span>
              </span>
            </button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void unblock({ userId: row.user!.id as Id<"users"> }).catch(
                  (error) =>
                    toast.error(
                      error instanceof Error
                        ? error.message
                        : "Could not unblock user.",
                    ),
                );
              }}
            >
              Unblock
            </Button>
          </li>
        ))}
    </ul>
  );
}

/** Username search + one-click friend requests. */
function AddFriendPanel() {
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const sendRequest = useMutation(api.social.sendRequest);
  const [sent, setSent] = useState<string[]>([]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(term.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [term]);

  const results = useQuery(
    api.users.searchUsers,
    debounced ? { term: debounced } : "skip",
  );
  const me = useQuery(api.users.me);

  const add = async (userId: string, username: string | null) => {
    try {
      await sendRequest(
        username ? { username } : { userId: userId as Id<"users"> },
      );
      setSent((previous) => [...previous, userId]);
      toast.success("Friend request sent.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not send request.",
      );
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <h2 className="text-lg font-semibold">Add friend</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Find someone by their Kyro username — it's the handle after the @.
      </p>
      <div className="mt-4 flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="username"
            className="pl-9"
            aria-label="Username to add"
          />
        </div>
      </div>

      <div className="mt-6 space-y-1">
        {debounced.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Search for people to add. You can also accept requests from the
            Pending tab.
          </p>
        )}
        {debounced.length > 0 && results === undefined && (
          <p className="text-sm text-muted-foreground">Searching…</p>
        )}
        {debounced.length > 0 && results?.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No one matched “{debounced}”. Check the spelling of the username.
          </p>
        )}
        {results?.map((user) => {
          const alreadySent = sent.includes(user.id);
          return (
            <div
              key={user.id}
              className="flex items-center gap-3 rounded-md border border-border/60 bg-panel px-3 py-2.5"
            >
              <UserAvatar user={user} size="md" />
              <div className="min-w-0 flex-1">
                <StyledDisplayName
                  user={user}
                  className="block truncate text-sm"
                />
                <p className="truncate text-xs text-muted-foreground">
                  {user.username ? `@${user.username}` : "no username yet"}
                </p>
              </div>
              <Button
                size="sm"
                disabled={alreadySent || user.id === me?.id}
                onClick={() => void add(user.id, user.username)}
              >
                <UserCheck className="mr-1.5 size-4" />
                {alreadySent ? "Requested" : "Add friend"}
              </Button>
            </div>
          );
        })}
      </div>

      <p className="mt-8 flex items-center gap-2 text-xs text-muted-foreground">
        <Clock className="size-3.5" /> Requests respect each person's privacy
        settings — they can turn them off in Settings.
      </p>
    </div>
  );
}
