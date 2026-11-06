import { CrownBadge } from "@/components/app/CrownBadge";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/**
 * Hover/focus tooltip explaining a badge — a small dark panel above the
 * icon with the badge's name and blurb, styled like the profile popup's
 * badge tips. Pure CSS: no portal, no delay.
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
    <span
      tabIndex={0}
      aria-label={`${label}${blurb ? `: ${blurb}` : ""}`}
      className="group/tip relative inline-flex shrink-0 items-center align-middle outline-none"
    >
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-40 mb-2 w-max max-w-44 -translate-x-1/2 scale-95 rounded-lg bg-zinc-900 px-3.5 py-2 text-center opacity-0 shadow-[0_10px_30px_rgba(0,0,0,0.45)] ring-1 ring-white/10 transition-all duration-150 group-hover/tip:scale-100 group-hover/tip:opacity-100 group-focus-within/tip:scale-100 group-focus-within/tip:opacity-100"
      >
        <span className="block text-sm font-bold text-zinc-50">{label}</span>
        {blurb ? (
          <span className="mt-0.5 block text-xs font-medium leading-snug text-zinc-300">
            {blurb}
          </span>
        ) : null}
      </span>
    </span>
  );
}

/** Blue check pill reserved for identities operated by the Kyro team. */
export function OfficialBadge({ compact = false }: { compact?: boolean }) {
  return (
    <BadgeTip
      label="Official Kyro account"
      blurb="This identity is operated by Kyro."
    >
      <span className="inline-flex shrink-0 items-center gap-1 rounded-[4px] bg-blue-600 px-1.5 py-0.5 text-[9px] font-black uppercase leading-none tracking-wide text-white shadow-sm ring-1 ring-blue-300/40">
        <svg
          viewBox="0 0 16 16"
          aria-hidden="true"
          className="size-3 fill-white"
        >
          <path d="M8 1.25 9.7 2.4l2.05-.05.58 1.96 1.69 1.16-.68 1.93.68 1.93-1.69 1.16-.58 1.96-2.05-.05L8 13.55 6.3 12.4l-2.05.05-.58-1.96L1.98 9.33l.68-1.93-.68-1.93 1.69-1.16.58-1.96 2.05.05L8 1.25Zm2.86 4.4a.7.7 0 0 0-.99-.01L7.13 8.32 6.08 7.29a.7.7 0 1 0-.98 1l1.54 1.5a.7.7 0 0 0 .98 0l3.23-3.15a.7.7 0 0 0 .01-.99Z" />
        </svg>
        {compact ? <span className="sr-only">Official</span> : "Official"}
      </span>
    </BadgeTip>
  );
}

/**
 * Kyro's platform-wide (global) badges — shown in their own dedicated
 * "Badges" shelf on a profile, deliberately separate from community roles.
 *
 * Every icon is original 2D vector artwork drawn for Kyro. The family shares
 * one "gem plate" silhouette — a rounded diamond set at 45° with an inner
 * gloss — and each badge gets its own hue + glyph:
 *  - founder    — royal crown, gold plate
 *  - cofounder  — crown + star, violet plate
 *  - admin      — star, crimson plate
 *  - manager    — three rank chevrons, lime plate
 *  - staff      — key, sky plate
 *  - moderator  — shield + check, emerald plate
 *  - trialstaff — hourglass, steel plate
 *  - verified   — seal + check, blue plate
 *  - bughunter  — bug under a target ring, amber plate
 *  - vip        — faceted diamond, violet plate
 *  - og         — rocket with star, teal plate
 *  - supporter  — heart, rose plate
 *  - donator    — coin, gold plate
 *  - partner    — interlocked rings, indigo plate
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
    chip: "border-amber-300/60 bg-gradient-to-br from-amber-400/30 via-yellow-500/10 to-amber-500/5 text-amber-600 dark:text-amber-300",
  },
  cofounder: {
    label: "Co Founder",
    blurb: "Co-founded Kyro and helps steer it.",
    chip: "border-violet-400/60 bg-gradient-to-br from-violet-500/30 via-purple-500/15 to-amber-400/10 text-violet-600 dark:text-violet-300",
  },
  admin: {
    label: "Admin",
    blurb: "Runs the Kyro platform.",
    chip: "border-rose-400/50 bg-gradient-to-br from-rose-500/25 via-rose-500/10 to-rose-500/0 text-rose-600 dark:text-rose-300",
  },
  manager: {
    label: "Manager",
    blurb: "Leads Kyro's staff and communities.",
    chip: "border-lime-400/50 bg-gradient-to-br from-lime-500/25 via-lime-500/10 to-lime-500/0 text-lime-600 dark:text-lime-300",
  },
  staff: {
    label: "Staff",
    blurb: "Part of the Kyro staff team.",
    chip: "border-sky-400/50 bg-gradient-to-br from-sky-500/25 via-sky-500/10 to-sky-500/0 text-sky-600 dark:text-sky-300",
  },
  moderator: {
    label: "Moderator",
    blurb: "Keeps Kyro safe for everyone.",
    chip: "border-emerald-400/50 bg-gradient-to-br from-emerald-500/25 via-emerald-500/10 to-emerald-500/0 text-emerald-600 dark:text-emerald-300",
  },
  trialstaff: {
    label: "Trial Staff",
    blurb: "Trying out for the Kyro staff team.",
    chip: "border-slate-400/50 bg-gradient-to-br from-slate-400/25 via-slate-500/10 to-slate-500/0 text-slate-600 dark:text-slate-300",
  },
  verified: {
    label: "Verified",
    blurb: "Verified by the Kyro team.",
    chip: "border-blue-400/50 bg-gradient-to-br from-blue-500/25 via-blue-500/10 to-blue-500/0 text-blue-600 dark:text-blue-300",
  },
  bughunter: {
    label: "Bug Hunter",
    blurb: "Helped squash bugs in Kyro.",
    chip: "border-amber-400/60 bg-gradient-to-br from-orange-500/25 via-amber-500/10 to-amber-500/0 text-amber-600 dark:text-amber-300",
  },
  vip: {
    label: "VIP",
    blurb: "A very important Kyro member.",
    chip: "border-fuchsia-400/50 bg-gradient-to-br from-fuchsia-500/25 via-purple-500/10 to-purple-500/0 text-fuchsia-600 dark:text-fuchsia-300",
  },
  og: {
    label: "OG",
    blurb: "Been here since the early days.",
    chip: "border-teal-400/50 bg-gradient-to-br from-teal-500/25 via-teal-500/10 to-teal-500/0 text-teal-600 dark:text-teal-300",
  },
  supporter: {
    label: "Supporter",
    blurb: "Stands behind Kyro.",
    chip: "border-pink-400/50 bg-gradient-to-br from-pink-500/25 via-rose-500/10 to-rose-500/0 text-pink-600 dark:text-pink-300",
  },
  donator: {
    label: "Donator",
    blurb: "Donated to help Kyro grow.",
    chip: "border-yellow-400/60 bg-gradient-to-br from-yellow-500/25 via-amber-400/10 to-amber-400/0 text-yellow-600 dark:text-yellow-300",
  },
  partner: {
    label: "Partner",
    blurb: "An official Kyro partner.",
    chip: "border-indigo-400/50 bg-gradient-to-br from-indigo-500/25 via-indigo-500/10 to-indigo-500/0 text-indigo-600 dark:text-indigo-300",
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

/** The single highest-priority badge a user holds, or null for none. */
export function topGlobalBadge(
  badges: readonly string[],
): GlobalBadgeKey | null {
  return BADGE_PRIORITY.find((badge) => badges.includes(badge)) ?? null;
}

/**
 * Inline badge next to a name, styled exactly like the founder crown.
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
    primaryBadge && primaryBadge !== "none" && badges.includes(primaryBadge)
      ? (primaryBadge as GlobalBadgeKey)
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
 * The shared "gem plate" silhouette every badge glyph sits on: a diamond
 * rotated 45° whose join rounding is faked with a thick round-joined stroke
 * of the gradient itself. One shape for the whole family keeps ten badges
 * reading as one set.
 */
const PLATE = "M12 2.6 21.4 12 12 21.4 2.6 12Z";

/** Per-badge gradients and outline colours, keyed once. */
const BADGE_ART: Record<
  Exclude<GlobalBadgeKey, "founder">,
  { stops: [string, string, string]; edge: string; vertical?: boolean }
> = {
  cofounder: {
    stops: ["#c4b5fd", "#8b5cf6", "#4c1d95"],
    edge: "#2e1065",
  },
  admin: {
    stops: ["#fda4af", "#f43f5e", "#9f1239"],
    edge: "#881337",
  },
  manager: {
    stops: ["#d9f99d", "#84cc16", "#3f6212"],
    edge: "#365314",
  },
  staff: {
    stops: ["#bae6fd", "#0ea5e9", "#075985"],
    edge: "#0c4a6e",
  },
  moderator: {
    stops: ["#6ee7b7", "#10b981", "#047857"],
    edge: "#065f46",
  },
  trialstaff: {
    stops: ["#cbd5e1", "#64748b", "#1e293b"],
    edge: "#0f172a",
  },
  verified: {
    stops: ["#93c5fd", "#3b82f6", "#1d4ed8"],
    edge: "#1e40af",
  },
  bughunter: {
    stops: ["#fcd34d", "#f59e0b", "#b45309"],
    edge: "#78350f",
  },
  vip: {
    stops: ["#f0abfc", "#c026d3", "#6b21a8"],
    edge: "#701a75",
  },
  og: {
    stops: ["#99f6e4", "#14b8a6", "#115e59"],
    edge: "#134e4a",
    vertical: true,
  },
  supporter: {
    stops: ["#fda4af", "#fb7185", "#e11d48"],
    edge: "#9f1239",
  },
  donator: {
    stops: ["#fef08a", "#fbbf24", "#b45309"],
    edge: "#92400e",
  },
  partner: {
    stops: ["#c7d2fe", "#6366f1", "#3730a3"],
    edge: "#312e81",
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
  if (badge === "founder") {
    return (
      <CrownBadge
        variant="founder"
        label="Kyro founder"
        size={className ?? "size-[18px]"}
      />
    );
  }

  const art = BADGE_ART[badge];
  const gradientId = `kyroBadge_${badge}`;
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

      {/* Gem plate: thick round-joined stroke turns the diamond's sharp
          corners soft while staying one continuous silhouette. */}
      <path
        d={PLATE}
        fill={fill}
        stroke={fill}
        strokeWidth="2.1"
        strokeLinejoin="round"
      />
      {/* Inner ring keeps the glyph area crisp on any background. */}
      <path
        d={PLATE}
        fill="none"
        stroke={white}
        strokeOpacity="0.28"
        strokeWidth="0.8"
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

      {/* Shared gloss: one highlight arc so all ten plates catch the same
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
          "inline-flex items-center gap-1.5 rounded-[5px] border px-2 py-1 text-xs font-semibold",
          "shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-shadow hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_2px_6px_rgba(0,0,0,0.12)]",
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
