import { CrownBadge } from "@/components/app/CrownBadge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useId, type ReactNode } from "react";

/**
 * Hover/focus tooltip explaining a badge. Rendered through a portal with
 * collision handling, so the full name and blurb stay readable even when the
 * badge sits inside a card that clips its overflow.
 */
export function BadgeTip({
  label,
  blurb,
  children,
}: {
  label: string;
  blurb?: string;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          aria-label={`${label}${blurb ? `: ${blurb}` : ""}`}
          className="inline-flex shrink-0 items-center rounded-full align-middle outline-none focus-visible:ring-2 focus-visible:ring-white/70"
        >
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        sideOffset={8}
        collisionPadding={12}
        className="z-[100] w-max max-w-60 rounded-lg border-0 bg-[#11182a] px-3.5 py-2 text-center text-indigo-50 shadow-[0_12px_32px_rgba(0,0,0,0.5)] ring-1 ring-indigo-300/20 [&>svg]:hidden"
      >
        <span className="block text-sm font-bold">{label}</span>
        {blurb ? (
          <span className="mt-0.5 block text-xs font-medium leading-snug text-indigo-100/70">
            {blurb}
          </span>
        ) : null}
      </TooltipContent>
    </Tooltip>
  );
}

function OfficialBadgeIcon({ className }: { className?: string }) {
  const gradientId = `kyroOfficial${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const fill = `url(#${gradientId})`;

  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      className={cn("size-5 shrink-0", className)}
    >
      <defs>
        <linearGradient id={gradientId} x1="4" y1="3" x2="20" y2="21">
          <stop offset="0%" stopColor="#67e8f9" />
          <stop offset="52%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#6366f1" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="10" fill={fill} fillOpacity="0.1" />
      <path
        d="M12 3.4 19 6v4.9c0 4.4-2.6 7.7-7 9.7-4.4-2-7-5.3-7-9.7V6Z"
        fill={fill}
      />
      <path
        d="m8.7 11.8 2.1 2.1 4.7-4.8"
        fill="none"
        stroke="#fff"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.9"
      />
    </svg>
  );
}

/** Blue check pill reserved for identities operated by the Kyro team. */
export function OfficialBadge({ compact = false }: { compact?: boolean }) {
  return (
    <BadgeTip
      label="Official Kyro account"
      blurb="This identity is operated by Kyro."
    >
      <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-indigo-300/20 bg-[#151d32] px-1.5 py-0.5 text-[9px] font-black uppercase leading-none tracking-wide text-indigo-50 shadow-sm">
        <OfficialBadgeIcon className="size-3.5" />
        {compact ? <span className="sr-only">Official</span> : "Official"}
      </span>
    </BadgeTip>
  );
}

/**
 * Kyro's platform-wide (global) badges — shown in their own dedicated
 * "Badges" shelf on a profile, deliberately separate from community roles.
 *
 * Every icon is original 2D vector artwork drawn for Kyro. Staff badges share
 * a shield silhouette, achievements keep a distinct glyph, and the entire set
 * uses one cyan → indigo → violet palette so it reads as a single collection.
 */
export type GlobalBadgeKey =
  | "founder"
  | "cofounder"
  | "admin"
  | "manager"
  | "staff"
  | "moderator"
  | "trialstaff"
  | "verified"
  | "bughunter"
  | "vip"
  | "og"
  | "supporter"
  | "donator"
  | "partner";

export const GLOBAL_BADGE_META: Record<
  GlobalBadgeKey,
  { label: string; blurb: string; chip: string }
> = {
  founder: {
    label: "Kyro Founder",
    blurb: "Built Kyro from the ground up.",
    chip: "border-indigo-300/20 bg-[#151d32] text-indigo-100",
  },
  cofounder: {
    label: "Co Founder",
    blurb: "Co-founded Kyro and helps steer it.",
    chip: "border-indigo-300/20 bg-[#151d32] text-indigo-100",
  },
  admin: {
    label: "Admin",
    blurb: "Runs the Kyro platform.",
    chip: "border-indigo-300/20 bg-[#151d32] text-indigo-100",
  },
  manager: {
    label: "Manager",
    blurb: "Leads Kyro's staff and communities.",
    chip: "border-indigo-300/20 bg-[#151d32] text-indigo-100",
  },
  staff: {
    label: "Staff",
    blurb: "Part of the Kyro staff team.",
    chip: "border-indigo-300/20 bg-[#151d32] text-indigo-100",
  },
  moderator: {
    label: "Moderator",
    blurb: "Keeps Kyro safe for everyone.",
    chip: "border-indigo-300/20 bg-[#151d32] text-indigo-100",
  },
  trialstaff: {
    label: "Trial Staff",
    blurb: "Trying out for the Kyro staff team.",
    chip: "border-indigo-300/20 bg-[#151d32] text-indigo-100",
  },
  verified: {
    label: "Verified",
    blurb: "Verified by the Kyro team.",
    chip: "border-indigo-300/20 bg-[#151d32] text-indigo-100",
  },
  bughunter: {
    label: "Bug Hunter",
    blurb: "Helped squash bugs in Kyro.",
    chip: "border-indigo-300/20 bg-[#151d32] text-indigo-100",
  },
  vip: {
    label: "VIP",
    blurb: "A very important Kyro member.",
    chip: "border-indigo-300/20 bg-[#151d32] text-indigo-100",
  },
  og: {
    label: "OG",
    blurb: "Been here since the early days.",
    chip: "border-indigo-300/20 bg-[#151d32] text-indigo-100",
  },
  supporter: {
    label: "Supporter",
    blurb: "Stands behind Kyro.",
    chip: "border-indigo-300/20 bg-[#151d32] text-indigo-100",
  },
  donator: {
    label: "Donator",
    blurb: "Donated to help Kyro grow.",
    chip: "border-indigo-300/20 bg-[#151d32] text-indigo-100",
  },
  partner: {
    label: "Partner",
    blurb: "An official Kyro partner.",
    chip: "border-indigo-300/20 bg-[#151d32] text-indigo-100",
  },
};

/** Badges staff can grant (founder is derived from the account). */
export const GRANTABLE_BADGES = [
  "cofounder",
  "admin",
  "manager",
  "staff",
  "moderator",
  "trialstaff",
  "verified",
  "bughunter",
  "vip",
  "og",
  "supporter",
  "donator",
  "partner",
] as const;
export type GrantableBadge = (typeof GRANTABLE_BADGES)[number];

/** Inline display order — compact rows show only the highest of these. */
export const BADGE_PRIORITY: GlobalBadgeKey[] = [
  "founder",
  "cofounder",
  "admin",
  "manager",
  "staff",
  "moderator",
  "trialstaff",
  "partner",
  "bughunter",
  "vip",
  "og",
  "donator",
  "supporter",
  "verified",
];

const GLOBAL_BADGE_SET = new Set<string>(BADGE_PRIORITY);

function isGlobalBadgeKey(value: string): value is GlobalBadgeKey {
  return GLOBAL_BADGE_SET.has(value);
}

/** The single highest-priority badge a user holds, or null for none. */
export function topGlobalBadge(
  badges: readonly string[],
): GlobalBadgeKey | null {
  return BADGE_PRIORITY.find((badge) => badges.includes(badge)) ?? null;
}

/**
 * Compact single-badge renderer for surfaces that explicitly request one.
 * Shows the badge the user picked in Settings → Profile → Badge (when they
 * hold it), else their highest one (founder → co-founder → admin → manager →
 * staff → moderator → trial staff → …). Badges stay visible throughout the
 * interface; selecting "none" simply falls back to the highest held badge.
 */
export function InlineBadge({
  badges,
  primaryBadge,
  size = "size-4",
}: {
  badges: readonly string[];
  /** This user's chosen inline badge: a held badge id, "none", or unset. */
  primaryBadge?: string | null;
  /** Matches CrownBadge's default inline size. */
  size?: string;
}) {
  const chosen =
    primaryBadge &&
    primaryBadge !== "none" &&
    isGlobalBadgeKey(primaryBadge) &&
    badges.includes(primaryBadge)
      ? primaryBadge
      : topGlobalBadge(badges);
  if (!chosen) return null;
  const meta = GLOBAL_BADGE_META[chosen];
  return (
    <BadgeTip label={meta.label} blurb={meta.blurb}>
      <span className="inline-flex shrink-0 items-center align-middle">
        <GlobalBadgeIcon badge={chosen} className={size} />
        <span className="sr-only">{meta.label}</span>
      </span>
    </BadgeTip>
  );
}

/**
 * Compact profile badge capsule. Every earned badge uses the same deep-navy,
 * blue-violet visual family and stays separate from community roles.
 */
export function BadgeTray({
  badges,
  primaryBadge,
  official = false,
  className,
}: {
  badges: readonly string[];
  /** Chosen badge that leads the tray; every other held badge still shows. */
  primaryBadge?: string | null;
  official?: boolean;
  className?: string;
}) {
  const ordered = BADGE_PRIORITY.filter((badge) => badges.includes(badge));
  const lead =
    primaryBadge &&
    primaryBadge !== "none" &&
    isGlobalBadgeKey(primaryBadge) &&
    ordered.includes(primaryBadge)
      ? primaryBadge
      : null;
  const display = lead
    ? [lead, ...ordered.filter((badge) => badge !== lead)]
    : ordered;
  if (!official && display.length === 0) return null;

  return (
    <div
      className={cn(
        "inline-flex max-w-52 flex-wrap items-center justify-start gap-0.5 rounded-xl border border-indigo-300/15 bg-[#11182a]/95 p-1 shadow-[0_10px_28px_rgba(2,6,23,.48)] backdrop-blur-md",
        className,
      )}
      aria-label="Profile badges"
    >
      {official ? (
        <BadgeTip
          label="Official Kyro account"
          blurb="This identity is operated by Kyro."
        >
          <span className="flex size-7 items-center justify-center rounded-lg transition-colors hover:bg-indigo-300/10">
            <OfficialBadgeIcon className="size-5" />
          </span>
        </BadgeTip>
      ) : null}
      {display.map((badge) => {
        const meta = GLOBAL_BADGE_META[badge];
        return (
          <BadgeTip key={badge} label={meta.label} blurb={meta.blurb}>
            <span className="flex size-7 items-center justify-center rounded-lg transition-colors hover:bg-indigo-300/10">
              <GlobalBadgeIcon badge={badge} className="size-5" />
            </span>
          </BadgeTip>
        );
      })}
    </div>
  );
}

export type CommunityRole = {
  id: string;
  name: string;
  color: string | null;
};

/** Server roles remain labelled chips under Roles, separate from badges. */
export function CommunityRoleChips({
  roles,
  className,
}: {
  roles: readonly CommunityRole[];
  className?: string;
}) {
  if (roles.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {roles.map((role) => (
        <span
          key={role.id}
          className="inline-flex items-center gap-1.5 rounded-[4px] border border-white/15 bg-black/10 px-2 py-1 text-xs font-medium text-foreground"
        >
          <span
            aria-hidden="true"
            className="size-3 rounded-full"
            style={{ backgroundColor: role.color ?? "#5865f2" }}
          />
          {role.name}
        </span>
      ))}
    </div>
  );
}

/** Shared shield silhouette for the Fenrid-inspired blue/violet badge family. */
const PLATE =
  "M12 2.8 20 5.8v5.45c0 4.8-3.05 8.1-8 9.95-4.95-1.85-8-5.15-8-9.95V5.8Z";

/** Per-badge gradients and outline colours, keyed once. */
const BADGE_ART: Record<
  Exclude<GlobalBadgeKey, "founder">,
  { stops: [string, string, string]; edge: string; vertical?: boolean }
> = {
  cofounder: {
    stops: ["#c4b5fd", "#8b5cf6", "#4f46e5"],
    edge: "#4338ca",
  },
  admin: {
    stops: ["#a5b4fc", "#6366f1", "#3730a3"],
    edge: "#312e81",
  },
  manager: {
    stops: ["#7dd3fc", "#3b82f6", "#4f46e5"],
    edge: "#3730a3",
  },
  staff: {
    stops: ["#67e8f9", "#3b82f6", "#4338ca"],
    edge: "#1e3a8a",
  },
  moderator: {
    stops: ["#93c5fd", "#6366f1", "#6d28d9"],
    edge: "#4c1d95",
  },
  trialstaff: {
    stops: ["#cbd5e1", "#818cf8", "#4338ca"],
    edge: "#312e81",
  },
  verified: {
    stops: ["#67e8f9", "#3b82f6", "#4f46e5"],
    edge: "#3730a3",
  },
  bughunter: {
    stops: ["#c4b5fd", "#8b5cf6", "#4f46e5"],
    edge: "#3730a3",
  },
  vip: {
    stops: ["#ddd6fe", "#8b5cf6", "#4f46e5"],
    edge: "#4338ca",
  },
  og: {
    stops: ["#67e8f9", "#38bdf8", "#4f46e5"],
    edge: "#3730a3",
    vertical: true,
  },
  supporter: {
    stops: ["#e9d5ff", "#a78bfa", "#6366f1"],
    edge: "#4338ca",
  },
  donator: {
    stops: ["#a5f3fc", "#60a5fa", "#6366f1"],
    edge: "#3730a3",
  },
  partner: {
    stops: ["#bfdbfe", "#818cf8", "#6d28d9"],
    edge: "#4c1d95",
    vertical: true,
  },
};

/** A single 2D badge icon. Purely decorative — labels live outside. */
export function GlobalBadgeIcon({
  badge,
  className,
}: {
  badge: GlobalBadgeKey;
  className?: string;
}) {
  const instanceId = useId().replace(/[^a-zA-Z0-9_-]/g, "");

  if (badge === "founder") {
    return (
      <CrownBadge
        variant="founder"
        label=""
        size={className ?? "size-[18px]"}
      />
    );
  }

  const art = BADGE_ART[badge];
  const gradientId = `kyroBadge_${badge}_${instanceId}`;
  const fill = `url(#${gradientId})`;
  const white = "#ffffff";

  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      className={cn("size-[18px] shrink-0", className)}
      style={{ filter: "drop-shadow(0 1px 1.5px rgba(0,0,0,0.28))" }}
    >
      <defs>
        <linearGradient
          id={gradientId}
          x1="0"
          y1={art.vertical ? "1" : "0"}
          x2="1"
          y2={art.vertical ? "0" : "1"}
        >
          <stop offset="0%" stopColor={art.stops[0]} />
          <stop offset="55%" stopColor={art.stops[1]} />
          <stop offset="100%" stopColor={art.stops[2]} />
        </linearGradient>
      </defs>

      {/* Shared shield plate keeps every role and achievement in one family. */}
      <path
        d={PLATE}
        fill={fill}
        stroke={art.stops[0]}
        strokeOpacity="0.72"
        strokeWidth="0.9"
        strokeLinejoin="round"
      />
      {/* Inner ring keeps the glyph area crisp on any background. */}
      <path
        d={PLATE}
        fill="none"
        stroke={white}
        strokeOpacity="0.28"
        strokeWidth="0.65"
        strokeLinejoin="round"
      />

      {badge === "admin" && (
        <>
          {/* five-point star */}
          <path
            d="M12 7.4 13.32 10.62 16.78 10.86 14.14 13.06 15 16.42 12 14.6 9 16.42 9.86 13.06 7.22 10.86 10.68 10.62Z"
            fill={white}
            stroke={white}
            strokeWidth="0.9"
            strokeLinejoin="round"
          />
        </>
      )}

      {badge === "cofounder" && (
        <>
          {/* three-point crown with a star for the co-founder */}
          <path
            d="M7.9 15.3 8.5 9.5l2.3 2L12 8.5l1.2 3 2.3-2 .6 5.8Z"
            fill={white}
            stroke={white}
            strokeWidth="0.5"
            strokeLinejoin="round"
          />
          <path
            d="M8.3 16.7h7.4"
            stroke={white}
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <path
            d="M12 5.1l.45 1.05 1.05.45-1.05.45-.45 1.05-.45-1.05-1.05-.45 1.05-.45Z"
            fill={white}
          />
        </>
      )}

      {badge === "manager" && (
        <>
          {/* three rank chevrons */}
          <g
            fill="none"
            stroke={white}
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m8 9.1 4 2.7 4-2.7" />
            <path d="m8 12.2 4 2.7 4-2.7" />
            <path d="m8 15.3 4 2.7 4-2.7" />
          </g>
        </>
      )}

      {badge === "staff" && (
        <>
          {/* key: trusted access to the team */}
          <circle
            cx="10"
            cy="10"
            r="2.6"
            fill="none"
            stroke={white}
            strokeWidth="1.7"
          />
          <circle cx="10" cy="10" r="0.9" fill={white} />
          <path
            d="m11.9 11.9 3.7 3.7"
            stroke={white}
            strokeWidth="1.7"
            strokeLinecap="round"
          />
          <path
            d="m13.6 13.6 1.2-1.2M15.2 15.2l1.2-1.2"
            stroke={white}
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        </>
      )}

      {badge === "trialstaff" && (
        <>
          {/* hourglass: a trial period on the team */}
          <path d="M9.2 7.8h5.6L12 12Z" fill={white} />
          <path d="M9.2 16.2h5.6L12 12Z" fill={white} fillOpacity="0.85" />
          <path
            d="M8.7 6.8h6.6M8.7 17.2h6.6"
            stroke={white}
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <path
            d="M10.6 9.1h2.8l-1.4 1.9Z"
            fill={art.edge}
            fillOpacity="0.35"
          />
        </>
      )}

      {badge === "moderator" && (
        <>
          {/* shield with a check punched through into the plate colour */}
          <path
            d="M12 7.2 16 8.6v3.5c0 2.9-1.7 5-4 6-2.3-1-4-3.1-4-6V8.6Z"
            fill={white}
          />
          <path
            d="m10.1 11.9 1.4 1.4 2.7-2.7"
            fill="none"
            stroke={art.edge}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}

      {badge === "verified" && (
        <>
          {/* scalloped seal with a gradient check over the white face */}
          <circle cx="12" cy="12" r="5.4" fill={white} />
          {[
            [12, 6.6],
            [12, 17.4],
            [6.6, 12],
            [17.4, 12],
            [8.18, 8.18],
            [15.82, 8.18],
            [8.18, 15.82],
            [15.82, 15.82],
          ].map(([cx, cy]) => (
            <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.5" fill={white} />
          ))}
          <path
            d="m9.9 12.1 1.4 1.4 3-3.2"
            fill="none"
            stroke={art.edge}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}

      {badge === "bughunter" && (
        <>
          {/* beetle caught in a target ring */}
          <ellipse cx="12" cy="13" rx="2.5" ry="3.4" fill={white} />
          <circle cx="12" cy="8.9" r="1.6" fill={white} />
          <g stroke={white} strokeWidth="1" strokeLinecap="round">
            <path d="M9.7 11.4 7.9 10M9.6 13.3H7.6M9.7 15.2l-1.7 1.4" />
            <path d="M14.3 11.4 16.1 10M14.4 13.3h2M14.3 15.2l1.7 1.4" />
            <path d="M11.2 7.2l-.9-1.1M12.8 7.2l.9-1.1" />
          </g>
          <path
            d="M12 9.9v6.2"
            stroke={art.edge}
            strokeOpacity="0.5"
            strokeWidth="0.8"
            strokeLinecap="round"
          />
        </>
      )}

      {badge === "vip" && (
        <>
          {/* faceted gem */}
          <path d="M8.1 8.4h7.8l2.5 3.4L12 17.6l-6.4-5.8Z" fill={white} />
          <path
            d="M8.1 8.4 12 17.6l3.9-9.2"
            fill="none"
            stroke={art.edge}
            strokeOpacity="0.55"
            strokeWidth="0.9"
            strokeLinejoin="round"
          />
          <path
            d="M5.6 11.8h12.8"
            fill="none"
            stroke={art.edge}
            strokeOpacity="0.55"
            strokeWidth="0.9"
          />
          <path d="M12.6 9.2h2.2l-1.3 2.9Z" fill={white} fillOpacity="0.9" />
        </>
      )}

      {badge === "og" && (
        <>
          {/* rocket climbing with a sparkle */}
          <path
            d="M12 6.9c2.2 1.7 3.3 4.1 3.3 6.7l-1.3 2.4H10l-1.3-2.4c0-2.6 1.1-5 3.3-6.7Z"
            fill={white}
          />
          <circle cx="12" cy="10.9" r="1.4" fill={fill} />
          <path
            d="m10 15.4-1.4 2.6 2.1-.6M14 15.4l1.4 2.6-2.1-.6"
            fill={white}
          />
          <path
            d="M12 15.9v2.3"
            stroke={white}
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <path
            d="M17.3 5.6l.5 1.2 1.2.5-1.2.5-.5 1.2-.5-1.2-1.2-.5 1.2-.5Z"
            fill={white}
            stroke="none"
          />
        </>
      )}

      {badge === "supporter" && (
        <>
          {/* heart with a shine */}
          <path
            d="M12 16.8c-3.7-2.4-6.2-4.6-6.2-7A3.2 3.2 0 0 1 12 8.4a3.2 3.2 0 0 1 6.2 1.4c0 2.4-2.5 4.6-6.2 7Z"
            fill={white}
          />
          <path
            d="M9 8.9c1.1-.4 2-.1 2.4.7"
            fill="none"
            stroke={art.edge}
            strokeOpacity="0.5"
            strokeWidth="1.1"
            strokeLinecap="round"
          />
        </>
      )}

      {badge === "donator" && (
        <>
          {/* coin with a shine */}
          <circle cx="12" cy="12" r="5.2" fill={white} />
          <circle
            cx="12"
            cy="12"
            r="3.4"
            fill="none"
            stroke={art.edge}
            strokeOpacity="0.35"
            strokeWidth="0.8"
          />
          <path
            d="M12 9.3v5.4M13.6 10.3c-.4-.7-2.9-1.1-3.3.4-.4 1.4 3.4 1 3.4 2.6 0 1.5-2.9 1.2-3.5.4"
            fill="none"
            stroke={fill}
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </>
      )}

      {badge === "partner" && (
        <>
          {/* two interlocked rings */}
          <circle
            cx="10.2"
            cy="12"
            r="3.4"
            fill="none"
            stroke={white}
            strokeWidth="1.7"
          />
          <circle
            cx="14.4"
            cy="12"
            r="3.4"
            fill="none"
            stroke={white}
            strokeWidth="1.7"
            strokeOpacity="0.75"
          />
        </>
      )}

      {/* Shared gloss: one highlight arc so all shields catch the same
          light and read as a single icon family. */}
      <path
        d="M7 8.2a6 6 0 0 1 4.3-3.4"
        fill="none"
        stroke="#ffffff"
        strokeOpacity="0.45"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** One badge rendered as a labelled pill — the unit of the badge shelf. */
export function GlobalBadgeChip({
  badge,
  className,
}: {
  badge: GlobalBadgeKey;
  className?: string;
}) {
  const meta = GLOBAL_BADGE_META[badge];
  return (
    <BadgeTip label={meta.label} blurb={meta.blurb}>
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-semibold",
          "shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_4px_12px_rgba(2,6,23,0.18)] transition-colors hover:border-indigo-300/35 hover:bg-[#19233c]",
          meta.chip,
          className,
        )}
      >
        <GlobalBadgeIcon badge={badge} />
        {meta.label}
      </span>
    </BadgeTip>
  );
}

/**
 * The dedicated global-badges shelf: every platform-wide badge a user holds,
 * with its own heading and styling so it never mixes up with community roles.
 */
export function GlobalBadges({
  badges,
  className,
}: {
  badges: GlobalBadgeKey[];
  className?: string;
}) {
  if (badges.length === 0) {
    return (
      <p className={cn("text-xs text-muted-foreground", className)}>
        No global badges yet.
      </p>
    );
  }
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {badges.map((badge) => (
        <GlobalBadgeChip key={badge} badge={badge} />
      ))}
    </div>
  );
}
