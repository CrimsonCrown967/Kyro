import type { SVGProps } from "react";

/**
 * Kyro's hand-drawn icon set.
 *
 * A single visual language: 24×24 grid, 1.75 stroke, fully rounded caps and
 * joins, ~19px optical size and soft 2–3px corners that echo the product's
 * rounded surfaces. Custom shapes replace the stock icon library so the
 * interface reads as Kyro rather than as a template.
 *
 * Drop-in compatible with the previous icons: they accept the same props
 * (`className`, `aria-label`, ...) and size themselves with utility classes.
 */
export type IconProps = SVGProps<SVGSVGElement>;

function Icon({ strokeWidth = 1.75, children, ...props }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Navigation & chrome                                                 */
/* ------------------------------------------------------------------ */

export const Menu = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 7.5h16" />
    <path d="M4 12h16" />
    <path d="M4 16.5h11" />
  </Icon>
);

export const Search = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="10.8" cy="10.8" r="6.8" />
    <path d="m20 20-4.7-4.7" />
  </Icon>
);

export const Bell = (props: IconProps) => (
  <Icon {...props}>
    <path d="M6.2 10.2a5.8 5.8 0 0 1 11.6 0c0 3.6 1.4 5.3 1.4 5.3H4.8c0-3.6 1.4-5.3 1.4-5.3Z" />
    <path d="M10 18.7a2.2 2.2 0 0 0 4 0" />
  </Icon>
);

export const BellOff = (props: IconProps) => (
  <Icon {...props}>
    <path d="M6.2 10.2a5.8 5.8 0 0 1 11.6 0c0 3.6 1.4 5.3 1.4 5.3H4.8c0-3.6 1.4-5.3 1.4-5.3Z" />
    <path d="M10 18.7a2.2 2.2 0 0 0 4 0" />
    <path d="m3 3 18 18" />
  </Icon>
);

export const Settings = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12.4 2.8h-.8a2 2 0 0 0-2 2v.4a1.7 1.7 0 0 1-1 1.5l-.4.2a1.7 1.7 0 0 1-1.7 0l-.3-.2a2 2 0 0 0-2.7.7l-.4.7a2 2 0 0 0 .7 2.7l.3.2a1.7 1.7 0 0 1 .8 1.5v.8a1.7 1.7 0 0 1-.9 1.5l-.3.2a2 2 0 0 0-.7 2.7l.4.7a2 2 0 0 0 2.7.7l.3-.2a1.7 1.7 0 0 1 1.7 0l.4.2a1.7 1.7 0 0 1 1 1.5v.4a2 2 0 0 0 2 2h.8a2 2 0 0 0 2-2v-.4a1.7 1.7 0 0 1 1-1.5l.4-.2a1.7 1.7 0 0 1 1.7 0l.3.2a2 2 0 0 0 2.7-.7l.4-.7a2 2 0 0 0-.7-2.7l-.3-.2a1.7 1.7 0 0 1-.9-1.5v-.8a1.7 1.7 0 0 1 .9-1.5l.3-.2a2 2 0 0 0 .7-2.7l-.4-.7a2 2 0 0 0-2.7-.7l-.3.2a1.7 1.7 0 0 1-1.7 0l-.4-.2a1.7 1.7 0 0 1-1-1.5v-.4a2 2 0 0 0-2-2Z" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
);

export const PanelRight = (props: IconProps) => (
  <Icon {...props}>
    <rect x="3" y="4" width="18" height="16" rx="3.5" />
    <path d="M15 4.5v15" />
  </Icon>
);

export const Home = (props: IconProps) => (
  <Icon {...props}>
    <path d="M3.8 11 12 4.2l8.2 6.8" />
    <path d="M6 9.7V19a1.5 1.5 0 0 0 1.5 1.5h9A1.5 1.5 0 0 0 18 19V9.7" />
    <path d="M10 20.5v-5h4v5" />
  </Icon>
);

/** Open book — marks a community's rules channel. */
export const BookOpen = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 6.5C10.5 5 8.4 4.5 6 4.5H3.5v13H6c2.4 0 4.5.5 6 2 1.5-1.5 3.6-2 6-2h2.5v-13H18c-2.4 0-4.5.5-6 2Z" />
    <path d="M12 6.5v13" />
  </Icon>
);

export const Compass = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="m15.6 8.4-2.1 5.1-5.1 2.1 2.1-5.1 5.1-2.1Z" />
  </Icon>
);

export const LogOut = (props: IconProps) => (
  <Icon {...props}>
    <path d="M14 4.5H7.5A3.5 3.5 0 0 0 4 8v8a3.5 3.5 0 0 0 3.5 3.5H14" />
    <path d="m17 8.5 3.5 3.5-3.5 3.5" />
    <path d="M20.5 12H9.5" />
  </Icon>
);

export const ArrowLeft = (props: IconProps) => (
  <Icon {...props}>
    <path d="M20 12H4.5" />
    <path d="m11 5.5-6.5 6.5 6.5 6.5" />
  </Icon>
);

export const ArrowRight = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 12h15.5" />
    <path d="m13 5.5 6.5 6.5-6.5 6.5" />
  </Icon>
);

export const ChevronUp = (props: IconProps) => (
  <Icon {...props}>
    <path d="m6 14.5 6-6 6 6" />
  </Icon>
);

export const ChevronDown = (props: IconProps) => (
  <Icon {...props}>
    <path d="m6 9.5 6 6 6-6" />
  </Icon>
);

export const ChevronRight = (props: IconProps) => (
  <Icon {...props}>
    <path d="m9.5 6 6 6-6 6" />
  </Icon>
);

/** Six-dot grip used as a drag handle for reorderable rows. */
export const GripVertical = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="9.5" cy="6" r="1.35" fill="currentColor" stroke="none" />
    <circle cx="14.5" cy="6" r="1.35" fill="currentColor" stroke="none" />
    <circle cx="9.5" cy="12" r="1.35" fill="currentColor" stroke="none" />
    <circle cx="14.5" cy="12" r="1.35" fill="currentColor" stroke="none" />
    <circle cx="9.5" cy="18" r="1.35" fill="currentColor" stroke="none" />
    <circle cx="14.5" cy="18" r="1.35" fill="currentColor" stroke="none" />
  </Icon>
);

/* ------------------------------------------------------------------ */
/* People & social                                                     */
/* ------------------------------------------------------------------ */

export const User = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="8.4" r="4" />
    <path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" />
  </Icon>
);

export const Users = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="9.5" cy="8.5" r="3.8" />
    <path d="M2.5 20.5a7 7 0 0 1 14 0" />
    <path d="M16.5 5.2a3.8 3.8 0 0 1 0 7.1" />
    <path d="M18 14.4a6.4 6.4 0 0 1 3.5 6.1" />
  </Icon>
);

export const UserPlus = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="10" cy="8" r="4" />
    <path d="M3 20.5a7 7 0 0 1 11.3-5.6" />
    <path d="M18 14v6" />
    <path d="M15 17h6" />
  </Icon>
);

export const UserCheck = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="10" cy="8" r="4" />
    <path d="M3 20.5a7 7 0 0 1 11.3-5.6" />
    <path d="m15.5 18.2 2.2 2.2 4.1-4.6" />
  </Icon>
);

export const UserX = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="10" cy="8" r="4" />
    <path d="M3 20.5a7 7 0 0 1 11.3-5.6" />
    <path d="m16.8 15.8 4.6 4.6" />
    <path d="m21.4 15.8-4.6 4.6" />
  </Icon>
);

export const Circle = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="8.5" />
  </Icon>
);

export const Ban = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="m6 6 12 12" />
  </Icon>
);

export const Clock = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.2v5l3.3 2" />
  </Icon>
);

export const Check = (props: IconProps) => (
  <Icon {...props}>
    <path d="m4.5 12.5 5 5 10-11" />
  </Icon>
);

export const CheckCheck = (props: IconProps) => (
  <Icon {...props}>
    <path d="m2.5 12.5 3.5 3.5 6-7" />
    <path d="m10.5 16 2 2 7-8" />
  </Icon>
);

export const X = (props: IconProps) => (
  <Icon {...props}>
    <path d="m6 6 12 12" />
    <path d="M18 6 6 18" />
  </Icon>
);

export const Plus = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </Icon>
);

/* ------------------------------------------------------------------ */
/* Chat & messaging                                                    */
/* ------------------------------------------------------------------ */

export const Hash = (props: IconProps) => (
  <Icon {...props}>
    <path d="M10 4 7.5 20" />
    <path d="M17 4l-2.5 16" />
    <path d="M4.5 9.2h15" />
    <path d="M4 14.8h15" />
  </Icon>
);

export const MessageCircle = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 9.5A5.5 5.5 0 0 1 9.5 4h5A5.5 5.5 0 0 1 20 9.5v3A5.5 5.5 0 0 1 14.5 18H11l-2.5 3V18a5.5 5.5 0 0 1-4.5-5.5Z" />
  </Icon>
);

export const MessagesSquare = (props: IconProps) => (
  <Icon {...props}>
    <path d="M9 7.5V8A3.5 3.5 0 0 1 12.5 4H18a3.5 3.5 0 0 1 3.5 3.5V9.5A3.5 3.5 0 0 1 18 13h-1" />
    <rect x="3" y="7.5" width="13.5" height="10" rx="3.5" />
    <path d="M7 17.5v2.8l3.2-2.8" />
  </Icon>
);

export const Send = (props: IconProps) => (
  <Icon {...props}>
    <path d="M20.5 3.5 3.5 10.5l7.4 3.1 3.1 7.4 6.5-17.5Z" />
    <path d="m10.9 13.6 9.6-10.1" />
  </Icon>
);

export const Reply = (props: IconProps) => (
  <Icon {...props}>
    <path d="m10 6.5-4.5 4.5L10 15.5" />
    <path d="M5.5 11h8a5.5 5.5 0 0 1 5.5 5.5v2" />
  </Icon>
);

export const CornerUpLeft = (props: IconProps) => (
  <Icon {...props}>
    <path d="M9.5 13.5 5 9l4.5-4.5" />
    <path d="M5 9h9a5 5 0 0 1 5 5v5" />
  </Icon>
);

export const Pencil = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 20.2 5.1 16 16.6 4.5a2.2 2.2 0 0 1 3.1 3.1L8.2 19.1 4 20.2Z" />
    <path d="m5.1 16 3.1 3.1" />
  </Icon>
);

export const Smile = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M8.6 14.2a4.3 4.3 0 0 0 6.8 0" />
    <path d="M9.3 9.6h.01" />
    <path d="M14.7 9.6h.01" />
  </Icon>
);

export const SmilePlus = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="11" cy="12.5" r="8" />
    <path d="M7.7 14.7a4 4 0 0 0 6.6 0" />
    <path d="M8.5 10.2h.01" />
    <path d="M13.5 10.2h.01" />
    <path d="M17.5 1.5v4" />
    <path d="M15.5 3.5h4" />
  </Icon>
);

export const Paperclip = (props: IconProps) => (
  <Icon {...props}>
    <path d="M19.5 10.5 11 19a4.6 4.6 0 0 1-6.5-6.5l8.8-8.8a3.1 3.1 0 1 1 4.4 4.4l-8.7 8.7a1.6 1.6 0 0 1-2.2-2.2" />
  </Icon>
);

export const Mic = (props: IconProps) => (
  <Icon {...props}>
    <rect x="9" y="3" width="6" height="10.5" rx="3" />
    <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0" />
    <path d="M12 18v3" />
    <path d="M8.5 21h7" />
  </Icon>
);

export const StopCircle = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="9" />
    <rect x="8.5" y="8.5" width="7" height="7" rx="1.5" />
  </Icon>
);

export const MicOff = (props: IconProps) => (
  <Icon {...props}>
    <rect x="9" y="3" width="6" height="10.5" rx="3" />
    <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0" />
    <path d="M12 18v3" />
    <path d="M8.5 21h7" />
    <path d="m3.5 3.5 17 17" />
  </Icon>
);

export const Video = (props: IconProps) => (
  <Icon {...props}>
    <rect x="3" y="6" width="13" height="12" rx="3" />
    <path d="m16 10 5-3v10l-5-3" />
  </Icon>
);

export const VideoOff = (props: IconProps) => (
  <Icon {...props}>
    <path d="M10.8 6H6a3 3 0 0 0-3 3v6a3 3 0 0 0 3 3h7a3 3 0 0 0 3-3v-1.2" />
    <path d="m16 10 5-3v10l-3.2-1.9" />
    <path d="m3 3 18 18" />
  </Icon>
);

export const Maximize = (props: IconProps) => (
  <Icon {...props}>
    <path d="M8 3H3v5" />
    <path d="m3 3 6 6" />
    <path d="M16 21h5v-5" />
    <path d="m21 21-6-6" />
    <path d="M21 8V3h-5" />
    <path d="m21 3-6 6" />
    <path d="M3 16v5h5" />
    <path d="m3 21 6-6" />
  </Icon>
);

/* ------------------------------------------------------------------ */
/* Feedback & status                                                   */
/* ------------------------------------------------------------------ */

export const Loader2 = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="8.5" opacity="0.25" />
    <path d="M20.5 12A8.5 8.5 0 0 0 12 3.5" />
  </Icon>
);

export const AlertTriangle = (props: IconProps) => (
  <Icon {...props}>
    <path d="M10.3 4.6a2 2 0 0 1 3.4 0l7.2 12.5a2 2 0 0 1-1.7 3H4.8a2 2 0 0 1-1.7-3Z" />
    <path d="M12 9.8v4" />
    <path d="M12 17.2h.01" />
  </Icon>
);

export const Shield = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 3.2 5 5.6v5.7c0 4.3 2.9 7.5 7 9.5 4.1-2 7-5.2 7-9.5V5.6Z" />
  </Icon>
);

export const ShieldCheck = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 3.2 5 5.6v5.7c0 4.3 2.9 7.5 7 9.5 4.1-2 7-5.2 7-9.5V5.6Z" />
    <path d="m8.9 11.7 2.3 2.3 4.1-4.6" />
  </Icon>
);

export const Crown = (props: IconProps) => (
  <Icon {...props}>
    <path d="M3.5 7.5 6.8 11.2 12 4.5l5.2 6.7 3.5-3.7-1.7 11H5.2Z" />
  </Icon>
);

export const Ellipsis = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="5.6" cy="12" r="1.45" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.45" fill="currentColor" stroke="none" />
    <circle cx="18.4" cy="12" r="1.45" fill="currentColor" stroke="none" />
  </Icon>
);

export const Volume2 = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 9.4h3.3L12 5.4v13.2l-4.7-4H4Z" />
    <path d="M15.4 9.3a4 4 0 0 1 0 5.4" />
    <path d="M18 6.9a7.3 7.3 0 0 1 0 10.2" />
  </Icon>
);

export const VolumeX = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 9.4h3.3L12 5.4v13.2l-4.7-4H4Z" />
    <path d="m16 9.5 4.5 5" />
    <path d="m20.5 9.5-4.5 5" />
  </Icon>
);

export const ShieldAlert = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 3.2 5 5.6v5.7c0 4.3 2.9 7.5 7 9.5 4.1-2 7-5.2 7-9.5V5.6Z" />
    <path d="M12 8v4.5" />
    <path d="M12 15.8h.01" />
  </Icon>
);

export const Copy = (props: IconProps) => (
  <Icon {...props}>
    <rect x="8.5" y="8.5" width="11.5" height="11.5" rx="3.5" />
    <path d="M18.5 8.5V7A2.5 2.5 0 0 0 16 4.5H7A2.5 2.5 0 0 0 4.5 7v9A2.5 2.5 0 0 0 7 18.5h1.5" />
  </Icon>
);

export const Trash2 = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4.5 6.5h15" />
    <path d="M9.5 6.5V5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14.5 5v1.5" />
    <path d="M6.5 6.5 7.3 19a2.5 2.5 0 0 0 2.5 2.3h4.4a2.5 2.5 0 0 0 2.5-2.3l.8-12.5" />
    <path d="M10.5 10.5v6" />
    <path d="M13.5 10.5v6" />
  </Icon>
);

export const Download = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 4v10.5" />
    <path d="m7.5 10 4.5 4.5 4.5-4.5" />
    <path d="M4.5 19.5h15" />
  </Icon>
);

export const Link2 = (props: IconProps) => (
  <Icon {...props}>
    <path d="M9.5 14.5 14.5 9.5" />
    <path d="M11.2 6.6 13 4.8a4.2 4.2 0 0 1 6 6l-1.8 1.8" />
    <path d="M12.8 17.4 11 19.2a4.2 4.2 0 0 1-6-6l1.8-1.8" />
  </Icon>
);

export const Pin = (props: IconProps) => (
  <Icon {...props}>
    <path d="m8 4 8 8" />
    <path d="m14.5 3.5 6 6-3 1.2-3.8 3.8-1.2 3-6-6 3-1.2 3.8-3.8Z" />
    <path d="m9.5 14.5-6 6" />
  </Icon>
);

export const Forward = (props: IconProps) => (
  <Icon {...props}>
    <path d="M13 5.5 20 12l-7 6.5v-4H8.5c-2.7 0-4.4 1-5.5 3 0-5.2 2.3-8 6.8-8H13Z" />
  </Icon>
);

export const Globe = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3.5 12h17" />
    <path d="M12 3c2.3 2.5 3.5 5.5 3.5 9s-1.2 6.5-3.5 9c-2.3-2.5-3.5-5.5-3.5-9S9.7 5.5 12 3Z" />
  </Icon>
);

export const Crop = (props: IconProps) => (
  <Icon {...props}>
    <path d="M7 3v13a3 3 0 0 0 3 3h11" />
    <path d="M3 7h13a3 3 0 0 1 3 3v11" />
  </Icon>
);

export const BarChart3 = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 20V10" />
    <path d="M10 20V4" />
    <path d="M16 20v-7" />
    <path d="M22 20H2" />
  </Icon>
);

export const Lock = (props: IconProps) => (
  <Icon {...props}>
    <rect x="4.5" y="10" width="15" height="10" rx="3.5" />
    <path d="M8 10V7.5a4 4 0 0 1 8 0V10" />
    <path d="M12 14v2.5" />
  </Icon>
);

/* ------------------------------------------------------------------ */
/* Compose, media & devices                                            */
/* ------------------------------------------------------------------ */

export const Mail = (props: IconProps) => (
  <Icon {...props}>
    <rect x="3" y="5.5" width="18" height="13" rx="3.5" />
    <path d="M4.5 8.2 11 12.6a2 2 0 0 0 2 0l6.5-4.4" />
  </Icon>
);

export const MailOpen = (props: IconProps) => (
  <Icon {...props}>
    <path d="M3.5 10.5 12 4l8.5 6.5v6.5a3.5 3.5 0 0 1-3.5 3.5H7a3.5 3.5 0 0 1-3.5-3.5Z" />
    <path d="m3.5 10.5 8.5 6.5 8.5-6.5" />
  </Icon>
);

export const Monitor = (props: IconProps) => (
  <Icon {...props}>
    <rect x="3" y="4.5" width="18" height="12.5" rx="3" />
    <path d="M12 17v3.5" />
    <path d="M8.5 20.5h7" />
  </Icon>
);

export const ScreenShare = (props: IconProps) => (
  <Icon {...props}>
    <rect x="2.5" y="4.5" width="19" height="12.5" rx="3" />
    <path d="M12 17v3.5" />
    <path d="M8.5 20.5h7" />
    <path d="M12 13.5V7.7" />
    <path d="m9.6 10 2.4-2.4 2.4 2.4" />
  </Icon>
);

export const ScreenShareOff = (props: IconProps) => (
  <Icon {...props}>
    <rect x="2.5" y="4.5" width="19" height="12.5" rx="3" />
    <path d="M12 17v3.5" />
    <path d="M8.5 20.5h7" />
    <path d="M9 12.4 12 7.6l3 4.8" />
    <path d="M3.2 3.2 20.8 20.8" />
  </Icon>
);

export const MonitorSmartphone = (props: IconProps) => (
  <Icon {...props}>
    <rect x="2.5" y="4.5" width="13" height="9.5" rx="2.5" />
    <path d="M6 19.5h5.5" />
    <path d="M8.5 14v5.5" />
    <rect x="17" y="8" width="5" height="11" rx="2" />
    <path d="M19 16.8h.01" />
  </Icon>
);

export const Phone = (props: IconProps) => (
  <Icon {...props}>
    <path d="M7.5 3.5h-2A2 2 0 0 0 3.6 5.9c.5 4.6 2.4 8.9 5.4 12.1a14 14 0 0 0 9.4 4.4 2 2 0 0 0 2-2v-1.9a2 2 0 0 0-1.6-2l-2.7-.5a2 2 0 0 0-2 .8l-.7 1a11 11 0 0 1-5.4-5.4l1-.7a2 2 0 0 0 .8-2l-.5-2.7a2 2 0 0 0-2-1.6Z" />
  </Icon>
);

export const PhoneOff = (props: IconProps) => (
  <Icon {...props}>
    <path d="M7.5 3.5h-2A2 2 0 0 0 3.6 5.9c.5 4.6 2.4 8.9 5.4 12.1a14 14 0 0 0 9.4 4.4 2 2 0 0 0 2-2v-1.9a2 2 0 0 0-1.6-2l-2.7-.5a2 2 0 0 0-2 .8l-.7 1a11 11 0 0 1-5.4-5.4l1-.7a2 2 0 0 0 .8-2l-.5-2.7a2 2 0 0 0-2-1.6Z" />
    <path d="M3 3l18 18" />
  </Icon>
);

export const Smartphone = (props: IconProps) => (
  <Icon {...props}>
    <rect x="6" y="2.5" width="12" height="19" rx="3" />
    <path d="M10.7 5.2h2.6" />
    <path d="M11.4 18.6h1.2" />
  </Icon>
);

export const Tablet = (props: IconProps) => (
  <Icon {...props}>
    <rect x="4" y="2.5" width="16" height="19" rx="3" />
    <path d="M11.1 18.4h1.8" />
    <path d="M7.2 5.6h9.6" />
  </Icon>
);

export const Headphones = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4.5 15.5V12a7.5 7.5 0 0 1 15 0v3.5" />
    <rect x="3" y="14" width="4.5" height="6.5" rx="2.25" />
    <rect x="16.5" y="14" width="4.5" height="6.5" rx="2.25" />
  </Icon>
);

/* ------------------------------------------------------------------ */
/* Appearance & identity                                               */
/* ------------------------------------------------------------------ */

export const Sun = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="4.5" />
    <path d="M12 2.5v2.2" />
    <path d="M12 19.3v2.2" />
    <path d="M21.5 12h-2.2" />
    <path d="M4.7 12H2.5" />
    <path d="m18.7 5.3-1.6 1.6" />
    <path d="m6.9 17.1-1.6 1.6" />
    <path d="m18.7 18.7-1.6-1.6" />
    <path d="m6.9 6.9-1.6-1.6" />
  </Icon>
);

export const Moon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M20.5 14.8A8.8 8.8 0 0 1 9.2 3.5 9 9 0 1 0 20.5 14.8Z" />
  </Icon>
);

export const Palette = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="9.2" cy="9.6" r="1.15" fill="currentColor" stroke="none" />
    <circle cx="14.6" cy="8.9" r="1.15" fill="currentColor" stroke="none" />
    <circle cx="16.4" cy="13.6" r="1.15" fill="currentColor" stroke="none" />
  </Icon>
);

export const Sparkles = (props: IconProps) => (
  <Icon {...props}>
    <path d="M10.5 3 11.9 7.1 16 8.5l-4.1 1.4L10.5 14 9.1 9.9 5 8.5l4.1-1.4Z" />
    <path d="m17.5 14 1.1 3.4 3.4 1.1-3.4 1.1-1.1 3.4-1.1-3.4-3.4-1.1 3.4-1.1Z" />
  </Icon>
);

export const Bold = (props: IconProps) => (
  <Icon {...props}>
    <path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" />
    <path d="M6 12h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" />
  </Icon>
);

export const Eye = (props: IconProps) => (
  <Icon {...props}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
);

export const EyeOff = (props: IconProps) => (
  <Icon {...props}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
    <path d="m16.5 16.5 3.5 3.5" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
);
export const Zap = (props: IconProps) => (
  <Icon {...props}>
    <path d="M13.5 2.5 4.5 13.7h6.3l-.9 7.8 9.1-11.4h-6.3l.8-7.6Z" />
  </Icon>
);

export const Wrench = (props: IconProps) => (
  <Icon {...props}>
    <path d="M14.9 6.3a1 1 0 0 0 0 1.4l1.4 1.4a1 1 0 0 0 1.4 0l3.4-3.4a6 6 0 0 1-7.9 7.9l-6.4 6.4a2.2 2.2 0 0 1-3-3l6.4-6.4a6 6 0 0 1 7.9-7.9l-3.2 3.6Z" />
  </Icon>
);
