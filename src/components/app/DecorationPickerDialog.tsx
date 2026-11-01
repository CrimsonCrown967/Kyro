import { useMutation } from "convex/react";
import { useDeferredValue, useState } from "react";
import { Check, Loader2, Search, Sparkles, X } from "@/components/icons";
import { ProfileDecorationLayer } from "@/components/app/DecorationArt";
import { UserAvatar, type AvatarUser } from "@/components/app/UserAvatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import {
  AVATAR_DECORATIONS,
  PROFILE_DECORATIONS,
  findAvatarDecoration,
  findProfileDecoration,
} from "@/lib/decorations";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Filter = "all" | "animated" | "static";

export function DecorationPickerDialog({
  kind,
  user,
  current,
  onOpenChange,
}: {
  kind: "avatar" | "profile";
  user: AvatarUser;
  current?: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const update = useMutation(api.users.updateProfile);
  const [selected, setSelected] = useState<string | null>(current ?? null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const source = kind === "avatar" ? AVATAR_DECORATIONS : PROFILE_DECORATIONS;
  const items = source.filter((item) => {
    if (filter === "animated" && !item.animated) return false;
    if (filter === "static" && item.animated) return false;
    if (!deferredQuery) return true;
    return (
      item.label.toLowerCase().includes(deferredQuery) ||
      item.description.toLowerCase().includes(deferredQuery)
    );
  });
  const selectedItem =
    kind === "avatar"
      ? findAvatarDecoration(selected)
      : findProfileDecoration(selected);

  const apply = async () => {
    setBusy(true);
    try {
      if (kind === "avatar") {
        await update({ avatarDecoration: selected });
      } else {
        await update({ profileDecoration: selected });
      }
      toast.success(
        `${kind === "avatar" ? "Avatar" : "Profile"} decoration saved.`,
      );
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save decoration.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92dvh] flex-col overflow-hidden p-0 sm:max-w-5xl">
        <DialogHeader className="border-b border-border/60 px-5 pb-4 pt-5 text-left">
          <DialogTitle>
            {kind === "avatar" ? "Avatar decorations" : "Profile decorations"}
          </DialogTitle>
          <DialogDescription>
            {kind === "avatar"
              ? "Pick an original Kyro overlay for your avatar. It appears anywhere your avatar does."
              : "Decorate your full profile card with a static or animated overlay."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="flex min-h-0 flex-col border-r border-border/60">
            <div className="space-y-3 border-b border-border/60 p-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search decorations"
                  className="pl-9"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {(["all", "animated", "static"] as Filter[]).map((entry) => (
                  <Button
                    key={entry}
                    type="button"
                    size="sm"
                    variant={filter === entry ? "default" : "outline"}
                    className="capitalize"
                    onClick={() => setFilter(entry)}
                  >
                    {entry}
                  </Button>
                ))}
                <span className="ml-auto self-center text-xs text-muted-foreground">
                  {items.length} shown
                </span>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className={cn(
                    "relative flex min-h-44 flex-col items-center justify-center rounded-xl border bg-surface p-3 text-center",
                    selected === null
                      ? "border-primary ring-1 ring-primary/60"
                      : "border-border/70 hover:border-primary/40",
                  )}
                >
                  {selected === null && (
                    <Check className="absolute right-2 top-2 size-4 text-primary" />
                  )}
                  <span className="flex size-14 items-center justify-center rounded-full border border-dashed border-border text-muted-foreground">
                    <X className="size-5" />
                  </span>
                  <span className="mt-3 text-sm font-semibold">None</span>
                  <span className="mt-1 text-xs text-muted-foreground">
                    Use your avatar or profile without an overlay.
                  </span>
                </button>

                {items.map((item) => {
                  const active = selected === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelected(item.id)}
                      className={cn(
                        "relative flex min-h-44 flex-col rounded-xl border bg-surface p-3 text-left transition-colors",
                        active
                          ? "border-primary ring-1 ring-primary/60"
                          : "border-border/70 hover:border-primary/40",
                      )}
                      style={{ contentVisibility: "auto" }}
                    >
                      {active && (
                        <Check className="absolute right-2 top-2 z-20 size-4 text-primary" />
                      )}
                      <span className="flex h-16 items-center justify-center">
                        {kind === "avatar" ? (
                          <UserAvatar
                            user={{ ...user, avatarDecoration: item.id }}
                            size="md"
                            showStatus={false}
                          />
                        ) : (
                          <span className="relative block h-14 w-full overflow-hidden rounded-lg bg-gradient-to-br from-panel to-background ring-1 ring-border/70">
                            <ProfileDecorationLayer decorationId={item.id} />
                            <span className="relative z-10 flex size-full items-end p-2 text-[10px] font-bold">
                              Profile
                            </span>
                          </span>
                        )}
                      </span>
                      <span className="mt-2 flex items-center gap-1.5 text-sm font-semibold">
                        {item.label}
                        {item.animated && (
                          <Sparkles className="size-3.5 text-primary" />
                        )}
                      </span>
                      <span className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                        {item.description}
                      </span>
                      <span className="mt-auto pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                        {item.animated ? "Animated" : "Static"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <aside className="flex flex-col bg-panel/50 p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Preview
            </p>
            {kind === "avatar" ? (
              <div className="flex flex-1 items-center justify-center py-10">
                <UserAvatar
                  user={{ ...user, avatarDecoration: selected }}
                  size="2xl"
                />
              </div>
            ) : (
              <div className="relative my-6 min-h-72 overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-br from-primary/35 via-panel to-background p-5 shadow-lg">
                <ProfileDecorationLayer decorationId={selected} />
                <div className="relative z-10">
                  <UserAvatar user={user} size="lg" />
                  <p className="mt-4 text-lg font-bold">{user.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Profile preview
                  </p>
                  <div className="mt-5 rounded-xl bg-black/15 p-3 text-xs leading-relaxed">
                    Decorations sit above the profile theme while keeping text
                    and controls readable.
                  </div>
                </div>
              </div>
            )}
            <div className="rounded-xl border border-border/70 bg-surface p-3">
              <p className="text-sm font-semibold">
                {selectedItem?.label ?? "No decoration"}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {selectedItem?.description ??
                  "Keep the original Kyro profile appearance."}
              </p>
              {selectedItem && (
                <span className="mt-2 inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                  {selectedItem.animated ? "Animated" : "Static"}
                </span>
              )}
            </div>
            <Button
              className="mt-4"
              disabled={busy}
              onClick={() => void apply()}
            >
              {busy && <Loader2 className="mr-1.5 size-4 animate-spin" />}
              Apply decoration
            </Button>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}
