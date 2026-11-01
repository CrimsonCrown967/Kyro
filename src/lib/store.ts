import { create } from "zustand";
import { findAppTint } from "./tints";

/**
 * Ephemeral interface state: layout toggles, overlays and drafts.
 * Everything here is either session state or mirrored into localStorage.
 */

export type ThemeChoice = "dark" | "light" | "system";
export type AccentChoice =
  | "default"
  | "cyan"
  | "blue"
  | "violet"
  | "emerald"
  | "teal"
  | "rose"
  | "orange"
  | "fuchsia"
  | "amber";
export type Density = "comfortable" | "compact";
export type StatusChoice = "online" | "idle" | "dnd" | "invisible" | "offline";

const STORAGE_KEY = "kyro.prefs.v1";

export interface Preferences {
  theme: ThemeChoice;
  accent: AccentChoice;
  density: Density;
  showMemberList: boolean;
  /** Play a soft ping when notifications arrive while the tab is hidden. */
  notificationSounds: boolean;
  /** App-wide colour tint: a preset id, "custom", or "none". */
  tint: string;
  /** Custom tint colours, used when `tint === "custom"`. */
  tintA: string;
  tintB: string;
  /** 0–100 wash strength applied to the active tint. */
  tintIntensity: number;
  /** Adopt the community's own colours while you're inside it. */
  useServerColours: boolean;
  /** Show people who just DM'd you as bubbles under Home in the rail. */
  unreadDmBubbles: boolean;
}

const DEFAULT_PREFS: Preferences = {
  theme: "dark",
  accent: "default",
  density: "comfortable",
  showMemberList: true,
  notificationSounds: true,
  tint: "none",
  tintA: "#f97316",
  tintB: "#ec4899",
  tintIntensity: 75,
  useServerColours: false,
  unreadDmBubbles: true,
};

function loadPrefs(): Preferences {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    return { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<Preferences>) };
  } catch {
    return DEFAULT_PREFS;
  }
}

function persist(prefs: Preferences) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* storage may be unavailable; preferences stay in memory */
  }
}

/** CSS variables the active tint owns; cleared when the tint turns off. */
const TINT_VARS = [
  "--primary",
  "--brand",
  "--ring",
  "--sidebar-primary",
  "--tint-a",
  "--tint-b",
  "--tint-strength",
  "--tint-keep",
  "--tint-soft-keep",
];

/** Recolours the app from the active tint (preset or custom colours). */
function applyTint(prefs: Preferences) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const tint =
    prefs.tint === "custom"
      ? { a: prefs.tintA, b: prefs.tintB, solid: prefs.tintB }
      : findAppTint(prefs.tint);
  if (!tint) {
    root.removeAttribute("data-tint");
    for (const variable of TINT_VARS) root.style.removeProperty(variable);
    return;
  }
  // 0–100 maps to a 0–12% background wash; 75 (default) lands at 9%.
  const strength = (
    Math.max(0, Math.min(100, prefs.tintIntensity) / 100) * 12
  ).toFixed(2);
  const intensity = Math.max(0, Math.min(100, prefs.tintIntensity));
  // The full app tint is deliberately much stronger than the decorative body
  // wash: at the default 75%, backgrounds visibly adopt the selected colours
  // while panels retain enough of their dark/light base for contrast.
  const keep = (100 - intensity * 0.56).toFixed(2);
  const softKeep = (100 - intensity * 0.37).toFixed(2);
  root.dataset.tint = prefs.tint;
  root.style.setProperty("--primary", tint.solid);
  root.style.setProperty("--brand", tint.solid);
  root.style.setProperty(
    "--ring",
    `color-mix(in oklab, ${tint.solid} 60%, transparent)`,
  );
  root.style.setProperty("--sidebar-primary", tint.solid);
  root.style.setProperty("--tint-a", tint.a);
  root.style.setProperty("--tint-b", tint.b);
  root.style.setProperty("--tint-strength", `${strength}%`);
  root.style.setProperty("--tint-keep", `${keep}%`);
  root.style.setProperty("--tint-soft-keep", `${softKeep}%`);
}

export function applyPreferences(prefs: Preferences) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const prefersDark = window.matchMedia?.(
    "(prefers-color-scheme: dark)",
  ).matches;
  const dark =
    prefs.theme === "dark" || (prefs.theme === "system" && prefersDark);
  root.classList.toggle("dark", dark);
  root.dataset.accent = prefs.accent === "default" ? "" : prefs.accent;
  root.dataset.density = prefs.density;
  applyTint(prefs);
}

interface AppState extends Preferences {
  mobileNavOpen: boolean;
  memberListOpen: boolean;
  searchOpen: boolean;
  inboxOpen: boolean;
  drafts: Record<string, string>;
  setPreference: <K extends keyof Preferences>(
    key: K,
    value: Preferences[K],
  ) => void;
  setMobileNav: (open: boolean) => void;
  toggleMemberList: () => void;
  setSearchOpen: (open: boolean) => void;
  setInboxOpen: (open: boolean) => void;
  setDraft: (key: string, value: string) => void;
  reset: () => void;
}

function pickPrefs(state: AppState): Preferences {
  return {
    theme: state.theme,
    accent: state.accent,
    density: state.density,
    showMemberList: state.showMemberList,
    notificationSounds: state.notificationSounds,
    tint: state.tint,
    tintA: state.tintA,
    tintB: state.tintB,
    tintIntensity: state.tintIntensity,
    useServerColours: state.useServerColours,
    unreadDmBubbles: state.unreadDmBubbles,
  };
}

const initial = loadPrefs();

export const useUiStore = create<AppState>((set, get) => ({
  ...initial,
  memberListOpen: initial.showMemberList,
  mobileNavOpen: false,
  searchOpen: false,
  inboxOpen: false,
  drafts: {},
  setPreference: (key, value) => {
    const next = { ...get(), [key]: value } as AppState;
    const prefs = pickPrefs(next);
    persist(prefs);
    applyPreferences(prefs);
    set({ [key]: value } as Partial<AppState>);
  },
  setMobileNav: (open) => set({ mobileNavOpen: open }),
  toggleMemberList: () =>
    set((state) => {
      const next = { ...state, showMemberList: !state.showMemberList };
      persist(pickPrefs(next));
      return { memberListOpen: next.showMemberList };
    }),
  setSearchOpen: (open) => set({ searchOpen: open }),
  setInboxOpen: (open) => set({ inboxOpen: open }),
  setDraft: (key, value) =>
    set((state) => ({ drafts: { ...state.drafts, [key]: value } })),
  reset: () =>
    set({ mobileNavOpen: false, searchOpen: false, inboxOpen: false }),
}));

if (typeof window !== "undefined") {
  applyPreferences(initial);
  window
    .matchMedia?.("(prefers-color-scheme: dark)")
    .addEventListener?.("change", () => {
      const { theme } = useUiStore.getState();
      if (theme === "system") applyPreferences({ ...loadPrefs(), theme });
    });
}
