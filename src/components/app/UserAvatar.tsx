import { Monitor, Smartphone, Tablet } from "@/components/icons";
import { cn } from "@/lib/utils";
import {
  seedColor,
  initials,
  PRESENCE_META,
  normalizePresence,
  DEVICE_META,
  type DeviceKind,
  type PresenceState,
} from "@/lib/format";
import { findFrame } from "@/lib/frames";
import { AvatarDecorationArt } from "@/components/app/DecorationArt";

export interface AvatarUser {
  id: string;
  name: string;
  username?: string | null;
  avatarUrl?: string | null;
  bannerUrl?: string | null;
  presence?: PresenceState;
  /** Built-in avatar frame id — rendered as a gradient ring when set. */
  avatarFrame?: string | null;
  /** Built-in decorative overlay rendered around the portrait. */
  avatarDecoration?: string | null;
}

const SIZES = {
  xs: "size-6 text-[9px]",
  sm: "size-8 text-[11px]",
  md: "size-10 text-sm",
  lg: "size-16 text-xl",
  xl: "size-24 text-3xl",
  /** Settings hero avatar — deliberately large so the profile preview reads. */
  "2xl": "size-32 text-5xl",
} as const;

/** Pixel size of the presence dot for each avatar size. */
const DOT_PX: Record<keyof typeof SIZES, number> = {
  xs: 7,
  sm: 10,
  md: 12,
  lg: 18,
  xl: 24,
  "2xl": 32,
};

/**
 * Presence dot. Colours are painted with an inline background (not only a
 * Tailwind token) so the dot stays visible even if a theme class is missing,
 * and the ring uses a solid surface colour so it reads on every background.
 */
export function PresenceDot({
  presence,
  size = "sm",
  ringClassName = "ring-panel",
  className,
}: {
  presence: PresenceState | string;
  size?: keyof typeof SIZES;
  ringClassName?: string;
  className?: string;
}) {
  const state = normalizePresence(presence);
  const meta = PRESENCE_META[state];
  const px = DOT_PX[size];

  return (
    <span
      title={meta.label}
      aria-label={meta.label}
      className={cn(
        "pointer-events-none relative inline-flex shrink-0 items-center justify-center rounded-full",
        ringClassName !== "" && "ring-[2.5px]",
        ringClassName,
        className,
      )}
      style={{
        width: px,
        height: px,
        backgroundColor: meta.hex,
        // A hairline dark edge keeps light dots readable on light avatars.
        boxShadow: "inset 0 0 0 0.5px rgba(0,0,0,0.18)",
        opacity: state === "offline" ? 0.75 : 1,
      }}
    >
      {state === "dnd" && (
        <span
          aria-hidden
          className="rounded-full bg-white"
          style={{ width: px * 0.5, height: Math.max(1.5, px * 0.14) }}
        />
      )}
      {state === "idle" && (
        <span
          aria-hidden
          className="rounded-full bg-white/90"
          style={{
            width: px * 0.46,
            height: px * 0.46,
            transform: `translate(${px * 0.06}px, ${-px * 0.06}px)`,
          }}
        />
      )}
    </span>
  );
}

/**
 * Platform indicator — the device this person is currently on. Shown next to
 * names and profiles so members can tell mobile from desktop at a glance.
 */
export function DeviceBadge({
  device,
  className,
}: {
  device?: DeviceKind | string | null;
  className?: string;
}) {
  if (!device || !(device in DEVICE_META)) return null;
  const kind = device as DeviceKind;
  const meta = DEVICE_META[kind];
  const Icon =
    kind === "mobile" ? Smartphone : kind === "tablet" ? Tablet : Monitor;
  return (
    <span
      title={`Active on ${meta.label.toLowerCase()}`}
      aria-label={`Active on ${meta.label.toLowerCase()}`}
      className={cn(
        "inline-flex shrink-0 items-center text-muted-foreground/70 transition-colors hover:text-foreground",
        className,
      )}
    >
      <Icon className="size-3" />
      <span className="sr-only">{meta.label}</span>
    </span>
  );
}

/** Standalone status dot matched to a presence state. */
export function UserStatus({
  presence,
  size = "sm",
}: {
  presence: PresenceState;
  size?: keyof typeof SIZES;
}) {
  return <PresenceDot presence={presence} size={size} ringClassName="" />;
}

/**
 * Dual-layer avatar: a portrait roundel on top of a banner. If a banner image
 * is supplied it is shown as a fixed-height strip; the roundel covers the
 * upper portion so the face stays readable on all backgrounds.
 */
export function UserAvatar({
  user,
  size = "md",
  showStatus = true,
  className,
}: {
  user: AvatarUser;
  size?: keyof typeof SIZES;
  showStatus?: boolean;
  className?: string;
}) {
  const presence = normalizePresence(user.presence);
  const frame = findFrame(user.avatarFrame);

  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      <span
        className={cn(
          "relative z-10 inline-flex rounded-full",
          frame && `bg-gradient-to-br ${frame.gradient} p-[2px]`,
        )}
        title={frame ? `${frame.label} avatar frame` : undefined}
      >
        <span
          className={cn(
            "flex items-center justify-center overflow-hidden rounded-full font-semibold text-white",
            SIZES[size],
          )}
          style={
            user.avatarUrl
              ? undefined
              : { background: seedColor(user.id || user.name || "kyro") }
          }
        >
          {user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt=""
              loading="lazy"
              className="size-full object-cover"
            />
          ) : (
            initials(user.name || user.username || "?")
          )}
        </span>
      </span>
      <AvatarDecorationArt decorationId={user.avatarDecoration} />
      {showStatus && (
        <PresenceDot
          presence={presence}
          size={size}
          className="absolute -bottom-0.5 -right-0.5 z-30"
        />
      )}
    </span>
  );
}

export function UserBanner({
  user,
  className,
}: {
  user: AvatarUser & { bannerUrl?: string | null };
  className?: string;
}) {
  const bannerHeight = "h-12";
  const roundelSize = "size-8";

  if (!user.bannerUrl) {
    return (
      <span className="flex items-center justify-center text-white font-semibold">
        {user.name
          .split(" ")
          .map((p) => p[0])
          .join("")
          .slice(0, 2)}
      </span>
    );
  }

  return (
    <div className={cn("relative inline-flex shrink-0", className)}>
      {/* Banner strip */}
      <div
        className={cn(
          "overflow-hidden rounded-t-md bg-gradient-to-br from-brand to-cyan",
          bannerHeight,
        )}
      >
        <img src={user.bannerUrl} alt="" className="size-full object-cover" />
      </div>
      {/* Roundel with optional ring */}
      <div className="absolute -bottom-0.5 -right-0.5">
        <div className="flex items-center justify-center overflow-hidden rounded-full bg-white text-foreground">
          {user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt=""
              loading="lazy"
              className={cn("size-full object-cover", roundelSize)}
            />
          ) : (
            <span
              className={cn(
                "flex items-center justify-center font-semibold text-white",
                roundelSize,
              )}
            >
              {user.name
                .split(" ")
                .map((p) => p[0])
                .join("")
                .slice(0, 2)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
