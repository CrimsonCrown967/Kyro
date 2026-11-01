import { useDeferredValue, useMemo, useState } from "react";
import { Search } from "@/components/icons";
import { Input } from "@/components/ui/input";
import {
  customEmojiToken,
  EMOJI_CATEGORIES,
  type CustomEmoji,
} from "@/lib/emoji";
import { cn } from "@/lib/utils";

export function EmojiPicker({
  customEmojis = [],
  onSelect,
  className,
}: {
  customEmojis?: readonly CustomEmoji[];
  onSelect: (value: string) => void;
  className?: string;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>(
    customEmojis.length > 0 ? "custom" : EMOJI_CATEGORIES[0].id,
  );
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const customMatches = useMemo(
    () =>
      customEmojis.filter(
        (emoji) =>
          !deferredQuery ||
          emoji.name.toLowerCase().includes(deferredQuery) ||
          emoji.serverName?.toLowerCase().includes(deferredQuery),
      ),
    [customEmojis, deferredQuery],
  );
  const unicode = useMemo(
    () =>
      EMOJI_CATEGORIES.flatMap((group) =>
        group.emojis.map((emoji) => ({ emoji, category: group.id })),
      ),
    [],
  );
  const visibleUnicode = deferredQuery
    ? unicode
    : unicode.filter((entry) => entry.category === category);

  return (
    <div className={cn("w-[min(22rem,calc(100vw-2rem))]", className)}>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search custom emojis"
          className="h-9 pl-8 text-sm"
          aria-label="Search emojis"
        />
      </div>

      {!deferredQuery && (
        <div className="mt-2 flex gap-1 overflow-x-auto border-b border-border/60 pb-2">
          {customEmojis.length > 0 && (
            <button
              type="button"
              onClick={() => setCategory("custom")}
              className={cn(
                "shrink-0 rounded-md px-2 py-1 text-xs",
                category === "custom"
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-surface",
              )}
            >
              Custom
            </button>
          )}
          {EMOJI_CATEGORIES.map((group) => (
            <button
              key={group.id}
              type="button"
              title={group.label}
              onClick={() => setCategory(group.id)}
              className={cn(
                "shrink-0 rounded-md px-2 py-1 text-base",
                category === group.id
                  ? "bg-primary/15"
                  : "text-muted-foreground hover:bg-surface",
              )}
            >
              {group.emojis[0]}
            </button>
          ))}
        </div>
      )}

      <div className="mt-2 max-h-64 overflow-y-auto overscroll-contain pr-1">
        {(category === "custom" || deferredQuery) &&
          customMatches.length > 0 && (
            <section>
              <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Custom emojis
              </p>
              <div className="grid grid-cols-8 gap-1">
                {customMatches.map((emoji) => (
                  <button
                    key={emoji.id}
                    type="button"
                    title={`:${emoji.name}:${emoji.serverName ? ` · ${emoji.serverName}` : ""}`}
                    onClick={() => onSelect(customEmojiToken(emoji))}
                    className="flex aspect-square items-center justify-center rounded-md p-1 hover:bg-surface"
                  >
                    {emoji.url ? (
                      <img
                        src={emoji.url}
                        alt={`:${emoji.name}:`}
                        className="size-7 object-contain"
                        loading="lazy"
                      />
                    ) : (
                      <span className="text-xs">:{emoji.name}:</span>
                    )}
                  </button>
                ))}
              </div>
            </section>
          )}

        {(category !== "custom" || deferredQuery) && (
          <section className={customMatches.length > 0 ? "mt-3" : ""}>
            <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {deferredQuery
                ? "Standard emojis"
                : EMOJI_CATEGORIES.find((entry) => entry.id === category)
                    ?.label}
            </p>
            <div className="grid grid-cols-8 gap-1">
              {visibleUnicode.map(({ emoji }, index) => (
                <button
                  key={`${emoji}-${index}`}
                  type="button"
                  onClick={() => onSelect(emoji)}
                  className="rounded-md p-1 text-xl hover:bg-surface"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </section>
        )}

        {category === "custom" && customMatches.length === 0 && (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">
            No custom emojis available yet.
          </p>
        )}
      </div>
    </div>
  );
}
