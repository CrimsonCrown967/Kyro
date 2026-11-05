import { cn } from "@/lib/utils";
import { useId } from "react";

/**
 * Kyro's crown badge — original artwork, not a stock icon.
 *
 * A filled three-point crown on a blue gradient chip:
 *  - `founder` — adrianeosyne's platform-wide badge, visible to everyone.
 *  - `owner`   — a server's owner, only ever rendered inside views that
 *                server's members can see (member list, that server's chat).
 */
export function CrownBadge({
  label,
  variant = "owner",
  className,
  size = "size-3.5",
}: {
  /** Tooltip + screen-reader text, e.g. "Server owner". Empty when decorative. */
  label: string;
  variant?: "founder" | "owner";
  className?: string;
  size?: string;
}) {
  const instanceId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const gradientId = `kyroCrown${variant === "founder" ? "Founder" : "Owner"}${instanceId}`;
  return (
    <span
      title={label || undefined}
      className={cn(
        "inline-flex shrink-0 items-center",
        variant === "founder" && "drop-shadow-[0_0_6px_rgba(139,92,246,0.5)]",
        className,
      )}
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        focusable="false"
        className={cn(size, "shrink-0")}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            {variant === "founder" ? (
              <>
                <stop offset="0%" stopColor="#ddd6fe" />
                <stop offset="50%" stopColor="#8b5cf6" />
                <stop offset="100%" stopColor="#4f46e5" />
              </>
            ) : (
              <>
                <stop offset="0%" stopColor="#93c5fd" />
                <stop offset="55%" stopColor="#3b82f6" />
                <stop offset="100%" stopColor="#1d4ed8" />
              </>
            )}
          </linearGradient>
        </defs>
        {/* Crown body: three peaks with rounded join rounding, thicker at
            small sizes so the silhouette holds at 14px. */}
        <path
          d="M3.2 7.2 7.9 11.6 12 4.7 16.1 11.6 20.8 7.2 19.1 17.4a1.6 1.6 0 0 1-1.6 1.4H6.5a1.6 1.6 0 0 1-1.6-1.4Z"
          fill={`url(#${gradientId})`}
          stroke={variant === "founder" ? "#4338ca" : "#1e40af"}
          strokeWidth="1"
          strokeLinejoin="round"
        />
        {/* Jewelled tips: bright orbs at each peak. */}
        <circle cx="3.2" cy="7.2" r="1.2" fill="#ffffff" fillOpacity="0.92" />
        <circle cx="12" cy="4.7" r="1.4" fill="#ffffff" />
        <circle cx="20.8" cy="7.2" r="1.2" fill="#ffffff" fillOpacity="0.92" />
        {/* Centre gem sits under the middle peak. */}
        <circle
          cx="12"
          cy="10.9"
          r="1.15"
          fill={variant === "founder" ? "#ede9fe" : "#dbeafe"}
        />
        <path
          d="M7.4 15.6h9.2"
          stroke="#ffffff"
          strokeOpacity="0.7"
          strokeWidth="1.1"
          strokeLinecap="round"
        />
        <path
          d="M5.2 9.5a5.4 5.4 0 0 1 3.4-2.9"
          fill="none"
          stroke="#ffffff"
          strokeOpacity="0.55"
          strokeWidth="1"
          strokeLinecap="round"
        />
      </svg>
      {label ? <span className="sr-only">{label}</span> : null}
    </span>
  );
}
