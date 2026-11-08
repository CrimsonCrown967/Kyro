import { useMutation, useQuery } from "convex/react";
import {
  Ban,
  Copy,
  LogOut,
  MessageCircle,
  Pencil,
  UserCheck,
  UserPlus,
  UserX,
} from "@/components/icons";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { UserAvatar, DeviceBadge } from "@/components/app/UserAvatar";
import { ServerTagChip } from "@/components/app/ServerTag";
import { StyledDisplayName } from "@/components/app/StyledDisplayName";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { PresenceState } from "@/lib/format";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";

type Member = {
  user: {
    id: string;
    name: string;
    username: string | null;
    avatarUrl: string | null;
    presence: PresenceState;
    customStatus: string | null;
    isFounder?: boolean;
    official?: boolean;
    /** Global badges (hydrated server-side) — chosen/highest shown inline. */
    badges?: string[];
    /** The badge this member picked to show next to their name. */
    primaryBadge?: string | null;
    /** Community tag worn next to the name, e.g. "HTML". */
    serverTag?: string | null;
    /** Device this member is on, for the platform indicator. */
    device?: string | null;
    displayNameFont?: string | null;
    displayNameColorMode?: "none" | "solid" | "gradient" | null;
    displayNameColor?: string | null;
    displayNameColor2?: string | null;
  };
  nickname: string | null;
  isOwner: boolean;
  topRoleColor: string | null;
  topRoleName: string;
  topHoistedRoleName: string | null;
};

/** Right-hand roster for a community. Clicking someone opens their profile. */
export function MemberList({ serverId }: { serverId: string }) {
  const data = useQuery(api.servers.members, {
    serverId: serverId as Id<"servers">,
  });
  const me = useQuery(api.users.me);
  const social = useQuery(api.social.list);
  const createDirect = useMutation(api.conversations.createDirect);
  const sendRequest = useMutation(api.social.sendRequest);
  const respond = useMutation(api.social.respond);
  const cancel = useMutation(api.social.cancel);
  const removeFriend = useMutation(api.social.removeFriend);
  const block = useMutation(api.social.block);
  const unblock = useMutation(api.social.unblock);
  const setNickname = useMutation(api.servers.setNickname);
  const kickMember = useMutation(api.servers.kick);
  const banMember = useMutation(api.servers.ban);
  const [nicknameTarget, setNicknameTarget] = useState<{
    id: string;
    name: string;
    nickname: string;
  } | null>(null);
  const [nicknameDraft, setNicknameDraft] = useState("");
  const [, setParams] = useSearchParams();
  const navigate = useNavigate();

  const openProfile = (userId: string) => {
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set("previewUser", userId);
      next.set("previewServer", serverId);
      return next;
    });
  };

  const run = async (action: Promise<unknown>, success?: string) => {
    try {
      await action;
      if (success) toast.success(success);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That didn't work.");
    }
  };

  const openMessage = (userId: string) =>
    run(
      createDirect({ userId: userId as Id<"users"> }).then((conversationId) =>
        navigate(`/dashboard/dm/${conversationId}`),
      ),
    );

  if (data === undefined) {
    return (
      <aside className="hidden w-[20.5rem] shrink-0 border-l border-border/70 bg-panel p-4 text-sm text-muted-foreground lg:block">
        Loading members…
      </aside>
    );
  }

  const groupedOnline = new Map<string, Member[]>();
  for (const member of data.online) {
    const label = member.isOwner
      ? "Owner"
      : (member.topHoistedRoleName ?? "Online");
    const group = groupedOnline.get(label) ?? [];
    group.push(member);
    groupedOnline.set(label, group);
  }

  const row = (member: Member) => {
    const targetId = member.user.id;
    const isSelf = me?.id === targetId;
    const incoming = social?.incoming.find(
      (entry) => entry.user?.id === targetId,
    );
    const outgoing = social?.outgoing.find(
      (entry) => entry.user?.id === targetId,
    );
    const isFriend = (social?.friends ?? []).some(
      (friend) => friend.id === targetId,
    );
    const isBlocked = (social?.blocked ?? []).some(
      (entry) => entry.user?.id === targetId,
    );
    const canManageNickname =
      isSelf || hasPermission(data.myPermissions, PERMISSIONS.MANAGE_ROLES);
    const canKick =
      !isSelf &&
      !member.isOwner &&
      hasPermission(data.myPermissions, PERMISSIONS.KICK_MEMBERS);
    const canBan =
      !isSelf &&
      !member.isOwner &&
      hasPermission(data.myPermissions, PERMISSIONS.BAN_MEMBERS);
    return (
      <ContextMenu key={targetId}>
        <ContextMenuTrigger asChild>
          {/* A div (not a button) because the tag chip inside is its own
              button — nested buttons are invalid HTML and made clicks miss. */}
          <div
            role="button"
            tabIndex={0}
            aria-label={`Open ${member.nickname ?? member.user.name}'s profile`}
            data-profile-user={targetId}
            onClick={() => openProfile(targetId)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openProfile(targetId);
              }
            }}
            className="flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-surface/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <UserAvatar user={member.user} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <StyledDisplayName
                  user={member.user}
                  name={member.nickname ?? member.user.name}
                  roleColor={member.topRoleColor}
                  className="truncate text-[15px] font-semibold"
                />
                {member.user.serverTag && (
                  <ServerTagChip
                    tag={member.user.serverTag}
                    ownerName={member.user.name}
                  />
                )}
                <DeviceBadge device={member.user.device} />
              </span>
              {member.user.customStatus && (
                <span className="block truncate text-xs text-muted-foreground">
                  {member.user.customStatus}
                </span>
              )}
            </span>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-56">
          <ContextMenuItem onClick={() => openProfile(targetId)}>
            <UserAvatar user={member.user} size="xs" />
            View profile
          </ContextMenuItem>
          {canManageNickname ? (
            <ContextMenuItem
              onClick={() => {
                setNicknameDraft(member.nickname ?? "");
                setNicknameTarget({
                  id: targetId,
                  name: member.user.name,
                  nickname: member.nickname ?? "",
                });
              }}
            >
              <Pencil className="size-4" /> Change nickname
            </ContextMenuItem>
          ) : null}
          {!isSelf && (
            <>
              <ContextMenuItem onClick={() => void openMessage(targetId)}>
                <MessageCircle className="size-4" /> Message
              </ContextMenuItem>
              <ContextMenuSeparator />
              {incoming ? (
                <>
                  <ContextMenuItem
                    onClick={() =>
                      void run(
                        respond({
                          connectionId:
                            incoming.connectionId as Id<"connections">,
                          accept: true,
                        }),
                        "You are now friends.",
                      )
                    }
                  >
                    <UserCheck className="size-4" /> Accept friend request
                  </ContextMenuItem>
                  <ContextMenuItem
                    onClick={() =>
                      void run(
                        respond({
                          connectionId:
                            incoming.connectionId as Id<"connections">,
                          accept: false,
                        }),
                        "Request ignored.",
                      )
                    }
                  >
                    <UserX className="size-4" /> Ignore request
                  </ContextMenuItem>
                </>
              ) : outgoing ? (
                <ContextMenuItem
                  onClick={() =>
                    void run(
                      cancel({
                        connectionId:
                          outgoing.connectionId as Id<"connections">,
                      }),
                      "Request cancelled.",
                    )
                  }
                >
                  <UserX className="size-4" /> Cancel friend request
                </ContextMenuItem>
              ) : isFriend ? (
                <ContextMenuItem
                  onClick={() =>
                    void run(
                      removeFriend({ userId: targetId as Id<"users"> }),
                      "Friend removed.",
                    )
                  }
                >
                  <UserX className="size-4" /> Remove friend
                </ContextMenuItem>
              ) : (
                <ContextMenuItem
                  onClick={() =>
                    void run(
                      sendRequest({ userId: targetId as Id<"users"> }),
                      "Friend request sent.",
                    )
                  }
                >
                  <UserPlus className="size-4" /> Add friend
                </ContextMenuItem>
              )}
              <ContextMenuItem
                onClick={() =>
                  void run(
                    isBlocked
                      ? unblock({ userId: targetId as Id<"users"> })
                      : block({ userId: targetId as Id<"users"> }),
                    isBlocked ? "User unblocked." : "User blocked.",
                  )
                }
              >
                <UserX className="size-4" /> {isBlocked ? "Unblock" : "Block"}
              </ContextMenuItem>
              <ContextMenuSeparator />
            </>
          )}
          {canKick || canBan ? (
            <>
              {canKick ? (
                <ContextMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => {
                    if (!window.confirm(`Kick ${member.user.name}?`)) return;
                    void run(
                      kickMember({
                        serverId: serverId as Id<"servers">,
                        userId: targetId as Id<"users">,
                      }),
                      `${member.user.name} was kicked.`,
                    );
                  }}
                >
                  <LogOut className="size-4" /> Kick member
                </ContextMenuItem>
              ) : null}
              {canBan ? (
                <ContextMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => {
                    if (!window.confirm(`Ban ${member.user.name}?`)) return;
                    void run(
                      banMember({
                        serverId: serverId as Id<"servers">,
                        userId: targetId as Id<"users">,
                      }),
                      `${member.user.name} was banned.`,
                    );
                  }}
                >
                  <Ban className="size-4" /> Ban member
                </ContextMenuItem>
              ) : null}
              <ContextMenuSeparator />
            </>
          ) : null}
          <ContextMenuItem
            onClick={() => {
              void navigator.clipboard
                .writeText(member.user.username ?? member.user.name)
                .then(() => toast.success("Username copied."))
                .catch(() => toast.error("Couldn't copy the username."));
            }}
          >
            <Copy className="size-4" /> Copy username
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => {
              void navigator.clipboard
                .writeText(targetId)
                .then(() => toast.success("User ID copied."))
                .catch(() => toast.error("Couldn't copy the user ID."));
            }}
          >
            <Copy className="size-4" /> Copy user ID
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  };

  return (
    <>
      <aside className="hidden w-[20.5rem] shrink-0 flex-col border-l border-border/70 bg-panel lg:flex">
        <div
          aria-hidden
          className="h-[3.75rem] shrink-0 border-b border-border/70"
        />
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-5">
          {[...groupedOnline.entries()].map(([label, members]) => (
            <section key={label} className="mb-4 last:mb-0">
              <p className="mb-1.5 px-2 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                {label} — {members.length}
              </p>
              <div className="space-y-0.5">{members.map(row)}</div>
            </section>
          ))}
          {data.offline.length > 0 ? (
            <section className="mt-4">
              <p className="mb-1.5 px-2 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                Offline — {data.offline.length}
              </p>
              <div className="space-y-0.5 opacity-55">
                {data.offline.map(row)}
              </div>
            </section>
          ) : null}
          {data.online.length === 0 && data.offline.length === 0 ? (
            <p className="px-2 py-4 text-xs text-muted-foreground">
              No members yet.
            </p>
          ) : null}
        </div>
        <p className="border-t border-border/60 px-4 py-2 text-[11px] text-muted-foreground">
          {data.online.length + data.offline.length} member
          {data.online.length + data.offline.length === 1 ? "" : "s"}
        </p>
      </aside>
      <Dialog
        open={nicknameTarget !== null}
        onOpenChange={(open) => {
          if (!open) setNicknameTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Change nickname</DialogTitle>
            <DialogDescription>
              Set how {nicknameTarget?.name ?? "this member"} appears in this
              community. Leave it empty to clear it.
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={nicknameDraft}
            onChange={(event) => setNicknameDraft(event.target.value)}
            maxLength={64}
            placeholder={nicknameTarget?.name ?? "Nickname"}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNicknameTarget(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!nicknameTarget) return;
                void run(
                  setNickname({
                    serverId: serverId as Id<"servers">,
                    userId: nicknameTarget.id as Id<"users">,
                    nickname: nicknameDraft.trim() || undefined,
                  }),
                  "Nickname updated.",
                ).then(() => setNicknameTarget(null));
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
