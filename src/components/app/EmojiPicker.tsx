import { useMutation, useQuery } from "convex/react";
import { useDeferredValue, useMemo, useState } from "react";
import { Clock, Search, Star } from "@/components/icons";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import {
  customEmojiToken,
  EMOJI_CATEGORIES,
  type CustomEmoji,
} from "@/lib/emoji";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type EmojiChoice = {
  value: string;
  label: string;
  custom?: CustomEmoji;
};

function EmojiTile({
  choice,
  favorite,
  onSelect,
  onFavorite,
}: {
  choice: EmojiChoice;
  favorite: boolean;
  onSelect: () => void;
  onFavorite: () => void;
}) {
  return (
    <div className="group relative aspect-square">
      <button
        type="button"
        title={`${choice.label} · ${favorite ? "favorite" : "star to favorite"}`}
        onClick={onSelect}
        className="flex size-full items-center justify-center rounded-md p-1 text-xl hover:bg-surface"
      >
        {choice.custom?.url ? (
          <img
            src={choice.custom.url}
            alt={choice.label}
            className="size-7 object-contain"
            loading="lazy"
          />
        ) : (
          choice.value
        )}
      </button>
      <button
        type="button"
        aria-label={favorite ? "Remove emoji favorite" : "Favorite emoji"}
        title={favorite ? "Remove favorite" : "Add favorite"}
        onClick={onFavorite}
        className={cn(
          "absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-panel text-muted-foreground shadow ring-1 ring-border transition",
          favorite
            ? "text-warning opacity-100"
            : "opacity-0 hover:text-warning group-hover:opacity-100",
        )}
      >
        <Star className={cn("size-2.5", favorite && "fill-current")} />
      </button>
    </div>
  );
}

export function EmojiPicker({
  customEmojis = [],
  onSelect,
  className,
}: {
  customEmojis?: readonly CustomEmoji[];
  onSelect: (value: string) => void;
  className?: string;
}) {
  const preferences = useQuery(api.emojis.preferences);
  const recordUse = useMutation(api.emojis.recordUse);
  const setFavorite = useMutation(api.emojis.setFavorite);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("history");
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());

  const unicode = useMemo(
    () =>
      EMOJI_CATEGORIES.flatMap((group) =>
        group.emojis.map((emoji) => ({
          value: emoji,
          label: emoji,
          category: group.id,
        })),
      ),
    [],
  );
  const customChoices = useMemo(
    () =>
      customEmojis.map((emoji) => ({
        value: customEmojiToken(emoji),
        label: `:${emoji.name}:${emoji.serverName ? ` · ${emoji.serverName}` : ""}`,
        custom: emoji,
      })),
    [customEmojis],
  );
  const allChoices = useMemo<EmojiChoice[]>(
    () => [...customChoices, ...unicode],
    [customChoices, unicode],
  );
  const choiceMap = useMemo(
    () => new Map(allChoices.map((choice) => [choice.value, choice])),
    [allChoices],
  );
  const favoriteSet = useMemo(
    () => new Set(preferences?.favorites ?? []),
    [preferences?.favorites],
  );
  const serverGroups = useMemo(() => {
    const map = new Map<string, { name: string; choices: EmojiChoice[] }>();
    for (const choice of customChoices) {
      if (!choice.custom) continue;
      const group = map.get(choice.custom.serverId) ?? {
        name: choice.custom.serverName ?? "Community emojis",
        choices: [],
      };
      group.choices.push(choice);
      map.set(choice.custom.serverId, group);
    }
    return Array.from(map.entries()).sort((a, b) =>
      a[1].name.localeCompare(b[1].name),
    );
  }, [customChoices]);

  let visible: EmojiChoice[];
  let heading: string;
  if (deferredQuery) {
    visible = allChoices.filter((choice) =>
      choice.label.toLowerCase().includes(deferredQuery),
    );
    heading = "Search results";
  } else if (category === "history") {
    visible = (preferences?.recent ?? [])
      .map((value) => choiceMap.get(value))
      .filter((choice): choice is EmojiChoice => Boolean(choice));
    heading = "Recently used";
  } else if (category === "favorites") {
    visible = (preferences?.favorites ?? [])
      .map((value) => choiceMap.get(value))
      .filter((choice): choice is EmojiChoice => Boolean(choice));
    heading = "Favorites";
  } else if (category.startsWith("server:")) {
    visible =
      serverGroups.find(([id]) => `server:${id}` === category)?.[1].choices ??
      [];
    heading =
      serverGroups.find(([id]) => `server:${id}` === category)?.[1].name ??
      "Community emojis";
  } else {
    const id = category.replace(/^unicode:/, "");
    visible = unicode.filter((entry) => entry.category === id);
    heading =
      EMOJI_CATEGORIES.find((entry) => entry.id === id)?.label ?? "Emoji";
  }

  const choose = (value: string) => {
    void recordUse({ emoji: value }).catch(() => undefined);
    onSelect(value);
  };

  const toggle = (value: string) => {
    const favorite = !favoriteSet.has(value);
    void setFavorite({ emoji: value, favorite })
      .then(() =>
        toast.success(favorite ? "Emoji favorited." : "Favorite removed."),
      )
      .catch((error: unknown) =>
        toast.error(
          error instanceof Error ? error.message : "Could not save favorite.",
        ),
      );
  };

  return (
    <div className={cn("w-[min(24rem,calc(100vw-2rem))]", className)}>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search emojis"
          className="h-9 pl-8 text-sm"
          aria-label="Search emojis"
        />
      </div>

      {!deferredQuery ? (
        <div className="mt-2 flex gap-1 overflow-x-auto border-b border-border/60 pb-2">
          <button
            type="button"
            title="Recently used"
            onClick={() => setCategory("history")}
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-md",
              category === "history"
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:bg-surface",
            )}
          >
            <Clock className="size-4" />
          </button>
          <button
            type="button"
            title="Favorites"
            onClick={() => setCategory("favorites")}
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-md",
              category === "favorites"
                ? "bg-primary/15 text-warning"
                : "text-muted-foreground hover:bg-surface",
            )}
          >
            <Star className="size-4" />
          </button>
          {EMOJI_CATEGORIES.map((group) => (
            <button
              key={group.id}
              type="button"
              title={group.label}
              onClick={() => setCategory(`unicode:${group.id}`)}
              className={cn(
                "size-8 shrink-0 rounded-md text-base",
                category === `unicode:${group.id}`
                  ? "bg-primary/15"
                  : "text-muted-foreground hover:bg-surface",
              )}
            >
              {group.emojis[0]}
            </button>
          ))}
        </div>
      ) : null}

      {!deferredQuery && serverGroups.length > 0 ? (
        <select
          value={category.startsWith("server:") ? category : ""}
          onChange={(event) =>
            event.target.value && setCategory(event.target.value)
          }
          className="mt-2 h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground"
          aria-label="Select a server's emojis"
        >
          <option value="">Select a server's emojis…</option>
          {serverGroups.map(([id, group]) => (
            <option key={id} value={`server:${id}`}>
              {group.name} · {group.choices.length}
            </option>
          ))}
        </select>
      ) : null}

      <div className="mt-2 max-h-72 overflow-y-auto overscroll-contain pr-1">
        <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {heading}
        </p>
        {visible.length > 0 ? (
          <div className="grid grid-cols-8 gap-1">
            {visible.map((choice) => (
              <EmojiTile
                key={choice.value}
                choice={choice}
                favorite={favoriteSet.has(choice.value)}
                onSelect={() => choose(choice.value)}
                onFavorite={() => toggle(choice.value)}
              />
            ))}
          </div>
        ) : (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">
            {category === "history"
              ? "Your recently used emojis will appear here."
              : category === "favorites"
                ? "Star any emoji to keep it here."
                : "No emojis found."}
          </p>
        )}
      </div>
    </div>
  );
}
