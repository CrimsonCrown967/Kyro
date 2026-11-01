import { useMutation, useQuery } from "convex/react";
import {
  Ban,
  Check,
  Clock,
  Copy,
  Link2,
  MessageCircle,
  Settings,
  Sparkles,
  UserPlus,
  Users,
  X,
} from "@/components/icons";
import { useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  DeviceBadge,
  PresenceDot,
  UserAvatar,
} from "@/components/app/UserAvatar";
import { StyledDisplayName } from "@/components/app/StyledDisplayName";
import { ProfileDecorationLayer } from "@/components/app/DecorationArt";
import { ServerTagChip } from "@/components/app/ServerTag";
import {
  GlobalBadgeIcon,
  GlobalBadges,
  GLOBAL_BADGE_META,
  GRANTABLE_BADGES,
  InlineBadge,
} from "@/components/app/GlobalBadges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { findFrame } from "@/lib/frames";
import { findProfileTheme } from "@/lib/profileThemes";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PRESENCE_META, formatRelative } from "@/lib/format";

/**
 * User profile popup. Opened anywhere by adding `?user=<id>` to the current
 * URL; it closes itself by removing the parameter again.
 *
 * Layout mirrors a member card: the banner is the top edge of the dialog, the
 * avatar straddles its bottom edge, and the profile details sit in stacked
 * cards underneath. Actions live in a fixed footer so they never scroll away.
 */
export function ProfileCard() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const userId = params.get("user");
  const [busy, setBusy] = useState(false);
  const me = useQuery(api.users.me);

  const profile = useQuery(
    api.users.profile,
    userId ? { userId: userId as Id<"users"> } : "skip",
  );
  const social = useQuery(
    api.social.mutualContext,
    userId ? { userId: userId as Id<"users"> } : "skip",
  );
  const lists = useQuery(api.social.list);

  const sendRequest = useMutation(api.social.sendRequest);
  const respond = useMutation(api.social.respond);
  const cancel = useMutation(api.social.cancel);
  const removeFriend = useMutation(api.social.removeFriend);
  const block = useMutation(api.social.block);
  const unblock = useMutation(api.social.unblock);
  const createDirect = useMutation(api.conversations.createDirect);
  const setBadges = useMutation(api.users.setBadges);
  const removeAdminBadge = useMutation(api.users.removeMyAdminBadge);
  const restoreAdminBadge = useMutation(api.admin.restoreMyAdminBadge);
  const warn = useMutation(api.warnings.warn);
  const [warnReason, setWarnReason] = useState("");

  const close = (open: boolean) => {
    if (open) return;
    const next = new URLSearchParams(params);
    next.delete("user");
    setParams(next, { replace: true });
  };

  const run = async (action: Promise<unknown>, successMessage?: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await action;
      if (successMessage) toast.success(successMessage);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Something went wrong.",
      );
    } finally {
      setBusy(false);
    }
  };

  const openMessage = async () => {
    if (!userId) return;
    await run(
      createDirect({ userId: userId as Id<"users"> }).then((conversationId) => {
        close(false);
        navigate(`/dashboard/dm/${conversationId}`);
      }),
    );
  };

  if (!userId) return null;

  const isSelf = Boolean(me && me.id === userId);

  /** Your own profile offers settings instead of friend/block controls. */
  const openSettings = () => {
    const next = new URLSearchParams(params);
    next.delete("user");
    next.set("settings", "1");
    setParams(next, { replace: true });
  };

  const user = profile?.user;
  const incoming = lists?.incoming.find((row) => row.user?.id === userId);
  const outgoing = lists?.outgoing.find((row) => row.user?.id === userId);
  const isFriend = social?.friendship === "accepted";
  const isBlocked = (lists?.blocked ?? []).some(
    (row) => row.user?.id === userId,
  );
  /** Only site admins can grant or revoke global badges. */
  const canManageBadges = Boolean(me && (me.role === "admin" || me.isFounder));
  const presenceMeta = user
    ? PRESENCE_META[(user.presence as keyof typeof PRESENCE_META) ?? "offline"]
    : null;
  const profileTheme = findProfileTheme(user?.profileTheme);
  const frame = findFrame(user?.avatarFrame);

  return (
    <Dialog open onOpenChange={close}>
      <DialogContent
        overlayClassName="data-[state=closed]:duration-0"
        style={
          profileTheme
            ? {
                background: `linear-gradient(180deg, color-mix(in oklab, ${profileTheme.solid} 48%, var(--background)), color-mix(in oklab, ${profileTheme.solid} 28%, var(--background)))`,
              }
            : undefined
        }
        className={cn(
          "relative isolate flex max-h-[92vh] w-[calc(100vw-1.5rem)] flex-col gap-0 overflow-hidden rounded-2xl border-border/70 bg-background p-0 sm:max-w-[36rem]",
          // Unmount instantly on close so the next member-sidebar click isn't
          // swallowed by the fading backdrop.
          "data-[state=closed]:duration-0",
          // Radix's close button floats over the banner — keep it legible on
          // every banner (including bright photos) with a translucent coin.
          "[&>button[data-slot=dialog-close]]:right-4 [&>button[data-slot=dialog-close]]:top-4 [&>button[data-slot=dialog-close]]:rounded-full [&>button[data-slot=dialog-close]]:bg-black/45 [&>button[data-slot=dialog-close]]:p-1.5 [&>button[data-slot=dialog-close]]:text-white [&>button[data-slot=dialog-close]]:opacity-90 [&>button[data-slot=dialog-close]]:shadow-sm [&>button[data-slot=dialog-close]]:hover:bg-black/65 [&>button[data-slot=dialog-close]]:hover:opacity-100",
        )}
      >
        <ProfileDecorationLayer decorationId={user?.profileDecoration} />
        <div className="relative z-10 min-h-0 flex-1 overflow-y-auto">
          {user ? (
            <>
              {/* Banner is the top edge of the card — the avatar overlaps it. */}
              <div className="relative h-44 w-full overflow-hidden bg-zinc-950 sm:h-52">
                {user.bannerUrl ? (
                  <img
                    src={user.bannerUrl}
                    alt=""
                    className="absolute inset-0 size-full object-cover"
                  />
                ) : profileTheme ? (
                  <div
                    aria-hidden
                    className={cn(
                      "absolute inset-0 bg-gradient-to-br",
                      profileTheme.gradient,
                    )}
                  />
                ) : (
                  <div
                    aria-hidden
                    className="absolute inset-0 bg-[radial-gradient(circle_at_25%_15%,#2b3446_0%,#11151d_55%,#05070a_100%)]"
                  />
                )}
                {!user.bannerUrl && (
                  <span
                    aria-hidden
                    className="absolute inset-0 flex items-center justify-center px-6 text-center text-2xl font-black uppercase leading-tight tracking-[0.18em] text-white/15 sm:text-3xl"
                  >
                    {user.name}
                  </span>
                )}
                <span
                  aria-hidden
                  className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/60 to-transparent"
                />
              </div>

              <div className="relative px-5 pb-5">
                <div className="-mt-14 sm:-mt-16">
                  <span className="inline-flex rounded-full bg-background p-1.5 shadow-lg ring-1 ring-border/70">
                    <UserAvatar user={user} size="2xl" />
                  </span>
                </div>

                <DialogHeader className="mt-3 space-y-1 text-left">
                  <DialogTitle className="flex flex-wrap items-center gap-x-2 gap-y-1 text-2xl font-bold leading-tight sm:text-3xl">
                    <StyledDisplayName user={user} className="break-words" />
                    <InlineBadge
                      badges={user.badges}
                      primaryBadge={user.primaryBadge}
                      size="size-4"
                    />
                    {user.badges.length > 1 && (
                      <span
                        title={`${user.badges.length} badges`}
                        className="inline-flex size-5 items-center justify-center rounded-full bg-surface text-[10px] font-bold text-muted-foreground ring-1 ring-border/70"
                      >
                        {user.badges.length}
                      </span>
                    )}
                  </DialogTitle>
                  <DialogDescription className="sr-only">
                    {user.name}'s profile
                  </DialogDescription>
                </DialogHeader>

                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm text-muted-foreground">
                  <span className="font-medium text-foreground/90">
                    @{user.username ?? "no username yet"}
                  </span>
                  {user.pronouns && (
                    <>
                      <span aria-hidden className="text-border">
                        |
                      </span>
                      <span>{user.pronouns}</span>
                    </>
                  )}
                  {user.serverTag && (
                    <ServerTagChip
                      tag={user.serverTag}
                      ownerName={user.name}
                      className="text-[10px]"
                    />
                  )}
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <PresenceDot
                    presence={user.presence}
                    size="xs"
                    ringClassName=""
                  />
                  <span>{user.customStatus || presenceMeta?.label}</span>
                  <DeviceBadge device={user.device} />
                  {user.lastSeen != null && (
                    <span className="text-muted-foreground/80">
                      · last seen {formatRelative(user.lastSeen)}
                    </span>
                  )}
                </div>

                <div className="mt-4 space-y-2.5">
                  {/* Profile style: the frame and theme this member wears. */}
                  {(frame || profileTheme) && (
                    <ProfileSection
                      label="Profile style"
                      icon={<Sparkles className="size-3.5" />}
                    >
                      <div className="grid grid-cols-2 gap-2">
                        {frame && (
                          <div className="flex flex-col items-center gap-2 rounded-lg border border-border/60 bg-panel/60 p-3">
                            <span
                              className={cn(
                                "flex size-11 items-center justify-center rounded-full bg-gradient-to-br text-white shadow-inner",
                                frame.gradient,
                              )}
                            >
                              <Sparkles className="size-4" />
                            </span>
                            <span className="text-center text-[11px] font-medium leading-tight">
                              {frame.label}
                            </span>
                          </div>
                        )}
                        {profileTheme && (
                          <div className="flex flex-col items-center gap-2 rounded-lg border border-border/60 bg-panel/60 p-3">
                            <span
                              className={cn(
                                "size-11 rounded-full bg-gradient-to-br",
                                profileTheme.gradient,
                              )}
                            />
                            <span className="text-center text-[11px] font-medium leading-tight">
                              {profileTheme.label}
                            </span>
                          </div>
                        )}
                      </div>
                    </ProfileSection>
                  )}

                  <ProfileSection label="About me">
                    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90">
                      {user.bio || (
                        <span className="text-muted-foreground">
                          Nothing here yet.
                        </span>
                      )}
                    </p>
                  </ProfileSection>

                  {user.links.length > 0 && (
                    <ProfileSection
                      label="Links"
                      icon={<Link2 className="size-3.5" />}
                    >
                      <ul className="space-y-1">
                        {user.links.map((link) => (
                          <li key={`${link.label}:${link.url}`}>
                            <a
                              href={link.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="group flex items-center gap-2 rounded-md px-1 py-1.5 text-sm transition-colors hover:bg-panel"
                            >
                              <Link2 className="size-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
                              <span className="min-w-0 flex-1 truncate font-medium">
                                {link.label}
                              </span>
                              <span className="max-w-44 shrink-0 truncate text-xs text-muted-foreground">
                                {link.url.replace(/^https?:\/\//, "")}
                              </span>
                            </a>
                          </li>
                        ))}
                      </ul>
                    </ProfileSection>
                  )}

                  {user.memberSince != null && (
                    <ProfileSection
                      label="Kyro since"
                      icon={<Clock className="size-3.5" />}
                    >
                      <p className="text-sm font-medium">
                        {new Date(user.memberSince).toLocaleDateString(
                          undefined,
                          {
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                          },
                        )}
                      </p>
                    </ProfileSection>
                  )}

                  {profile && profile.mutualServers.length > 0 && (
                    <ProfileSection
                      label={`Mutual communities · ${profile.mutualServers.length}`}
                      icon={<Users className="size-3.5" />}
                    >
                      <div className="flex flex-wrap gap-1.5">
                        {profile.mutualServers.map((server) => (
                          <button
                            key={server.id}
                            type="button"
                            onClick={() => {
                              close(false);
                              navigate(`/dashboard/s/${server.id}`);
                            }}
                            className="rounded-md border border-border/70 bg-panel px-2 py-1 text-xs font-medium transition-colors hover:border-primary/50 hover:text-primary"
                          >
                            {server.name}
                          </button>
                        ))}
                      </div>
                    </ProfileSection>
                  )}

                  {/* Dedicated home for platform-wide badges — separate from
                      community roles, which live in each server. */}
                  <ProfileSection
                    label="Global badges"
                    icon={<Sparkles className="size-3.5" />}
                  >
                    <GlobalBadges badges={user.badges} />
                    {isSelf && me?.isFounder && (
                      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/60 pt-2.5">
                        <p className="min-w-0 flex-1 text-[11px] text-muted-foreground">
                          Founder only: your Admin badge can be hidden from this
                          profile. Staff powers stay active either way.
                        </p>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => {
                            const holdsAdmin = user.badges.includes("admin");
                            void run(
                              holdsAdmin
                                ? removeAdminBadge({})
                                : restoreAdminBadge({}),
                              holdsAdmin
                                ? "Admin badge hidden from your profile."
                                : "Admin badge restored.",
                            );
                          }}
                        >
                          {user.badges.includes("admin")
                            ? "Hide Admin badge"
                            : "Restore Admin badge"}
                        </Button>
                      </div>
                    )}

                    {canManageBadges && (
                      <div className="mt-3 border-t border-border/60 pt-3">
                        <p className="text-[11px] text-muted-foreground">
                          You're an admin — tap a badge to grant or revoke it.
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {GRANTABLE_BADGES.map((badge) => {
                            const granted = user.badges.includes(badge);
                            // Badge id → setBadges argument name (bughunter → bugHunter).
                            const field:
                              | "coFounder"
                              | "admin"
                              | "manager"
                              | "staff"
                              | "trialStaff"
                              | "moderator"
                              | "verified"
                              | "bugHunter"
                              | "vip"
                              | "og"
                              | "supporter"
                              | "donator"
                              | "partner" =
                              badge === "bughunter"
                                ? "bugHunter"
                                : badge === "cofounder"
                                  ? "coFounder"
                                  : badge === "trialstaff"
                                    ? "trialStaff"
                                    : badge;
                            return (
                              <button
                                key={badge}
                                type="button"
                                disabled={busy}
                                className={cn(
                                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-wide transition-opacity",
                                  "shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]",
                                  granted
                                    ? GLOBAL_BADGE_META[badge].chip
                                    : "border-border/70 bg-surface/40 text-muted-foreground hover:text-foreground",
                                  busy ? "opacity-60" : "",
                                )}
                                onClick={() => {
                                  void run(
                                    setBadges({
                                      userId: userId as Id<"users">,
                                      [field]: !granted,
                                    }),
                                    granted
                                      ? `${GLOBAL_BADGE_META[badge].label} badge removed.`
                                      : `${GLOBAL_BADGE_META[badge].label} badge granted.`,
                                  );
                                }}
                              >
                                <GlobalBadgeIcon badge={badge} />
                                {GLOBAL_BADGE_META[badge].label}
                                <span
                                  aria-hidden="true"
                                  className="text-[10px]"
                                >
                                  {granted ? "✓ grant" : "+ grant"}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <Input
                            value={warnReason}
                            onChange={(event) =>
                              setWarnReason(event.target.value)
                            }
                            placeholder="Warning reason…"
                            maxLength={300}
                            className="h-8 flex-1 text-xs"
                            aria-label="Warning reason"
                          />
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={busy || warnReason.trim().length < 3}
                            onClick={() => {
                              void run(
                                warn({
                                  userId: userId as Id<"users">,
                                  reason: warnReason.trim(),
                                }).then(() => setWarnReason("")),
                                "Warning issued — it counts for 3 days.",
                              );
                            }}
                          >
                            Warn
                          </Button>
                        </div>
                      </div>
                    )}
                  </ProfileSection>

                  <div className="flex items-center justify-end gap-1.5 pt-0.5 text-[10px] font-mono text-muted-foreground/60">
                    <span className="truncate">ID {user.id}</span>
                    <button
                      type="button"
                      aria-label="Copy user ID"
                      className="rounded p-1 transition-colors hover:bg-panel hover:text-foreground"
                      onClick={() => {
                        void navigator.clipboard
                          .writeText(user.id)
                          .then(() => toast.success("User ID copied."))
                          .catch(() => toast.error("Couldn't copy the ID."));
                      }}
                    >
                      <Copy className="size-3" />
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="space-y-4 p-6">
              <DialogHeader className="space-y-1 text-left">
                <DialogTitle className="text-xl">Loading profile…</DialogTitle>
                <DialogDescription>
                  Fetching this member's details.
                </DialogDescription>
              </DialogHeader>
              <div className="h-40 animate-pulse rounded-xl bg-surface" />
              <div className="h-8 w-1/2 animate-pulse rounded bg-surface" />
              <div className="h-20 animate-pulse rounded-xl bg-surface" />
            </div>
          )}
        </div>

        {/* Fixed footer: the primary action never scrolls out of view. */}
        <div className="relative z-10 shrink-0 border-t border-border/60 bg-background/95 p-4 backdrop-blur">
          {isSelf ? (
            <Button
              className="h-10 w-full text-sm font-semibold"
              onClick={openSettings}
            >
              <Settings className="mr-2 size-4" /> Edit profile
            </Button>
          ) : user ? (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-2">
                {incoming && (
                  <>
                    <Button
                      variant="ghost"
                      className="flex-1"
                      disabled={busy}
                      onClick={() =>
                        void run(
                          respond({
                            connectionId:
                              incoming.connectionId as Id<"connections">,
                            accept: false,
                          }),
                        )
                      }
                    >
                      <X className="mr-1.5 size-4" /> Ignore
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1"
                      disabled={busy}
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
                      <Check className="mr-1.5 size-4" /> Accept
                    </Button>
                  </>
                )}
                {outgoing && (
                  <Button
                    variant="outline"
                    className="flex-1"
                    disabled={busy}
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
                    <Clock className="mr-1.5 size-4" /> Cancel request
                  </Button>
                )}
                {!incoming && !outgoing && !isFriend && !isBlocked && (
                  <Button
                    variant="outline"
                    className="flex-1"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        sendRequest({ userId: userId as Id<"users"> }),
                        "Friend request sent.",
                      )
                    }
                  >
                    <UserPlus className="mr-1.5 size-4" /> Add friend
                  </Button>
                )}
                {isFriend && (
                  <Button
                    variant="ghost"
                    className="flex-1"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        removeFriend({ userId: userId as Id<"users"> }),
                        "Friend removed.",
                      )
                    }
                  >
                    Remove friend
                  </Button>
                )}
                {isBlocked ? (
                  <Button
                    variant="outline"
                    className="flex-1"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        unblock({ userId: userId as Id<"users"> }),
                        "User unblocked.",
                      )
                    }
                  >
                    Unblock
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    className="flex-1"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        block({ userId: userId as Id<"users"> }),
                        "User blocked.",
                      )
                    }
                  >
                    <Ban className="mr-1.5 size-4" /> Block
                  </Button>
                )}
              </div>

              {social && !social.canMessage && social.messageReason && (
                <p className="text-center text-xs text-muted-foreground">
                  {social.messageReason}
                </p>
              )}
              <Button
                className="h-10 w-full text-sm font-semibold"
                disabled={busy || (social ? !social.canMessage : false)}
                onClick={() => void openMessage()}
              >
                <MessageCircle className="mr-2 size-4" /> Message
              </Button>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** A titled card in the profile body — the reference's panel treatment. */
function ProfileSection({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border/70 bg-surface p-4">
      <h3 className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/80">
        {icon}
        {label}
      </h3>
      <div className="mt-2">{children}</div>
    </section>
  );
}
