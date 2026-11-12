import { Palette } from "@/components/icons";
import { useUiStore, type AccentChoice, type ThemeChoice } from "@/lib/store";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const accents: { value: AccentChoice; label: string; color: string }[] = [
  { value: "default", label: "Kyro violet", color: "#9580ff" },
  { value: "cyan", label: "Ocean", color: "#0e9fd8" },
  { value: "emerald", label: "Mint", color: "#10b981" },
  { value: "rose", label: "Rose", color: "#f43f5e" },
  { value: "orange", label: "Sunset", color: "#f97316" },
];
export function QuickAppearance() {
  const { theme, accent, density, setPreference } = useUiStore();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Quick appearance"
          title="Make Kyro yours"
          className="rounded-xl p-2 text-muted-foreground transition-colors hover:bg-surface hover:text-primary"
        >
          <Palette className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 rounded-2xl p-5">
        <p className="font-semibold">Make yourself at home.</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Your colors. Your kind of quiet.
        </p>
        <div
          aria-label="Theme"
          role="group"
          className="mt-5 grid grid-cols-3 gap-1 rounded-xl bg-surface p-1"
        >
          {(["dark", "light", "system"] as ThemeChoice[]).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={theme === value}
              aria-label={value[0].toUpperCase() + value.slice(1)}
              onClick={() => setPreference("theme", value)}
              className={cn(
                "rounded-lg py-2 text-xs capitalize",
                theme === value
                  ? "bg-panel font-semibold shadow-sm"
                  : "text-muted-foreground",
              )}
            >
              {value}
            </button>
          ))}
        </div>
        <p className="mb-3 mt-5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Accent color
        </p>
        <div
          className="flex justify-between"
          role="group"
          aria-label="Accent color"
        >
          {accents.map((choice) => (
            <button
              key={choice.value}
              type="button"
              aria-label={choice.label}
              aria-pressed={accent === choice.value}
              title={choice.label}
              onClick={() => {
                setPreference("tint", "none");
                setPreference("accent", choice.value);
              }}
              className={cn(
                "grid size-9 place-items-center rounded-full border-2 border-transparent",
                accent === choice.value && "border-foreground",
              )}
            >
              <span
                className="size-6 rounded-full"
                style={{ background: choice.color }}
              />
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-pressed={density === "compact"}
          onClick={() =>
            setPreference(
              "density",
              density === "compact" ? "comfortable" : "compact",
            )
          }
          className="mt-5 flex w-full items-center justify-between rounded-xl border border-border p-3 text-xs"
        >
          <span>Compact messages</span>
          <span className="text-primary">
            {density === "compact" ? "On" : "Off"}
          </span>
        </button>
      </PopoverContent>
    </Popover>
  );
}
