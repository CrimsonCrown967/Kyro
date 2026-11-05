import { useMutation, useQuery } from "convex/react";
import { Link2, MessageCircle, X } from "@/components/icons";
import { useNavigate, useSearchParams } from "react-router";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ProfileDecorationLayer } from "@/components/app/DecorationArt";
import { BadgeTray, CommunityRoleChips } from "@/components/app/GlobalBadges";
import { ServerTagChip } from "@/components/app/ServerTag";
import { StyledDisplayName } from "@/components/app/StyledDisplayName";
import { PresenceDot, UserAvatar } from "@/components/app/UserAvatar";
import { Button } from "@/components/ui/button";
import { findProfileTheme } from "@/lib/profileThemes";
import { toast } from "sonner";

export function UserPreviewPanel() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const userId = params.get("previewUser");
  const serverId = params.get("previewServer");
  const profile = useQuery(
    api.users.profile,
    userId
      ? {
          userId: userId as Id<"users">,
          ...(serverId ? { serverId: serverId as Id<"servers"> } : {}),
        }
      : "skip",
  );
  const me = useQuery(api.users.me);
  const createDirect = useMutation(api.conversations.createDirect);

  if (!userId) return null;

  const close = () => {
    const next = new URLSearchParams(params);
    next.delete("previewUser");
    next.delete("previewServer");
    setParams(next, { replace: true });
  };

  const openFull = () => {
    const next = new URLSearchParams(params);
    next.delete("previewUser");
    next.delete("previewServer");
    next.set("user", userId);
    if (serverId) next.set("profileServer", serverId);
    setParams(next, { replace: true });
  };

  const message = async () => {
    try {
      const conversationId = await createDirect({
        userId: userId as Id<"users">,
      });
      close();
      navigate(`/dashboard/dm/${conversationId}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not open DM.",
      );
    }
  };

  const user = profile?.user;
  const theme = findProfileTheme(user?.profileTheme);

  return (
    <>
      <button
        type="button"
        aria-label="Close user preview"
        onClick={close}
        className="fixed inset-0 z-40 bg-black/40 lg:hidden"
      />
      <aside
        className="user-preview-enter fixed inset-x-3 bottom-3 z-40 flex max-h-[calc(100dvh-1.5rem)] flex-col overflow-hidden rounded-xl border border-primary/70 bg-popover shadow-[0_26px_80px_rgba(0,0,0,.58)] md:inset-x-auto md:bottom-auto md:right-4 md:top-[4.5rem] md:w-[23rem] lg:right-[21.5rem]"
        style={
          theme
            ? {
                background: `linear-gradient(180deg, color-mix(in oklab, ${theme.solid} 38%, var(--background)), color-mix(in oklab, ${theme.solid} 18%, var(--background)))`,
              }
            : undefined
        }
      >
        <ProfileDecorationLayer decorationId={user?.profileDecoration} />
        <button
          type="button"
          aria-label="Close preview"
          onClick={close}
          className="absolute right-3 top-3 z-30 rounded-full bg-black/40 p-2 text-white hover:bg-black/60"
        >
          <X className="size-4" />
        </button>

        {user ? (
          <>
            <div className="relative z-10 h-36 shrink-0 overflow-hidden bg-zinc-950">
              {user.bannerUrl ? (
                <img
                  src={user.bannerUrl}
                  alt=""
                  className="size-full object-cover"
                />
              ) : theme ? (
                <div
                  className={`size-full bg-gradient-to-br ${theme.gradient}`}
                />
              ) : (
                <div className="size-full bg-[radial-gradient(circle_at_30%_10%,#334155,#111827_60%,#030712)]" />
              )}
              <span className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/65 to-transparent" />
            </div>

            <div className="relative z-10 -mt-11 flex min-h-0 flex-1 flex-col px-5 pb-5">
              <div className="flex items-end justify-between gap-3">
                <span className="w-fit rounded-full bg-popover p-1 ring-1 ring-border">
                  <UserAvatar user={user} size="xl" />
                </span>
                <BadgeTray
                  badges={user.badges}
                  primaryBadge={user.primaryBadge}
                  official={user.official}
                  className="mb-1 max-w-[min(13rem,68%)]"
                />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <StyledDisplayName user={user} className="text-2xl" />
                {user.serverTag && (
                  <ServerTagChip tag={user.serverTag} ownerName={user.name} />
                )}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span>@{user.username ?? "no username"}</span>
                {user.pronouns && <span>· {user.pronouns}</span>}
                <PresenceDot
                  presence={user.presence}
                  size="xs"
                  ringClassName=""
                />
              </div>

              <div className="mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
                {user.bio && (
                  <section className="rounded-xl border border-border/70 bg-panel/65 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      About me
                    </p>
                    <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed">
                      {user.bio}
                    </p>
                  </section>
                )}

                <section className="p-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Member since
                  </p>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm font-medium">
                    <span>
                      {user.memberSince
                        ? new Date(user.memberSince).toLocaleDateString(
                            undefined,
                            {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            },
                          )
                        : "Unknown"}
                    </span>
                    {profile.serverJoinedAt ? (
                      <span>
                        {new Date(profile.serverJoinedAt).toLocaleDateString(
                          undefined,
                          { month: "short", day: "numeric", year: "numeric" },
                        )}
                      </span>
                    ) : null}
                  </div>
                </section>

                {profile.serverRoles.length > 0 ? (
                  <section className="p-1">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Roles
                    </p>
                    <CommunityRoleChips
                      roles={profile.serverRoles}
                      className="mt-2"
                    />
                  </section>
                ) : null}

                {profile.mutualServers.length > 0 && (
                  <section className="rounded-xl border border-border/70 bg-panel/65 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Mutual communities · {profile.mutualServers.length}
                    </p>
                    <p className="mt-1.5 text-sm">
                      {profile.mutualServers
                        .map((server) => server.name)
                        .join(", ")}
                    </p>
                  </section>
                )}

                {user.links.length > 0 && (
                  <section className="rounded-xl border border-border/70 bg-panel/65 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Links
                    </p>
                    <div className="mt-2 space-y-1.5">
                      {user.links.map((link) => (
                        <a
                          key={`${link.label}-${link.url}`}
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 rounded-lg bg-background/50 px-2.5 py-2 text-sm hover:text-primary"
                        >
                          <Link2 className="size-4" /> {link.label}
                        </a>
                      ))}
                    </div>
                  </section>
                )}
              </div>

              <div className="mt-4 grid gap-2">
                {me?.id !== userId && (
                  <Button onClick={() => void message()}>
                    <MessageCircle className="mr-1.5 size-4" /> Message
                  </Button>
                )}
                <Button variant="outline" onClick={openFull}>
                  View full profile
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="relative z-10 flex h-full items-center justify-center text-sm text-muted-foreground">
            Loading profile…
          </div>
        )}
      </aside>
    </>
  );
}
