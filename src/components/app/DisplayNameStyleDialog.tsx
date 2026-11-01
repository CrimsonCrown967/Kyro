import { useMutation } from "convex/react";
import { useState } from "react";
import { Loader2, Sparkles, X } from "@/components/icons";
import { StyledDisplayName } from "@/components/app/StyledDisplayName";
import { UserAvatar } from "@/components/app/UserAvatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/convex/_generated/api";
import {
  DISPLAY_NAME_COLOUR_PRESETS,
  DISPLAY_NAME_FONTS,
  type DisplayNameColorMode,
  type DisplayNameFont,
  type DisplayNameStyledUser,
} from "@/lib/displayName";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const MODE_OPTIONS: { id: DisplayNameColorMode; label: string }[] = [
  { id: "none", label: "None" },
  { id: "solid", label: "Solid" },
  { id: "gradient", label: "Gradient" },
];

export function DisplayNameStyleDialog({
  user,
  onOpenChange,
}: {
  user: DisplayNameStyledUser & {
    id: string;
    username: string | null;
    avatarUrl: string | null;
  };
  onOpenChange: (open: boolean) => void;
}) {
  const update = useMutation(api.users.updateProfile);
  const [font, setFont] = useState<DisplayNameFont>(
    (DISPLAY_NAME_FONTS.some((entry) => entry.id === user.displayNameFont)
      ? user.displayNameFont
      : "default") as DisplayNameFont,
  );
  const [mode, setMode] = useState<DisplayNameColorMode>(
    user.displayNameColorMode ?? "none",
  );
  const [first, setFirst] = useState(user.displayNameColor ?? "#f97316");
  const [second, setSecond] = useState(user.displayNameColor2 ?? "#a855f7");
  const [busy, setBusy] = useState(false);

  const previewUser = {
    ...user,
    displayNameFont: font,
    displayNameColorMode: mode,
    displayNameColor: first,
    displayNameColor2: second,
  };

  const apply = async () => {
    setBusy(true);
    try {
      await update({
        displayNameFont: font,
        displayNameColorMode: mode,
        displayNameColor: mode === "none" ? "" : first,
        displayNameColor2: mode === "gradient" ? second : "",
      });
      toast.success("Display name style saved.");
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not save your display name style.",
      );
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setFont("default");
    setMode("none");
    setFirst("#f97316");
    setSecond("#a855f7");
  };

  const surprise = () => {
    const nextFont =
      DISPLAY_NAME_FONTS[Math.floor(Math.random() * DISPLAY_NAME_FONTS.length)];
    const colours =
      DISPLAY_NAME_COLOUR_PRESETS[
        Math.floor(Math.random() * DISPLAY_NAME_COLOUR_PRESETS.length)
      ];
    setFont(nextFont.id);
    setMode(Math.random() > 0.35 ? "gradient" : "solid");
    setFirst(colours[0]);
    setSecond(colours[1]);
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Display name style</DialogTitle>
          <DialogDescription>
            Pick how your display name looks across profiles, messages, friends,
            and member lists. Server role colours still take priority.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
          <div className="space-y-6">
            <section>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Choose font
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {DISPLAY_NAME_FONTS.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    title={entry.label}
                    onClick={() => setFont(entry.id)}
                    className={cn(
                      "flex h-16 items-center justify-center rounded-xl border bg-surface text-xl transition-colors",
                      font === entry.id
                        ? "border-primary ring-1 ring-primary/60"
                        : "border-border/70 hover:border-primary/40",
                    )}
                    style={{
                      fontFamily: entry.family,
                      fontWeight: entry.weight,
                      letterSpacing: entry.tracking,
                    }}
                  >
                    Gg
                  </button>
                ))}
              </div>
            </section>

            <section>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Choose colour
              </p>
              <div className="flex flex-wrap gap-2">
                {MODE_OPTIONS.map((entry) => (
                  <Button
                    key={entry.id}
                    type="button"
                    variant={mode === entry.id ? "default" : "outline"}
                    onClick={() => setMode(entry.id)}
                  >
                    {entry.label}
                  </Button>
                ))}
              </div>

              {mode !== "none" && (
                <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-8">
                  {DISPLAY_NAME_COLOUR_PRESETS.map((colours) => {
                    const active =
                      first === colours[0] &&
                      (mode === "solid" || second === colours[1]);
                    return (
                      <button
                        key={`${colours[0]}-${colours[1]}`}
                        type="button"
                        aria-label={`Use ${colours[0]}${
                          mode === "gradient" ? ` to ${colours[1]}` : ""
                        }`}
                        onClick={() => {
                          setFirst(colours[0]);
                          setSecond(colours[1]);
                        }}
                        className={cn(
                          "aspect-[1.35] rounded-lg border border-white/10",
                          active &&
                            "ring-2 ring-primary ring-offset-2 ring-offset-background",
                        )}
                        style={{
                          background:
                            mode === "gradient"
                              ? `linear-gradient(120deg, ${colours[0]}, ${colours[1]})`
                              : colours[0],
                        }}
                      />
                    );
                  })}
                </div>
              )}

              {mode !== "none" && (
                <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-border/70 bg-surface p-3">
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    First
                    <input
                      type="color"
                      value={first}
                      onChange={(event) => setFirst(event.target.value)}
                      className="size-8 cursor-pointer rounded border border-border bg-transparent"
                    />
                  </label>
                  {mode === "gradient" && (
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      Second
                      <input
                        type="color"
                        value={second}
                        onChange={(event) => setSecond(event.target.value)}
                        className="size-8 cursor-pointer rounded border border-border bg-transparent"
                      />
                    </label>
                  )}
                </div>
              )}
            </section>
          </div>

          <aside className="space-y-3 rounded-2xl border border-border/70 bg-panel p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Preview
            </p>
            <div className="rounded-xl border border-border/70 bg-background p-4 text-center">
              <UserAvatar user={user} size="lg" />
              <StyledDisplayName
                user={previewUser}
                className="mt-3 block truncate text-lg"
              />
              <p className="truncate text-xs text-muted-foreground">
                @{user.username ?? "username"}
              </p>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-background p-3">
              <UserAvatar user={user} size="sm" />
              <div className="min-w-0">
                <StyledDisplayName
                  user={previewUser}
                  className="block truncate text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  does anyone read this?
                </p>
              </div>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              In a community, a role colour beats your personal colour. Your
              selected font still stays visible.
            </p>
          </aside>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-border/60 pt-4">
          <Button type="button" variant="ghost" onClick={surprise}>
            <Sparkles className="mr-1.5 size-4" /> Surprise me
          </Button>
          <Button type="button" variant="ghost" onClick={reset}>
            <X className="mr-1.5 size-4" /> Reset
          </Button>
          <Button type="button" onClick={() => void apply()} disabled={busy}>
            {busy && <Loader2 className="mr-1.5 size-4 animate-spin" />}
            Apply
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
