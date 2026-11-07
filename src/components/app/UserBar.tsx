import { useMutation, useQuery } from "convex/react";
import {
  Copy,
  LogOut,
  Pencil,
  Settings,
  ShieldCheck,
  User,
  UserPlus,
  Volume2,
  VolumeX,
} from "@/components/icons";
import { api } from "@/convex/_generated/api";
import { DeviceBadge, UserAvatar } from "@/components/app/UserAvatar";
import { ServerTagChip } from "@/components/app/ServerTag";
import { BadgeTray } from "@/components/app/GlobalBadges";
import { StyledDisplayName } from "@/components/app/StyledDisplayName";
import { useAuth } from "@/hooks/use-auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useUiStore, type StatusChoice } from "@/lib/store";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { rememberAccount } from "@/lib/accounts";

const STATUS_OPTIONS: {
  value: StatusChoice;
  label: string;
  hint: string;
  color: string;
}[] = [
  {
    value: "online",
    label: "Online",
    hint: "Everyone sees you as available.",
    color: "#22c55e",
  },
  {
    value: "idle",
    label: "Idle",
    hint: "Away from the keyboard.",
    color: "#f59e0b",
  },
  {
    value: "dnd",
    label: "Do not disturb",
    hint: "You're here, but please don't ping.",
    color: "#ef4444",
  },
  {
    value: "invisible",
    label: "Invisible",
    hint: "Appear offline to everyone else.",
    color: "#94a3b8",
  },
];

/** Bottom-of-sidebar panel: who you are, your presence and settings.
 *  Kyro v1 has no voice transport, so there are deliberately no decorative
 *  mic/deafen buttons here.
 */
export function UserBar({ onOpenSettings }: { onOpenSettings?: () => void }) {
  const me = useQuery(api.users.me);
  const updateProfile = useMutation(api.users.updateProfile);
  const setPresence = useMutation(api.users.setPresence);
  const { signOut } = useAuth();
  const [statusDraft, setStatusDraft] = useState("");
  const notificationSounds = useUiStore((state) => state.notificationSounds);
  const setPreference = useUiStore((state) => state.setPreference);
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();

  if (!me) return null;

  const isStaff =
    me.role === "admin" || me.isFounder || me.badges.includes("moderator");

  const saveStatus = async () => {
    try {
      await updateProfile({ customStatus: statusDraft });
      toast.success(
        statusDraft.trim() ? "Custom status set" : "Custom status cleared",
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not set your status.",
      );
    }
  };

  return (
    <div className="border-t border-border/70 bg-panel p-2">
      {/* Non-modal so closing the status menu never leaves an invisible
          pointer-events guard behind — that guard is what forced a second
          click before the chat box accepted focus. */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left hover:bg-sidebar-accent/80">
            <UserAvatar user={me} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <StyledDisplayName
                  user={me}
                  className="truncate text-sm leading-tight"
                />
                {me.serverTag && (
                  <ServerTagChip tag={me.serverTag} ownerName={me.name} />
                )}
                <DeviceBadge device={me.device} />
              </span>
              <span className="block truncate text-xs leading-tight text-muted-foreground">
                {me.customStatus || `@${me.username ?? "new"}`}
              </span>
            </span>
            <Settings className="size-4 shrink-0 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          side="top"
          sideOffset={10}
          className="w-[min(20.5rem,calc(100vw-1rem))] overflow-hidden border-primary/50 bg-popover p-0 shadow-[0_22px_70px_rgba(0,0,0,.55)] ring-1 ring-primary/35"
          onCloseAutoFocus={(event) => event.preventDefault()}
          // Keep keystrokes inside the draft field from driving menu typeahead
          // or stealing focus away mid-sentence.
          onKeyDown={(event) => event.stopPropagation()}
        >
          <div className="relative h-24 overflow-hidden bg-[linear-gradient(135deg,#111827,#27378f_62%,#4f5dff)]">
            {me.bannerUrl ? (
              <img
                src={me.bannerUrl}
                alt=""
                className="absolute inset-0 size-full object-cover"
              />
            ) : null}
            <span className="absolute inset-0 bg-gradient-to-t from-black/55 to-transparent" />
            <BadgeTray
              badges={me.badges}
              primaryBadge={me.primaryBadge}
              official={me.official}
              className="absolute right-3 top-3 z-10"
            />
          </div>
          <div className="relative px-4 pb-3">
            <button
              type="button"
              aria-label="View my profile"
              onClick={() => {
                const next = new URLSearchParams(params);
                next.set("user", me.id);
                setParams(next, { replace: false });
              }}
              className="-mt-9 block rounded-full bg-popover p-1 ring-1 ring-border"
            >
              <UserAvatar user={me} size="lg" />
            </button>
            <div className="mt-2 flex min-w-0 items-center gap-1.5">
              <StyledDisplayName user={me} className="truncate text-xl" />
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              @{me.username ?? "new"}
              {me.pronouns ? ` · ${me.pronouns}` : ""}
            </p>
            {me.bio ? (
              <p className="mt-3 line-clamp-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground/85">
                {me.bio}
              </p>
            ) : null}
          </div>
          <DropdownMenuSeparator className="mx-0" />
          <DropdownMenuLabel className="flex items-center justify-between px-3 text-xs text-muted-foreground">
            Set status
            <span className="font-normal normal-case text-muted-foreground/70">
              {me.presence === "invisible" ? "Hidden" : "Visible"}
            </span>
          </DropdownMenuLabel>
          {STATUS_OPTIONS.map((option) => {
            const active = me.presence === option.value;
            return (
              <DropdownMenuItem
                key={option.value}
                className="gap-2"
                onSelect={(event) => {
                  event.preventDefault();
                  void setPresence({ status: option.value }).catch((error) =>
                    console.error(error),
                  );
                }}
              >
                <span
                  aria-hidden
                  className="size-2.5 shrink-0 rounded-full ring-2 ring-inset ring-black/10"
                  style={{ backgroundColor: option.color }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm leading-tight">
                    {option.label}
                  </span>
                  <span className="block truncate text-[11px] leading-tight text-muted-foreground">
                    {option.hint}
                  </span>
                </span>
                {active && (
                  <span className="shrink-0 text-xs text-primary">✓</span>
                )}
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator />
          <div className="px-2 py-1.5">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void saveStatus();
              }}
              className="flex items-center gap-1.5"
            >
              <Input
                value={statusDraft}
                onChange={(event) => setStatusDraft(event.target.value)}
                onKeyDown={(event) => event.stopPropagation()}
                placeholder="Set a custom status"
                maxLength={100}
                className="h-8 text-xs"
                aria-label="Custom status"
              />
              <button
                type="submit"
                className="shrink-0 rounded-md border border-border/70 px-2 py-1.5 text-xs text-muted-foreground hover:bg-surface hover:text-foreground"
              >
                Save
              </button>
            </form>
            {me.customStatus && (
              <button
                type="button"
                onClick={() => {
                  setStatusDraft("");
                  void updateProfile({ customStatus: "" })
                    .then(() => toast.success("Custom status cleared"))
                    .catch((error) =>
                      toast.error(
                        error instanceof Error
                          ? error.message
                          : "Could not clear your status.",
                      ),
                    );
                }}
                className="mt-1 text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                Clear current status
              </button>
            )}
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() =>
              setPreference("notificationSounds", !notificationSounds)
            }
            onSelect={(event) => event.preventDefault()}
          >
            {notificationSounds ? (
              <Volume2 className="size-4" />
            ) : (
              <VolumeX className="size-4" />
            )}
            Notification sounds
            <Switch
              checked={notificationSounds}
              onCheckedChange={(checked) =>
                setPreference("notificationSounds", checked)
              }
              onClick={(event) => event.stopPropagation()}
              className="ml-auto"
              aria-label="Notification sounds"
            />
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              void navigator.clipboard
                .writeText(me.id)
                .then(() => toast.success("User ID copied."))
                .catch(() => toast.error("Could not copy your user ID."));
            }}
          >
            <Copy className="size-4" /> Copy user ID
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              const next = new URLSearchParams(params);
              next.set("user", me.id);
              setParams(next, { replace: false });
            }}
          >
            <User className="size-4" /> View my profile
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onOpenSettings}>
            <Pencil className="size-4" /> Edit profile
          </DropdownMenuItem>
          {isStaff && (
            <DropdownMenuItem
              className="text-brand focus:text-brand"
              onClick={() => navigate("/dashboard/admin")}
            >
              <ShieldCheck className="size-4" /> Admin portal
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onClick={() => {
              if (me.email) {
                rememberAccount({
                  email: me.email,
                  name: me.name,
                  username: me.username ?? undefined,
                  avatarUrl: me.avatarUrl,
                });
              }
              void signOut().then(() =>
                navigate("/auth?switch=1&returnTo=/dashboard"),
              );
            }}
          >
            <UserPlus className="size-4" /> Switch account
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void signOut()}>
            <LogOut className="size-4" /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
