import { useMutation, useQuery } from "convex/react";
import {
  Bell,
  CheckCheck,
  Compass,
  Copy,
  Loader2,
  LogOut,
  Plus,
  Settings,
  UserPlus,
  VolumeX,
} from "@/components/icons";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { KyroMark } from "@/components/KyroMark";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/lib/store";
import { CreateCommunityDialog, InviteDialog } from "@/components/app/dialogs";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";

function RailButton({
  label,
  active,
  unread,
  mentions,
  onClick,
  to,
  children,
  className,
  contextMenu,
}: {
  label: string;
  active: boolean;
  unread?: boolean;
  mentions?: number;
  onClick?: () => void;
  to?: string;
  children: React.ReactNode;
  className?: string;
  /** Radix ContextMenuContent attached to this rail item, if any. */
  contextMenu?: React.ReactNode;
}) {
  const body = (
    <span
      className={cn(
        "relative flex size-12 items-center justify-center rounded-2xl ring-1 ring-border transition-all duration-200",
        active
          ? "bg-primary text-white shadow-lg shadow-primary/20 ring-primary/40"
          : "bg-surface/60 text-muted-foreground hover:bg-primary/20 hover:text-primary",
        className,
      )}
    >
      <span className="flex size-full items-center justify-center overflow-hidden rounded-[inherit]">
        {children}
      </span>
      {mentions !== undefined && mentions > 0 && (
        <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[11px] font-bold text-white ring-2 ring-rail">
          {mentions > 99 ? "99+" : mentions}
        </span>
      )}
      {(!mentions || mentions === 0) && unread && (
        <span className="absolute -left-1 top-1/2 h-2 w-1 -translate-y-1/2 rounded-full bg-foreground" />
      )}
    </span>
  );

  const trigger = to ? (
    <Link
      to={to}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className="block rounded-2xl"
    >
      {body}
    </Link>
  ) : (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className="block"
    >
      {body}
    </button>
  );

  const button = (
    <Tooltip>
      <TooltipTrigger asChild>
        {contextMenu ? (
          <ContextMenuTrigger asChild>{trigger}</ContextMenuTrigger>
        ) : (
          trigger
        )}
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );

  if (!contextMenu) return button;
  return (
    <ContextMenu>
      {button}
      {contextMenu}
    </ContextMenu>
  );
}

export function ServerRail({ activeServerId }: { activeServerId?: string }) {
  const servers = useQuery(api.servers.listMine);
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const [discoverOpen, setDiscoverOpen] = useState(false);
  const [inviteServerId, setInviteServerId] = useState<string | null>(null);
  const setMuted = useMutation(api.servers.setMuted);
  const markServerRead = useMutation(api.messages.markServerRead);
  const leaveServer = useMutation(api.servers.leave);
  const conversations = useQuery(api.conversations.list);
  const me = useQuery(api.users.me);
  const unreadDmBubbles = useUiStore((state) => state.unreadDmBubbles);

  /** Unread DM bubbles under Home — the "Unread DMs in the server list" pref. */
  const bubbleDms = (unreadDmBubbles ? (conversations ?? []) : [])
    .filter((conversation) => conversation.unread)
    .slice(0, 3);

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

  return (
    <>
      <nav
        aria-label="Communities"
        className="flex w-[76px] shrink-0 flex-col items-center gap-3 overflow-y-auto overflow-x-hidden border-r border-border/60 bg-rail px-2 py-4"
      >
        <RailButton
          label="Direct messages"
          active={!activeServerId}
          to="/dashboard"
        >
          <KyroMark className="size-8" />
        </RailButton>

        <span className="my-1 h-0.5 w-10 rounded-full bg-border" />

        {bubbleDms.map((conversation) => {
          const other =
            conversation.participants.find(
              (participant) => participant.id !== me?.id,
            ) ?? conversation.participants[0];
          if (!other) return null;
          return (
            <button
              key={conversation.id}
              type="button"
              onClick={() => navigate(`/dashboard/dm/${conversation.id}`)}
              className="relative flex size-9 items-center justify-center self-center overflow-hidden rounded-full border border-border/60 bg-surface transition-transform hover:scale-105"
              title={conversation.name ?? other.name}
            >
              {other.avatarUrl ? (
                <img
                  src={other.avatarUrl}
                  alt=""
                  className="size-full object-cover"
                />
              ) : (
                <span className="text-xs font-bold">
                  {other.name.slice(0, 1).toUpperCase()}
                </span>
              )}
              <span
                aria-hidden="true"
                className={`absolute bottom-0.5 right-0.5 size-2.5 rounded-full border-2 border-rail ${
                  other.presence !== "offline"
                    ? "bg-success"
                    : "bg-muted-foreground/50"
                }`}
              />
            </button>
          );
        })}

        {servers === undefined ? (
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        ) : servers.length === 0 ? (
          <span className="w-full px-2 text-center text-[10px] leading-tight text-muted-foreground">
            No communities yet
          </span>
        ) : (
          servers.map((server) => (
            <RailButton
              key={server.id}
              label={server.name}
              active={activeServerId === server.id}
              unread={server.unread && !server.muted}
              mentions={server.mentions}
              to={`/dashboard/s/${server.id}`}
              contextMenu={
                <ContextMenuContent className="w-56">
                  {hasPermission(
                    server.permissions,
                    PERMISSIONS.CREATE_INVITES,
                  ) ? (
                    <ContextMenuItem
                      onClick={() => setInviteServerId(server.id)}
                    >
                      <UserPlus className="size-4" /> Invite people
                    </ContextMenuItem>
                  ) : null}
                  <ContextMenuItem
                    onClick={() =>
                      void run(
                        markServerRead({
                          serverId: server.id as Id<"servers">,
                        }),
                        "Marked as read.",
                      )
                    }
                  >
                    <CheckCheck className="size-4" /> Mark as read
                  </ContextMenuItem>
                  <ContextMenuSub>
                    <ContextMenuSubTrigger>
                      <Bell className="size-4" /> Notification settings
                    </ContextMenuSubTrigger>
                    <ContextMenuSubContent className="w-52">
                      <ContextMenuCheckboxItem
                        checked={server.muted}
                        onCheckedChange={(muted) =>
                          void run(
                            setMuted({
                              serverId: server.id as Id<"servers">,
                              muted,
                            }),
                            muted ? "Server muted." : "Server unmuted.",
                          )
                        }
                      >
                        <VolumeX className="size-4" /> Mute server
                      </ContextMenuCheckboxItem>
                    </ContextMenuSubContent>
                  </ContextMenuSub>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    onClick={() => {
                      void navigator.clipboard
                        .writeText(server.id)
                        .then(() => toast.success("Server ID copied."))
                        .catch(() =>
                          toast.error(
                            "Clipboard access was blocked by the browser.",
                          ),
                        );
                    }}
                  >
                    <Copy className="size-4" /> Copy server ID
                  </ContextMenuItem>
                  <ContextMenuItem
                    onClick={() => navigate(`/dashboard/s/${server.id}`)}
                  >
                    <Compass className="size-4" /> Open server
                  </ContextMenuItem>
                  {hasPermission(
                    server.permissions,
                    PERMISSIONS.MANAGE_SERVER,
                  ) ? (
                    <ContextMenuItem
                      onClick={() =>
                        navigate(`/dashboard/s/${server.id}/settings/overview`)
                      }
                    >
                      <Settings className="size-4" /> Server settings
                    </ContextMenuItem>
                  ) : null}
                  {!server.isOwner ? (
                    <>
                      <ContextMenuSeparator />
                      <ContextMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={async () => {
                          if (
                            !window.confirm(
                              `Leave ${server.name}? You can rejoin later if it's public.`,
                            )
                          ) {
                            return;
                          }
                          try {
                            await leaveServer({
                              serverId: server.id as Id<"servers">,
                            });
                            toast.success(`Left ${server.name}.`);
                            if (activeServerId === server.id) {
                              navigate("/dashboard");
                            }
                          } catch (error) {
                            toast.error(
                              error instanceof Error
                                ? error.message
                                : "Could not leave that community.",
                            );
                          }
                        }}
                      >
                        <LogOut className="size-4" /> Leave server
                      </ContextMenuItem>
                    </>
                  ) : null}
                </ContextMenuContent>
              }
            >
              {server.iconUrl ? (
                <img
                  src={server.iconUrl}
                  alt=""
                  className="size-full object-cover"
                />
              ) : (
                <span className="flex size-full items-center justify-center bg-gradient-to-br from-brand to-cyan text-xs font-bold text-white">
                  {server.name.slice(0, 2).toUpperCase()}
                </span>
              )}
            </RailButton>
          ))
        )}

        <RailButton
          label="Create a community"
          active={false}
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="size-5" />
        </RailButton>
        <RailButton
          label="Explore communities"
          active={false}
          onClick={() => setDiscoverOpen(true)}
        >
          <Compass className="size-5" />
        </RailButton>
      </nav>

      <CreateCommunityDialog open={createOpen} onOpenChange={setCreateOpen} />
      <DiscoverDialog
        open={discoverOpen}
        onOpenChange={setDiscoverOpen}
        onJoin={(id) => navigate(`/dashboard/s/${id}`)}
      />

      {inviteServerId && (
        <InviteDialog
          serverId={inviteServerId}
          open
          onOpenChange={(open) => {
            if (!open) setInviteServerId(null);
          }}
        />
      )}
    </>
  );
}

function DiscoverDialog({
  open,
  onOpenChange,
  onJoin,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onJoin: (serverId: string) => void;
}) {
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const join = useMutation(api.servers.join);
  const [busyId, setBusyId] = useState<string | null>(null);
  const results = useQuery(api.servers.discover, { term: debounced });

  // Join first, then hand the id back: navigating straight to a server we
  // never joined made every server query throw "not a member" and crash the
  // page. Membership is what unlocks the route.
  const joinNow = async (serverId: string) => {
    if (busyId) return;
    setBusyId(serverId);
    try {
      await join({ serverId: serverId as Id<"servers"> });
      onJoin(serverId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not join.");
      setBusyId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Explore communities</DialogTitle>
          <DialogDescription>
            Public Kyro communities you can join right now — all free, no
            invites required.
          </DialogDescription>
        </DialogHeader>
        <Input
          autoFocus
          placeholder="Search communities…"
          value={term}
          onChange={(event) => {
            setTerm(event.target.value);
            window.setTimeout(() => setDebounced(event.target.value), 250);
          }}
        />
        <div className="grid max-h-[50vh] gap-2 overflow-y-auto sm:grid-cols-2">
          {results === undefined ? (
            <p className="text-sm text-muted-foreground">Searching…</p>
          ) : results.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No public communities matched that search. Why not create one?
            </p>
          ) : (
            results.map((server) => (
              <div
                key={server.id}
                className="flex items-center gap-3 rounded-xl border border-border/70 bg-surface p-3"
              >
                <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-brand to-cyan text-xs font-bold text-white">
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
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {server.name}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {server.memberCount} member
                    {server.memberCount === 1 ? "" : "s"}
                    {server.description ? ` · ${server.description}` : ""}
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() =>
                    server.isJoined || server.applyToJoin
                      ? onJoin(server.id)
                      : void joinNow(server.id)
                  }
                  disabled={busyId === server.id}
                >
                  {busyId === server.id ? (
                    <Loader2 className="mr-1.5 size-4 animate-spin" />
                  ) : null}
                  {server.isJoined
                    ? "Open"
                    : server.applyToJoin
                      ? "Apply"
                      : "Join"}
                </Button>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
