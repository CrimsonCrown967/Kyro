import type { CSSProperties } from "react";

export const DISPLAY_NAME_FONTS = [
  {
    id: "default",
    label: "Kyro",
    family: "inherit",
    weight: 700,
    tracking: "normal",
  },
  {
    id: "rounded",
    label: "Rounded",
    family:
      '"Arial Rounded MT Bold", "Trebuchet MS", ui-sans-serif, sans-serif',
    weight: 700,
    tracking: "0.01em",
  },
  {
    id: "serif",
    label: "Classic",
    family: 'Georgia, "Times New Roman", serif',
    weight: 700,
    tracking: "0.01em",
  },
  {
    id: "mono",
    label: "Mono",
    family: '"Cascadia Code", "SFMono-Regular", Consolas, monospace',
    weight: 700,
    tracking: "-0.02em",
  },
  {
    id: "handwritten",
    label: "Script",
    family: '"Segoe Print", "Bradley Hand", "Comic Sans MS", cursive',
    weight: 700,
    tracking: "-0.03em",
  },
  {
    id: "condensed",
    label: "Impact",
    family: 'Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif',
    weight: 700,
    tracking: "0.045em",
  },
  {
    id: "slab",
    label: "Slab",
    family: 'Rockwell, "Roboto Slab", "Courier New", serif',
    weight: 800,
    tracking: "0.01em",
  },
  {
    id: "pixel",
    label: "Pixel",
    family: '"Lucida Console", Monaco, monospace',
    weight: 800,
    tracking: "0.08em",
  },
  {
    id: "modern",
    label: "Modern",
    family: 'Inter, "Segoe UI", Helvetica, Arial, sans-serif',
    weight: 600,
    tracking: "-0.035em",
  },
  {
    id: "typewriter",
    label: "Typewriter",
    family: '"Courier New", Courier, monospace',
    weight: 700,
    tracking: "0.025em",
  },
  {
    id: "comic",
    label: "Comic",
    family: '"Comic Sans MS", "Comic Sans", cursive',
    weight: 700,
    tracking: "0",
  },
  {
    id: "gothic",
    label: "Gothic",
    family: 'Copperplate, "Copperplate Gothic Light", fantasy',
    weight: 800,
    tracking: "0.055em",
  },
  {
    id: "elegant",
    label: "Elegant",
    family: 'Didot, "Bodoni MT", Palatino, serif',
    weight: 700,
    tracking: "0.015em",
  },
  {
    id: "tech",
    label: "Tech",
    family: 'Eurostile, "Bank Gothic", "Trebuchet MS", sans-serif',
    weight: 800,
    tracking: "0.075em",
  },
  {
    id: "bubble",
    label: "Bubble",
    family: '"Cooper Black", "Arial Rounded MT Bold", fantasy',
    weight: 800,
    tracking: "0.01em",
  },
  {
    id: "narrow",
    label: "Narrow",
    family: '"Arial Narrow", "Roboto Condensed", Arial, sans-serif',
    weight: 800,
    tracking: "0.02em",
  },
  {
    id: "terminal",
    label: "Terminal",
    family: '"Lucida Console", "Courier New", monospace',
    weight: 500,
    tracking: "-0.04em",
  },
  {
    id: "storybook",
    label: "Storybook",
    family: 'Garamond, "Book Antiqua", Georgia, serif',
    weight: 700,
    tracking: "0.025em",
  },
] as const;

export type DisplayNameFont = (typeof DISPLAY_NAME_FONTS)[number]["id"];
export const DISPLAY_NAME_FONT_IDS: string[] = DISPLAY_NAME_FONTS.map(
  (font) => font.id,
);
export type DisplayNameColorMode = "none" | "solid" | "gradient";

export const DISPLAY_NAME_COLOUR_PRESETS = [
  ["#f8fafc", "#94a3b8"],
  ["#111827", "#000000"],
  ["#fb7185", "#c084fc"],
  ["#fb923c", "#facc15"],
  ["#22d3ee", "#60a5fa"],
  ["#d946ef", "#7c3aed"],
  ["#2dd4bf", "#22c55e"],
  ["#f59e0b", "#fde047"],
  ["#ef4444", "#7f1d1d"],
  ["#f472b6", "#ec4899"],
  ["#a78bfa", "#4f46e5"],
  ["#67e8f9", "#14b8a6"],
  ["#bef264", "#16a34a"],
  ["#fda4af", "#fb923c"],
  ["#94a3b8", "#475569"],
  ["#38bdf8", "#d946ef"],
] as const;

export interface DisplayNameStyledUser {
  name: string;
  displayNameFont?: string | null;
  displayNameColorMode?: DisplayNameColorMode | null;
  displayNameColor?: string | null;
  displayNameColor2?: string | null;
}

export function displayNameStyle(
  user: DisplayNameStyledUser,
  roleColor?: string | null,
): CSSProperties {
  const font =
    DISPLAY_NAME_FONTS.find((entry) => entry.id === user.displayNameFont) ??
    DISPLAY_NAME_FONTS[0];
  const style: CSSProperties = {
    fontFamily: font.family,
    fontWeight: font.weight,
    letterSpacing: font.tracking,
  };

  // Community role colour deliberately wins over a user's personal colour,
  // while their selected font remains visible.
  if (roleColor) {
    style.color = roleColor;
    style.textShadow = "0 1px 2px rgba(0,0,0,.18)";
    return style;
  }

  const first = user.displayNameColor ?? "#f97316";
  const second = user.displayNameColor2 ?? "#a855f7";
  if (user.displayNameColorMode === "solid") {
    style.color = first;
    style.textShadow = "0 1px 2px rgba(0,0,0,.22)";
  } else if (user.displayNameColorMode === "gradient") {
    style.backgroundImage = `linear-gradient(100deg, ${first}, ${second})`;
    style.backgroundClip = "text";
    style.WebkitBackgroundClip = "text";
    style.color = "transparent";
    style.WebkitTextFillColor = "transparent";
    style.filter = "drop-shadow(0 1px 1px rgba(0,0,0,.2))";
  }
  return style;
}
