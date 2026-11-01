import { useAction, useConvex, useMutation } from "convex/react";
import { Paperclip, Send, Smile, X } from "@/components/icons";
import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { ReplyTarget } from "@/components/app/MessageList";
import { formatBytes } from "@/lib/format";
import { useUiStore } from "@/lib/store";
import {
  ACCEPTED_UPLOAD,
  MAX_ATTACHMENTS,
  useUploadFile,
  type PendingAttachment,
} from "@/lib/upload";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { EmojiPicker } from "@/components/app/EmojiPicker";
import { UserAvatar } from "@/components/app/UserAvatar";
import type { CustomEmoji } from "@/lib/emoji";
import { GifPicker } from "@/components/app/GifPicker";
import { StyledDisplayName } from "@/components/app/StyledDisplayName";

export interface MentionUser {
  id: string;
  name: string;
  username: string | null;
  avatarUrl?: string | null;
  displayNameFont?: string | null;
  displayNameColorMode?: "none" | "solid" | "gradient" | null;
  displayNameColor?: string | null;
  displayNameColor2?: string | null;
}

export function Composer({
  containerType,
  containerId,
  reply,
  onCancelReply,
  disabledReason,
  onSent,
  mentionUsers = [],
  allowMassMentions = false,
}: {
  containerType: "channel" | "conversation";
  containerId: string;
  reply: ReplyTarget | null;
  onCancelReply: () => void;
  disabledReason?: string | null;
  onSent?: () => void;
  mentionUsers?: MentionUser[];
  allowMassMentions?: boolean;
}) {
  const draftKey = `${containerType}:${containerId}`;
  const draft = useUiStore((state) => state.drafts[draftKey] ?? "");
  const setDraft = useUiStore((state) => state.setDraft);
  const sendMessage = useMutation(api.messages.send);
  const setTyping = useMutation(api.messages.setTyping);
  const upload = useUploadFile();
  const convex = useConvex();
  const registerGifShare = useAction(api.gifs.registerShare);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [uploading, setUploading] = useState(0);
  const [busy, setBusy] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [gifOpen, setGifOpen] = useState(false);
  const [customEmojis, setCustomEmojis] = useState<CustomEmoji[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastTypingRef = useRef(0);

  const updateMentionState = (value: string, cursor: number | null) => {
    if (cursor === null) {
      setMentionQuery(null);
      setMentionStart(null);
      return;
    }
    const before = value.slice(0, cursor);
    const match = before.match(/(?:^|\s)@([a-zA-Z0-9_]*)$/);
    if (!match) {
      setMentionQuery(null);
      setMentionStart(null);
      return;
    }
    setMentionQuery(match[1].toLowerCase());
    setMentionStart(cursor - match[1].length - 1);
    setMentionIndex(0);
  };

  const mentionOptions = [
    ...(allowMassMentions
      ? [
          { id: "everyone", name: "Everyone", username: "everyone" },
          { id: "here", name: "Here", username: "here" },
        ]
      : []),
    ...mentionUsers.filter((user) => Boolean(user.username)),
  ]
    .filter((user) => {
      const query = mentionQuery ?? "";
      return (
        user.username?.toLowerCase().includes(query) ||
        user.name.toLowerCase().includes(query)
      );
    })
    .slice(0, 8);

  const insertMention = (username: string) => {
    const cursor = textareaRef.current?.selectionStart ?? draft.length;
    if (mentionStart === null) return;
    const next = `${draft.slice(0, mentionStart)}@${username} ${draft.slice(cursor)}`;
    setDraft(draftKey, next);
    setMentionQuery(null);
    setMentionStart(null);
    requestAnimationFrame(() => {
      const position = mentionStart + username.length + 2;
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(position, position);
    });
  };

  const loadCustomEmojis = async () => {
    try {
      const rows = await convex.query(api.emojis.available, {});
      setCustomEmojis(rows);
    } catch {
      // Compatibility with the current production backend: custom emojis
      // simply stay hidden until the new Convex module is deployed.
      setCustomEmojis([]);
    }
  };

  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = "0px";
    element.style.height = `${Math.min(element.scrollHeight, 220)}px`;
  }, [draft]);

  const send = async () => {
    const content = draft.trim();
    if (!content && attachments.length === 0) return;
    if (busy) return;
    setBusy(true);
    const clientId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`;
    try {
      await sendMessage({
        containerType,
        containerId,
        content,
        clientId,
        replyToId: reply?.id as Id<"messages"> | undefined,
        attachments: attachments.length > 0 ? attachments : undefined,
      });
      setDraft(draftKey, "");
      setMentionQuery(null);
      setAttachments([]);
      onCancelReply();
      onSent?.();
      textareaRef.current?.focus();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Message failed to send.",
      );
    } finally {
      setBusy(false);
    }
  };

  const addFiles = async (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return;
    const room = MAX_ATTACHMENTS - attachments.length;
    if (room <= 0) {
      toast.error(`You can attach up to ${MAX_ATTACHMENTS} files.`);
      return;
    }
    const chosen = Array.from(files).slice(0, room);
    setUploading((count) => count + chosen.length);
    for (const file of chosen) {
      try {
        const stored = await upload(file);
        setAttachments((state) => [...state, stored]);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Upload failed.");
      } finally {
        setUploading((count) => count - 1);
      }
    }
  };

  if (disabledReason) {
    return (
      <div className="mx-4 mb-4 rounded-xl border border-border/70 bg-panel/80 px-4 py-3 text-center text-sm text-muted-foreground">
        {disabledReason}
      </div>
    );
  }

  return (
    <div className="bg-transparent px-3 pb-4 pt-2 sm:px-5">
      {reply && (
        <div className="mb-1 flex items-center justify-between rounded-t-lg border border-b-0 border-border/70 bg-surface px-3 py-1.5 text-xs text-muted-foreground">
          <span className="truncate">
            Replying to{" "}
            <span className="font-medium text-foreground">{reply.author}</span>
            {" — "}
            <span className="truncate">{reply.excerpt}</span>
          </span>
          <button
            type="button"
            aria-label="Cancel reply"
            onClick={onCancelReply}
            className="rounded p-0.5 hover:bg-background"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 rounded-t-lg border border-b-0 border-border/70 bg-surface p-2">
          {attachments.map((attachment) => (
            <span
              key={attachment.storageId}
              className="flex items-center gap-2 rounded-md border border-border/70 bg-panel px-2 py-1 text-xs"
            >
              <span className="max-w-40 truncate">{attachment.name}</span>
              <span className="text-muted-foreground">
                {formatBytes(attachment.size)}
              </span>
              <button
                type="button"
                aria-label={`Remove ${attachment.name}`}
                onClick={() =>
                  setAttachments((state) =>
                    state.filter(
                      (item) => item.storageId !== attachment.storageId,
                    ),
                  )
                }
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="size-3.5" />
              </button>
            </span>
          ))}
          {uploading > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              Uploading {uploading}…
            </span>
          )}
        </div>
      )}

      <div
        className={cn(
          "relative flex items-end gap-1 rounded-2xl border border-input bg-panel/90 px-2.5 py-2 shadow-[0_8px_30px_rgba(0,0,0,.13)] backdrop-blur-xl focus-within:border-primary/70 focus-within:ring-1 focus-within:ring-primary/25",
          (attachments.length > 0 || reply) && "rounded-t-none",
        )}
      >
        <label
          className="cursor-pointer rounded-md p-2 text-muted-foreground hover:bg-background hover:text-foreground"
          title="Attach files"
        >
          <Paperclip className="size-4" />
          <input
            type="file"
            multiple
            accept={ACCEPTED_UPLOAD}
            className="hidden"
            onChange={(event) => {
              void addFiles(event.target.files);
              event.target.value = "";
            }}
          />
        </label>

        <textarea
          ref={textareaRef}
          rows={1}
          value={draft}
          onChange={(event) => {
            setDraft(draftKey, event.target.value);
            updateMentionState(event.target.value, event.target.selectionStart);
            const now = Date.now();
            if (now - lastTypingRef.current > 4000) {
              lastTypingRef.current = now;
              void setTyping({ containerType, containerId }).catch(
                () => undefined,
              );
            }
          }}
          onKeyDown={(event) => {
            if (mentionQuery !== null && mentionOptions.length > 0) {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                setMentionIndex((current) =>
                  event.key === "ArrowDown"
                    ? (current + 1) % mentionOptions.length
                    : (current - 1 + mentionOptions.length) %
                      mentionOptions.length,
                );
                return;
              }
              if (event.key === "Tab" || event.key === "Enter") {
                event.preventDefault();
                const selected =
                  mentionOptions[mentionIndex] ?? mentionOptions[0];
                if (selected.username) insertMention(selected.username);
                return;
              }
              if (event.key === "Escape") {
                event.preventDefault();
                setMentionQuery(null);
                return;
              }
            }
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
          // Paste images (screenshots, GIFs, copied files) straight from the
          // clipboard — the browser's own text paste still works untouched.
          onPaste={(event) => {
            const pasted = Array.from(event.clipboardData?.files ?? []);
            if (pasted.length > 0) {
              event.preventDefault();
              void addFiles(pasted);
            }
          }}
          placeholder="Message…"
          className="max-h-56 min-h-9 flex-1 resize-none bg-transparent py-1.5 text-sm leading-6 outline-none placeholder:text-muted-foreground"
        />

        {mentionQuery !== null && mentionOptions.length > 0 && (
          <div className="absolute bottom-full left-2 right-2 z-30 mb-2 overflow-hidden rounded-xl border border-border/70 bg-popover p-1 shadow-xl">
            <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Mentions
            </p>
            {mentionOptions.map((user, index) => {
              const mass = user.id === "everyone" || user.id === "here";
              return (
                <button
                  key={user.id}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => user.username && insertMention(user.username)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left",
                    index === mentionIndex
                      ? "bg-primary/15"
                      : "hover:bg-surface",
                  )}
                >
                  {mass ? (
                    <span className="flex size-7 items-center justify-center rounded-full bg-warning/15 text-sm font-bold text-warning">
                      @
                    </span>
                  ) : (
                    <UserAvatar user={user} size="xs" showStatus={false} />
                  )}
                  <span className="min-w-0 flex-1">
                    {mass ? (
                      <span className="block truncate text-sm font-medium">
                        @{user.username}
                      </span>
                    ) : (
                      <StyledDisplayName
                        user={user}
                        className="block truncate text-sm"
                      />
                    )}
                    <span className="block truncate text-xs text-muted-foreground">
                      {mass
                        ? user.id === "everyone"
                          ? "Notify every server member"
                          : "Notify members currently online"
                        : `@${user.username}`}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <Popover
          open={emojiOpen}
          onOpenChange={(open) => {
            setEmojiOpen(open);
            if (open) void loadCustomEmojis();
          }}
        >
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="Emoji"
              className="rounded-md p-2 text-muted-foreground hover:bg-background hover:text-foreground"
            >
              <Smile className="size-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-auto p-3">
            <EmojiPicker
              customEmojis={customEmojis}
              onSelect={(emoji) => {
                const cursor =
                  textareaRef.current?.selectionStart ?? draft.length;
                const next = `${draft.slice(0, cursor)}${emoji}${draft.slice(cursor)}`;
                setDraft(draftKey, next);
                setEmojiOpen(false);
                requestAnimationFrame(() => textareaRef.current?.focus());
              }}
            />
          </PopoverContent>
        </Popover>

        <Popover open={gifOpen} onOpenChange={setGifOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="GIFs"
              className="rounded-md px-1.5 py-2 text-[10px] font-black tracking-tight text-muted-foreground hover:bg-background hover:text-foreground"
            >
              GIF
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-auto p-3">
            <GifPicker
              onSelect={(gif) => {
                const separator = draft.trim() ? "\n" : "";
                setDraft(draftKey, `${draft}${separator}${gif.url}`);
                setGifOpen(false);
                void registerGifShare({ slug: gif.slug }).catch(
                  () => undefined,
                );
                requestAnimationFrame(() => textareaRef.current?.focus());
              }}
            />
          </PopoverContent>
        </Popover>

        <Button
          size="icon"
          variant="ghost"
          onClick={() => void send()}
          disabled={busy || (!draft.trim() && attachments.length === 0)}
          aria-label="Send message"
          className="text-primary hover:bg-primary/10"
        >
          <Send className="size-4" />
        </Button>
      </div>

      <p className="mt-1 hidden text-[11px] text-muted-foreground sm:block">
        <span className="rounded border border-border/70 px-1">Enter</span> to
        send ·{" "}
        <span className="rounded border border-border/70 px-1">
          Shift+Enter
        </span>{" "}
        for a new line · Markdown and code blocks supported
      </p>
    </div>
  );
}
