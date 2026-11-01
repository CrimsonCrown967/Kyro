import { useMutation, useQuery } from "convex/react";
import {
  BookOpen,
  PhoneOff,
  Volume2,
  Compass,
  Copy,
  Hash,
  Loader2,
  Lock,
  LogOut,
  MessagesSquare,
  MicOff,
  Pencil,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  UserPlus,
  Users,
} from "@/components/icons";
import { useMemo, useState } from "react";
import { Link, useMatch, useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { UserAvatar } from "@/components/app/UserAvatar";
import { UserBar } from "@/components/app/UserBar";
import { StyledDisplayName } from "@/components/app/StyledDisplayName";
import { CreateChannelDialog, InviteDialog } from "@/components/app/dialogs";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PERMISSIONS } from "@/lib/permissions";
import { cn } from "@/lib/utils";

export function Sidebar({
  activeServerId,
  onOpenSettings,
}: {
  activeServerId?: string;
  onOpenSettings?: () => void;
}) {
  return (
    <div className="flex w-72 shrink-0 flex-col border-r border-border/70 bg-sidebar shadow-[6px_0_24px_rgba(0,0,0,.08)]">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {activeServerId ? (
          <ServerSection serverId={activeServerId} />
        ) : (
          <HomeSection />
        )}
      </div>
      <UserBar onOpenSettings={onOpenSettings} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Community sidebar                                                   */
/* ------------------------------------------------------------------ */

function ServerSection({ serverId }: { serverId: string }) {
  // Membership first: `servers.get` and `channels.list` both *throw* for a
  // non-member, and the sidebar sits outside the route error boundary — so a
  // not-yet-joined server used to crash the whole frame. Ask the safe probe,
  // and only subscribe to the throwing queries once we know we're inside.
  const access = useQuery(api.servers.joinState, {
    serverId: serverId as Id<"servers">,
  });
  const canEnter = access?.isMember === true;
  const serverQuery = useQuery(
    api.servers.get,
    canEnter ? { serverId: serverId as Id<"servers"> } : "skip",
  );
  const listing = useQuery(
    api.channels.list,
    canEnter ? { serverId: serverId as Id<"servers"> } : "skip",
  );
  const createCategory = useMutation(api.channels.createCategory);
  const leave = useMutation(api.servers.leave);
  const setMuted = useMutation(api.servers.setMuted);
  const setLocked = useMutation(api.servers.setLocked);
  const navigate = useNavigate();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [nicknameOpen, setNicknameOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const activeTextChannel = useMatch("/dashboard/s/:serverId/c/:channelId");
  const activeVoiceChannel = useMatch("/dashboard/s/:serverId/v/:channelId");
  const activeForumChannel = useMatch("/dashboard/s/:serverId/f/:channelId");
  const activeChannelId =
    activeTextChannel?.params.channelId ??
    activeVoiceChannel?.params.channelId ??
    activeForumChannel?.params.channelId;

  const permissions = listing?.permissions ?? [];
  const canManageChannels = permissions.includes(PERMISSIONS.MANAGE_CHANNELS);
  const canInvite = permissions.includes(PERMISSIONS.CREATE_INVITES);
  const canManageServer = permissions.includes(PERMISSIONS.MANAGE_SERVER);

  /** Toast-wrapped async menu action. */
  const run = async (action: Promise<unknown>, success?: string) => {
    try {
      await action;
      if (success) toast.success(success);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "That didn't work — try again.",
      );
    }
  };

  const groups = useMemo(() => {
    if (!listing) return [];
    type ChannelRow = (typeof listing.channels)[number];
    const loose: ChannelRow[] = [];
    const byCategory = new Map<string, ChannelRow[]>();
    for (const category of listing.categories) byCategory.set(category.id, []);
    for (const channel of listing.channels) {
      if (channel.categoryId) {
        byCategory.get(channel.categoryId)?.push(channel);
      } else {
        loose.push(channel);
      }
    }
    const result = [
      ...listing.categories.map((category) => ({
        id: category.id,
        name: category.name,
        channels: byCategory.get(category.id) ?? [],
      })),
      { id: "", name: "", channels: loose },
    ];
    return result.filter((group) => group.channels.length > 0);
  }, [listing]);

  if (access !== undefined && !canEnter) {
    return (
      <p className="px-4 py-6 text-center text-xs leading-5 text-muted-foreground">
        You're not a member of this community yet — join to see its channels.
      </p>
    );
  }

  if (!serverQuery || !listing) {
    return (
      <div className="flex h-32 items-center justify-center text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
      </div>
    );
  }
  const server = serverQuery;

  return (
    <>
      <div className="sticky top-0 z-10 border-b border-border/70 bg-sidebar/90 backdrop-blur-xl">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex h-14 w-full items-center justify-between gap-2 px-4 text-left text-base font-bold hover:bg-sidebar-accent/60">
              <span className="truncate tracking-tight">{server.name}</span>
              <span className="text-xs text-muted-foreground">▾</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel className="truncate text-xs text-muted-foreground">
              {server.memberCount} members
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {canInvite && (
              <DropdownMenuItem onClick={() => setInviteOpen(true)}>
                <UserPlus className="size-4" /> Invite people
              </DropdownMenuItem>
            )}
            {canManageChannels && (
              <DropdownMenuItem onClick={() => setCreateOpen(true)}>
                <Plus className="size-4" /> Create channel
              </DropdownMenuItem>
            )}
            {canManageServer && (
              <DropdownMenuItem
                onClick={() =>
                  void run(
                    setLocked({
                      serverId: serverId as Id<"servers">,
                      locked: !server.locked,
                    }),
                    server.locked
                      ? "Server unlocked — everyone can post again."
                      : "Server locked — only staff can post now.",
                  )
                }
              >
                <Lock className="size-4" />
                {server.locked ? "Unlock server" : "Lock server"}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={() => {
                void navigator.clipboard
                  .writeText(serverId)
                  .then(() => toast.success("Server ID copied."))
                  .catch(() =>
                    toast.error("Clipboard access was blocked by the browser."),
                  );
              }}
            >
              <Copy className="size-4" /> Copy server ID
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setNicknameOpen(true)}>
              <Pencil className="size-4" /> Change nickname
            </DropdownMenuItem>
            {canManageChannels && (
              <DropdownMenuItem
                onClick={async () => {
                  try {
                    await createCategory({
                      serverId: serverId as Id<"servers">,
                      name: "New category",
                    });
                    toast.success("Category added");
                  } catch (error) {
                    toast.error(
                      error instanceof Error ? error.message : "Failed",
                    );
                  }
                }}
              >
                <Plus className="size-4" /> Add category
              </DropdownMenuItem>
            )}
            {canManageServer && (
              <DropdownMenuItem
                onClick={() =>
                  navigate(`/dashboard/s/${serverId}/settings/overview`)
                }
              >
                <Settings className="size-4" /> Server Settings
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={async () => {
                try {
                  await setMuted({
                    serverId: serverId as Id<"servers">,
                    muted: !server.muted,
                  });
                } catch (error) {
                  toast.error(
                    error instanceof Error ? error.message : "Failed",
                  );
                }
              }}
            >
              <MicOff className="size-4" />
              {server.muted ? "Unmute notifications" : "Mute notifications"}
            </DropdownMenuItem>
            {!server.isOwner && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={async () => {
                    try {
                      await leave({ serverId: serverId as Id<"servers"> });
                      navigate("/dashboard");
                      toast.success(`Left ${server.name}`);
                    } catch (error) {
                      toast.error(
                        error instanceof Error ? error.message : "Failed",
                      );
                    }
                  }}
                >
                  <LogOut className="size-4" /> Leave community
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {server.bannerUrl && (
        <div className="relative h-24 overflow-hidden border-b border-border/60">
          <img
            src={server.bannerUrl}
            alt=""
            className="size-full object-cover"
          />
          <span className="absolute inset-0 bg-gradient-to-t from-sidebar via-transparent to-transparent" />
        </div>
      )}

      <div className="px-3 py-3">
        {canInvite && (
          <button
            type="button"
            onClick={() => setInviteOpen(true)}
            className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl bg-primary/15 px-3 py-2.5 text-sm font-semibold text-primary ring-1 ring-primary/20 transition-colors hover:bg-primary/25"
          >
            <UserPlus className="size-4" /> Invite people
          </button>
        )}
        {groups.map((group) => (
          <div key={group.id || "loose"} className="mb-4 last:mb-0">
            {group.id !== "" && (
              <div className="group mb-1 flex items-center justify-between px-1.5">
                <button
                  type="button"
                  onClick={() =>
                    setCollapsed((state) => ({
                      ...state,
                      [group.id]: !state[group.id],
                    }))
                  }
                  className="flex min-w-0 items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
                >
                  <span
                    className={cn(
                      "transition-transform",
                      collapsed[group.id] && "-rotate-90",
                    )}
                  >
                    ▾
                  </span>
                  <span className="truncate">{group.name}</span>
                </button>
                {canManageChannels && (
                  <button
                    type="button"
                    aria-label={`Add a channel to ${group.name}`}
                    onClick={() => setCreateOpen(true)}
                    className="opacity-0 transition group-hover:opacity-100"
                  >
                    <Plus className="size-4 text-muted-foreground hover:text-foreground" />
                  </button>
                )}
              </div>
            )}

            {!collapsed[group.id] &&
              group.channels.map((channel) => {
                const active = activeChannelId === channel.id;
                const isVoice = channel.kind === "voice";
                const isForum = channel.kind === "forum";
                return (
                  <Link
                    key={channel.id}
                    to={`/dashboard/s/${serverId}/${isVoice ? "v" : isForum ? "f" : "c"}/${channel.id}`}
                    title={channel.topic ?? channel.name}
                    className={cn(
                      "mb-1 flex items-center gap-2 rounded-lg border-l-2 px-2.5 py-2 text-sm transition-colors",
                      active
                        ? "border-primary bg-primary/15 font-semibold text-foreground shadow-sm"
                        : "border-transparent text-muted-foreground hover:bg-sidebar-accent/70 hover:text-foreground",
                    )}
                  >
                    {isVoice ? (
                      <Volume2 className="size-4 shrink-0 opacity-70" />
                    ) : isForum ? (
                      <MessagesSquare className="size-4 shrink-0 opacity-70" />
                    ) : channel.isRules ? (
                      <BookOpen className="size-4 shrink-0 opacity-70" />
                    ) : (
                      <Hash className="size-4 shrink-0 opacity-70" />
                    )}
                    <span
                      className={cn(
                        "truncate",
                        channel.unread &&
                          !active &&
                          "font-semibold text-foreground",
                        channel.readOnly && "italic",
                      )}
                    >
                      {channel.name}
                    </span>
                    {channel.unread && !active && (
                      <span className="ml-auto size-1.5 shrink-0 rounded-full bg-foreground" />
                    )}
                  </Link>
                );
              })}
          </div>
        ))}

        {canManageChannels && (
          <Button
            variant="outline"
            size="sm"
            className="mt-1 w-full justify-start gap-1.5 border-dashed"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="size-4" /> Create channel
          </Button>
        )}
      </div>

      <InviteDialog
        serverId={serverId}
        open={inviteOpen}
        onOpenChange={setInviteOpen}
      />
      <CreateChannelDialog
        serverId={serverId}
        open={createOpen}
        onOpenChange={setCreateOpen}
        categories={listing.categories}
      />
      <NicknameDialog
        serverId={serverId}
        currentNickname={server.nickname ?? ""}
        open={nicknameOpen}
        onOpenChange={setNicknameOpen}
      />
    </>
  );
}

/** Rename yourself inside one community (staff can rename others elsewhere). */
function NicknameDialog({
  serverId,
  currentNickname,
  open,
  onOpenChange,
}: {
  serverId: string;
  currentNickname: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const me = useQuery(api.users.me);
  const setNickname = useMutation(api.servers.setNickname);
  const [draft, setDraft] = useState(currentNickname);
  const [seeded, setSeeded] = useState(false);
  const [busy, setBusy] = useState(false);
  if (open && !seeded) {
    setSeeded(true);
    setDraft(currentNickname);
  }
  if (!open && seeded) setSeeded(false);

  const save = async () => {
    if (!me || busy) return;
    setBusy(true);
    try {
      await setNickname({
        serverId: serverId as Id<"servers">,
        userId: me.id as Id<"users">,
        nickname: draft.trim() || undefined,
      });
      toast.success(draft.trim() ? "Nickname updated." : "Nickname cleared.");
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not change nickname.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Change nickname</DialogTitle>
          <DialogDescription>
            How you appear in this community only. Leave empty to use your
            display name.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
          className="space-y-3"
        >
          <Input
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Nickname"
            maxLength={64}
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button disabled={busy}>
              {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Home sidebar: friends + direct messages                             */
/* ------------------------------------------------------------------ */

/**
 * What a conversation is called in the list: its group name when it has one,
 * otherwise the other participants — a 1:1 DM is labelled with the person you
 * are talking to, never with your own name.
 */
function conversationLabel(
  conversation: {
    name: string | null;
    participants: { id: string; name: string }[];
  },
  viewerId: string | undefined,
): string {
  if (conversation.name) return conversation.name;
  const others = conversation.participants.filter(
    (user) => user.id !== viewerId,
  );
  const names = (others.length > 0 ? others : conversation.participants).map(
    (user) => user.name,
  );
  return names.join(", ") || "Conversation";
}

function HomeSection() {
  const conversations = useQuery(api.conversations.list);
  const social = useQuery(api.social.list);
  const me = useQuery(api.users.me);
  const [query, setQuery] = useState("");
  const [params] = useSearchParams();
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const friendsMatch = useMatch("/dashboard");
  const findPeopleMatch = params.get("tab") === "add";
  const discoverMatch = useMatch("/dashboard/discover");
  const adminMatch = useMatch("/dashboard/admin");

  const pending =
    (social?.incoming.length ?? 0) + (social?.outgoing.length ?? 0);
  const filtered = (conversations ?? []).filter((conversation) => {
    if (!query.trim()) return true;
    return conversationLabel(conversation, me?.id)
      .toLowerCase()
      .includes(query.toLowerCase());
  });

  return (
    <div className="px-2 py-3">
      <div className="-mx-2 -mt-3 mb-3 flex h-14 items-center border-b border-border/70 px-4 text-base font-bold tracking-tight">
        Direct messages
      </div>
      <Link
        to="/dashboard"
        className={cn(
          "mb-1 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm",
          friendsMatch && !findPeopleMatch
            ? "bg-sidebar-accent font-medium text-foreground"
            : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
        )}
      >
        <Users className="size-4" />
        Friends
        {pending > 0 && (
          <span className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[11px] font-bold leading-none text-white">
            {pending}
          </span>
        )}
      </Link>

      <Link
        to="/dashboard?tab=add"
        className={cn(
          "mb-1 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm",
          findPeopleMatch
            ? "bg-sidebar-accent font-medium text-foreground"
            : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
        )}
      >
        <Search className="size-4" />
        Find people
      </Link>

      <button
        type="button"
        onClick={() => setCreateGroupOpen(true)}
        className="mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent/70 hover:text-foreground"
      >
        <UserPlus className="size-4" />
        Create group
      </button>

      <Link
        to="/dashboard/discover"
        className={cn(
          "mb-1 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm",
          discoverMatch
            ? "bg-sidebar-accent font-medium text-foreground"
            : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
        )}
      >
        <Compass className="size-4" />
        Discover
      </Link>

      {me &&
        (me.role === "admin" ||
          me.isFounder ||
          me.badges.includes("moderator")) && (
          <Link
            to="/dashboard/admin"
            className={cn(
              "mb-1 flex items-center gap-2 rounded-md px-2 py-2 text-sm",
              adminMatch
                ? "bg-brand/15 font-medium text-brand"
                : "text-brand/90 hover:bg-brand/10 hover:text-brand",
            )}
          >
            <ShieldCheck className="size-4" />
            Admin Portal
          </Link>
        )}

      <div className="mt-5 mb-1 flex items-center justify-between px-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Direct messages
        </span>
        <NewConversationButton />
      </div>

      <div className="px-1 pb-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search"
            className="h-7 pl-7 text-xs"
          />
        </div>
      </div>

      {conversations === undefined ? (
        <div className="flex justify-center py-6">
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="px-2 py-4 text-xs leading-5 text-muted-foreground">
          No conversations yet. Add a friend and start chatting.
        </p>
      ) : (
        filtered.map((conversation) => {
          const others = conversation.participants.filter(
            (user) => user.id !== me?.id,
          );
          const other = others[0];
          const label = conversationLabel(conversation, me?.id);
          // A call nobody picked up is called out in the list, not just in chat.
          const missedCall = conversation.lastMessagePreview === "Missed call";
          return (
            <Link
              key={conversation.id}
              to={`/dashboard/dm/${conversation.id}`}
              className="mb-1 flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent/70 hover:text-foreground"
            >
              <UserAvatar
                user={{
                  id: conversation.id,
                  name: label,
                  avatarUrl:
                    conversation.type === "dm"
                      ? (other?.avatarUrl ?? null)
                      : null,
                  presence:
                    conversation.type === "dm" && other
                      ? other.presence
                      : "offline",
                }}
                size="sm"
                showStatus={conversation.type === "dm"}
              />
              <span className="min-w-0 flex-1">
                {conversation.type === "dm" && other ? (
                  <StyledDisplayName
                    user={other}
                    name={label}
                    className="block truncate"
                  />
                ) : (
                  <span className="block truncate font-semibold">{label}</span>
                )}
                {missedCall && (
                  <span className="flex items-center gap-1 text-[11px] font-medium text-destructive">
                    <PhoneOff className="size-3" /> Missed call
                  </span>
                )}
              </span>
              {conversation.unread && (
                <span
                  className={cn(
                    "size-2 shrink-0 rounded-full",
                    missedCall ? "bg-destructive" : "bg-foreground",
                  )}
                />
              )}
            </Link>
          );
        })
      )}

      <NewConversationDialog
        open={createGroupOpen}
        onOpenChange={setCreateGroupOpen}
      />
    </div>
  );
}

function NewConversationButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label="New direct message"
        onClick={() => setOpen(true)}
        className="rounded p-1 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
      >
        <Plus className="size-4" />
      </button>
      <NewConversationDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

/** Pick one friend for a DM, or several to start a group message. */
function NewConversationDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const social = useQuery(api.social.list);
  const createDirect = useMutation(api.conversations.createDirect);
  const createGroup = useMutation(api.conversations.createGroup);
  const navigate = useNavigate();
  const [term, setTerm] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const friends = (social?.friends ?? []).filter(
    (friend) =>
      friend.name.toLowerCase().includes(term.toLowerCase()) ||
      (friend.username ?? "").toLowerCase().includes(term.toLowerCase()),
  );

  const start = async () => {
    if (selected.length === 0) return;
    setBusy(true);
    try {
      const conversationId =
        selected.length === 1
          ? await createDirect({ userId: selected[0] as Id<"users"> })
          : await createGroup({ userIds: selected as Id<"users">[] });
      onOpenChange(false);
      setSelected([]);
      setTerm("");
      navigate(`/dashboard/dm/${conversationId}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not start the chat.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuContent align="start" className="w-72 p-2">
        <p className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          New message
        </p>
        <Input
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Search friends"
          className="mb-2 h-8"
        />
        <div className="max-h-64 overflow-y-auto">
          {friends.length === 0 ? (
            <p className="px-2 py-3 text-xs text-muted-foreground">
              Add friends first from the Friends page.
            </p>
          ) : (
            friends.map((friend) => {
              const isSelected = selected.includes(friend.id);
              return (
                <button
                  key={friend.id}
                  type="button"
                  onClick={() =>
                    setSelected((state) =>
                      state.includes(friend.id)
                        ? state.filter((id) => id !== friend.id)
                        : [...state, friend.id],
                    )
                  }
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-sidebar-accent",
                    isSelected && "bg-sidebar-accent",
                  )}
                >
                  <UserAvatar user={friend} size="sm" />
                  <span className="min-w-0 flex-1 truncate">
                    {friend.name}
                    <span className="ml-1 text-xs text-muted-foreground">
                      @{friend.username}
                    </span>
                  </span>
                  {isSelected && (
                    <span className="text-xs text-primary">✓</span>
                  )}
                </button>
              );
            })
          )}
        </div>
        {selected.length > 0 && (
          <Button
            size="sm"
            className="mt-2 w-full"
            onClick={start}
            disabled={busy}
          >
            <MessagesSquare className="mr-2 size-4" />
            {selected.length === 1
              ? "Message"
              : `Message ${selected.length} people`}
          </Button>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
