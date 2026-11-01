import { useConvex, useMutation, useQuery } from "convex/react";
import {
  AlertTriangle,
  Copy,
  CornerUpLeft,
  Ellipsis,
  Loader2,
  Pencil,
  Phone,
  PhoneOff,
  Reply,
  SmilePlus,
  Trash2,
} from "@/components/icons";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { DeviceBadge, UserAvatar } from "@/components/app/UserAvatar";
import { ServerTagChip } from "@/components/app/ServerTag";
import {
  extractInviteCodes,
  ServerInviteCard,
} from "@/components/app/ServerInviteCard";
import { CrownBadge } from "@/components/app/CrownBadge";
import { InlineBadge } from "@/components/app/GlobalBadges";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { dayKey, dayLabel, formatTime, type PresenceState } from "@/lib/format";
import { renderMessage } from "@/lib/markdown";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { CustomEmoji } from "@/lib/emoji";
import { EmojiPicker } from "@/components/app/EmojiPicker";
import { StyledDisplayName } from "@/components/app/StyledDisplayName";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

export interface MessageAuthor {
  id: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
  presence: PresenceState;
  isFounder?: boolean;
  /** Global badges (hydrated server-side) — highest is shown inline. */ badges?: string[];
  /** The badge this author picked to show next to their name. */
  primaryBadge?: string | null;
  /** Community tag worn next to the name, e.g. "HTML". */
  serverTag?: string | null;
  /** Device the author is on, for the platform indicator. */
  device?: string | null;
  displayNameFont?: string | null;
  displayNameColorMode?: "none" | "solid" | "gradient" | null;
  displayNameColor?: string | null;
  displayNameColor2?: string | null;
}

export interface MessageDto {
  id: string;
  content: string;
  /** Call records render as their own system row instead of a chat bubble. */
  kind?: "call_missed" | "call_ended" | null;
  callDurationMs?: number | null;
  createdAt: number;
  editedAt: number | null;
  author: MessageAuthor | null;
  authorId: string;
  attachments: {
    storageId: string;
    name: string;
    size: number;
    mimeType: string;
    url: string | null;
  }[];
  reactions: {
    emoji: string;
    userIds: string[];
    count: number;
    mine: boolean;
    /** Resolved URL when the reaction is a server's custom emoji. */
    url?: string | null;
  }[];
  replyTo: { id: string; excerpt: string; author: MessageAuthor | null } | null;
  customEmojis?: CustomEmoji[];
}

export interface MessageListResult {
  messages: MessageDto[];
  hasMore: boolean;
  oldest: number | null;
  lastReadAt: number;
}

export interface ReplyTarget {
  id: string;
  author: string;
  excerpt: string;
}

const DIRECT_MEDIA_PATTERN =
  /https?:\/\/[^\s<>()]+\.(?:gif|png|jpe?g|webp|avif)(?:[?#][^\s<>()]*)?/gi;

function mediaUrls(content: string): string[] {
  return Array.from(new Set(content.match(DIRECT_MEDIA_PATTERN) ?? [])).slice(
    0,
    4,
  );
}

export function MessageList({
  containerType,
  containerId,
  serverId,
  serverOwnerId,
  canManageMessages,
  currentUserId,
  onReply,
  onReport,
  roleColors,
  mentionUsers = [],
}: {
  containerType: "channel" | "conversation";
  containerId: string;
  serverId?: string;
  /** Owner of the server this channel belongs to; their crown is only shown
   *  inside server views, which only members can reach. */
  serverOwnerId?: string;
  canManageMessages: boolean;
  currentUserId: string;
  onReply: (target: ReplyTarget) => void;
  onReport: (message: MessageDto) => void;
  roleColors?: Record<string, string>;
  mentionUsers?: { id: string; name: string; username: string | null }[];
}) {
  const [olderPages, setOlderPages] = useState<MessageDto[][]>([]);
  const [cursor, setCursor] = useState<{
    container: string;
    at: number;
  } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Jump straight to the newest message when a conversation is (re)opened;
  // without this the list starts at the top and shows the oldest history.
  const jumpToBottomRef = useRef(true);
  const [media, setMedia] = useState<{ url: string; label: string } | null>(
    null,
  );

  const latest = useQuery(api.messages.list, {
    containerType,
    containerId,
    limit: 50,
  }) as MessageListResult | undefined;

  // A cursor left behind by the previous conversation is ignored and cleared.
  const activeCursor =
    cursor && cursor.container === containerId ? cursor : null;

  const older = useQuery(
    api.messages.list,
    activeCursor === null
      ? "skip"
      : { containerType, containerId, before: activeCursor.at, limit: 50 },
  ) as MessageListResult | undefined;

  // Reset local history whenever the conversation changes. Adjusting state
  // during render keeps stale pages out of the new conversation's history.
  const [historyKey, setHistoryKey] = useState(containerId);
  if (historyKey !== containerId) {
    setHistoryKey(containerId);
    setOlderPages([]);
    setCursor(null);
  }

  // And snap the scroll position: flag set from an effect (never during
  // render) so the scroll effect below does a forced jump right after a
  // conversation switch.
  useEffect(() => {
    jumpToBottomRef.current = true;
  }, [containerId]);

  // Fold a freshly loaded older page into history as soon as it resolves.
  if (older && activeCursor !== null) {
    setOlderPages([...olderPages, older.messages]);
    setCursor(null);
  }

  const messages = useMemo(() => {
    const map = new Map<string, MessageDto>();
    for (const page of olderPages) {
      for (const message of page) map.set(message.id, message);
    }
    for (const message of latest?.messages ?? []) map.set(message.id, message);
    return Array.from(map.values()).sort((a, b) => a.createdAt - b.createdAt);
  }, [olderPages, latest]);

  // Stick to the bottom when new messages arrive, but respect manual scrolling.
  // On a fresh conversation (or right after switching) we force the jump first,
  // because a container that starts scrolled to the top is never "near bottom".
  useEffect(() => {
    const element = scrollRef.current;
    if (!element || latest === undefined) return;
    if (jumpToBottomRef.current) {
      element.scrollTop = element.scrollHeight;
      const timer = window.setTimeout(() => {
        jumpToBottomRef.current = false;
      }, 700);
      return () => window.clearTimeout(timer);
    }
    const nearBottom =
      element.scrollHeight - element.scrollTop - element.clientHeight < 220;
    if (nearBottom) {
      element.scrollTop = element.scrollHeight;
    }
  }, [messages.length, containerId, latest]);

  // A manual scroll away from the bottom cancels the forced jump.
  const handleScroll = () => {
    const element = scrollRef.current;
    if (!element) return;
    const nearBottom =
      element.scrollHeight - element.scrollTop - element.clientHeight < 220;
    if (!nearBottom) jumpToBottomRef.current = false;
  };

  const lastReadAt = latest?.lastReadAt ?? 0;
  const unreadFrom = messages.findIndex(
    (message) =>
      message.createdAt > lastReadAt &&
      lastReadAt > 0 &&
      message.authorId !== currentUserId,
  );

  return (
    <>
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="chat-scroll min-h-0 flex-1 overflow-y-auto bg-[radial-gradient(circle_at_50%_0%,color-mix(in_oklab,var(--primary)_5%,transparent),transparent_38%)] px-3 py-4 sm:px-5"
      >
        {latest === undefined ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="mb-3 flex justify-center">
              {activeCursor === null && latest.hasMore ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    latest.oldest !== null &&
                    setCursor({ container: containerId, at: latest.oldest })
                  }
                >
                  Load earlier messages
                </Button>
              ) : activeCursor !== null ? (
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              ) : null}
            </div>

            {messages.length === 0 ? (
              <EmptyConversation containerType={containerType} />
            ) : (
              messages.map((message, index) => {
                const previous = messages[index - 1];
                const next = messages[index + 1];
                const newDay =
                  !previous ||
                  dayKey(previous.createdAt) !== dayKey(message.createdAt);
                const grouped =
                  !newDay &&
                  previous?.authorId === message.authorId &&
                  message.createdAt - previous.createdAt < 5 * 60_000 &&
                  !previous.replyTo;
                const showUnreadDivider = unreadFrom === index && !grouped;

                return (
                  <div key={message.id}>
                    {newDay && (
                      <div className="my-4 flex items-center gap-3">
                        <span className="h-px flex-1 bg-border/70" />
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {dayLabel(message.createdAt)}
                        </span>
                        <span className="h-px flex-1 bg-border/70" />
                      </div>
                    )}
                    {showUnreadDivider && (
                      <div className="my-2 flex items-center gap-3">
                        <span className="h-px flex-1 bg-destructive/60" />
                        <span className="text-[11px] font-semibold uppercase text-destructive">
                          New messages
                        </span>
                        <span className="h-px flex-1 bg-destructive/60" />
                      </div>
                    )}
                    <MessageRow
                      message={message}
                      grouped={grouped}
                      containerType={containerType}
                      containerId={containerId}
                      serverId={serverId}
                      serverOwnerId={serverOwnerId}
                      currentUserId={currentUserId}
                      canManageMessages={canManageMessages}
                      isLast={
                        next === undefined || next.authorId !== message.authorId
                      }
                      onReply={onReply}
                      onReport={onReport}
                      roleColors={roleColors}
                      mentionUsers={mentionUsers}
                      onOpenMedia={(url, label) => setMedia({ url, label })}
                    />
                  </div>
                );
              })
            )}
          </>
        )}
      </div>
      <Dialog
        open={media !== null}
        onOpenChange={(open) => !open && setMedia(null)}
      >
        <DialogContent className="max-h-[92dvh] max-w-[94vw] overflow-hidden border-border/70 bg-black/95 p-3 sm:max-w-5xl">
          <DialogTitle className="sr-only">
            {media?.label ?? "Media preview"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Image preview inside Kyro. Press Escape to close.
          </DialogDescription>
          {media && (
            <img
              src={media.url}
              alt={media.label}
              className="max-h-[86dvh] w-full object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function EmptyConversation({
  containerType,
}: {
  containerType: "channel" | "conversation";
}) {
  return (
    <div className="mx-auto mt-10 max-w-md rounded-2xl border border-border/70 bg-surface p-6 text-center">
      <h3 className="text-lg font-semibold">
        {containerType === "channel"
          ? "This is the start of the channel"
          : "Say hello"}
      </h3>
      <p className="mt-1.5 text-sm text-muted-foreground">
        {containerType === "channel"
          ? "Nothing has been said here yet. Send the first message — formatting, code blocks, replies and reactions all work."
          : "Messages you send here are private to this conversation and sync across your devices."}
      </p>
    </div>
  );
}

function MessageRow({
  message,
  grouped,
  currentUserId,
  canManageMessages,
  onReply,
  onReport,
  roleColors,
  serverOwnerId,
  mentionUsers,
  onOpenMedia,
}: {
  message: MessageDto;
  grouped: boolean;
  containerType: "channel" | "conversation";
  containerId: string;
  serverId?: string;
  serverOwnerId?: string;
  currentUserId: string;
  canManageMessages: boolean;
  isLast: boolean;
  onReply: (target: ReplyTarget) => void;
  onReport: (message: MessageDto) => void;
  roleColors?: Record<string, string>;
  mentionUsers: { id: string; name: string; username: string | null }[];
  onOpenMedia: (url: string, label: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const [, setParams] = useSearchParams();
  const convex = useConvex();
  const toggleReaction = useMutation(api.messages.toggleReaction);
  const editMessage = useMutation(api.messages.edit);
  const deleteMessage = useMutation(api.messages.remove);
  const [reactionCustomEmojis, setReactionCustomEmojis] = useState<
    CustomEmoji[]
  >([]);
  const [reactionEmojisLoaded, setReactionEmojisLoaded] = useState(false);

  const loadReactionEmojis = () => {
    if (reactionEmojisLoaded) return;
    setReactionEmojisLoaded(true);
    void convex
      .query(api.emojis.available, {})
      .then((rows) => setReactionCustomEmojis(rows))
      .catch(() => setReactionCustomEmojis([]));
  };
  const isAuthor = message.authorId === currentUserId;
  const author = message.author;
  // Any invite link pasted into chat gets a community preview underneath it.
  const inviteCodes = useMemo(
    () => extractInviteCodes(message.content),
    [message.content],
  );
  const embeddedMedia = useMemo(
    () => mediaUrls(message.content),
    [message.content],
  );
  const mentionMap = useMemo(
    () =>
      new Map(
        mentionUsers
          .filter((user) => Boolean(user.username))
          .map((user) => [user.username!.toLowerCase(), user.id]),
      ),
    [mentionUsers],
  );

  /** Opening a profile uses the same ?user=<id> parameter as everywhere else. */
  const openProfile = () => {
    if (!author) return;
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set("user", author.id);
      return next;
    });
  };

  const openMention = (username: string) => {
    const userId = mentionMap.get(username);
    if (!userId) return;
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set("user", userId);
      return next;
    });
  };

  const send = async (emoji: string) => {
    try {
      await toggleReaction({ messageId: message.id as Id<"messages">, emoji });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not react.");
    }
  };

  // Call records are timeline events, not chat bubbles: a centered pill with
  // the outcome (missed call / call length) and when it happened.
  if (message.kind === "call_missed" || message.kind === "call_ended") {
    const missed = message.kind === "call_missed";
    const minutes = Math.floor((message.callDurationMs ?? 0) / 60_000);
    const seconds = Math.floor(((message.callDurationMs ?? 0) % 60_000) / 1000);
    const label = missed
      ? "Missed call"
      : `Call ended · ${minutes}:${String(seconds).padStart(2, "0")}`;
    return (
      <div
        className={cn(
          "group relative mt-2.5 flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-surface/60",
        )}
      >
        <span
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-full",
            missed
              ? "bg-destructive/15 text-destructive"
              : "bg-success/15 text-success",
          )}
        >
          {missed ? (
            <PhoneOff className="size-3.5" />
          ) : (
            <Phone className="size-3.5" />
          )}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{label}</p>
          <p className="text-[11px] text-muted-foreground">
            {formatTime(message.createdAt)}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "message-row group relative rounded-xl px-3 py-1.5 transition-colors hover:bg-panel/45",
        grouped ? "mt-0 py-0.5" : "mt-3",
      )}
    >
      <div className="flex gap-3">
        <div className="w-10 shrink-0">
          {!grouped && author && (
            <button
              type="button"
              onClick={openProfile}
              aria-label={`Open ${author.name}'s profile`}
              className="mt-0.5 block rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <UserAvatar user={author} size="md" showStatus={false} />
            </button>
          )}
        </div>

        <div className="min-w-0 flex-1">
          {!grouped && (
            <div className="flex flex-wrap items-baseline gap-2">
              <button
                type="button"
                onClick={openProfile}
                className="text-sm hover:underline"
              >
                {author ? (
                  <StyledDisplayName
                    user={author}
                    roleColor={roleColors?.[author.id]}
                  />
                ) : (
                  "Unknown user"
                )}
              </button>
              {author?.badges && author.badges.length > 0 ? (
                <InlineBadge
                  badges={author.badges}
                  primaryBadge={author.primaryBadge}
                />
              ) : serverOwnerId && author?.id === serverOwnerId ? (
                <CrownBadge label="Server owner" />
              ) : null}
              {author?.serverTag && (
                <ServerTagChip tag={author.serverTag} ownerName={author.name} />
              )}
              <DeviceBadge device={author?.device} />
              <span className="text-[11px] text-muted-foreground">
                {dayLabel(message.createdAt)} {formatTime(message.createdAt)}
              </span>
            </div>
          )}

          {message.replyTo && (
            <div className="mb-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <CornerUpLeft className="size-3" />
              {message.replyTo.author ? (
                <StyledDisplayName
                  user={message.replyTo.author}
                  className="text-foreground/80"
                />
              ) : (
                <span className="font-medium text-foreground/80">
                  a message
                </span>
              )}
              <span className="truncate">{message.replyTo.excerpt}</span>
            </div>
          )}

          {editing ? (
            <div className="mt-1">
              <textarea
                autoFocus
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={async (event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    if (draft.trim()) {
                      try {
                        await editMessage({
                          messageId: message.id as Id<"messages">,
                          content: draft,
                        });
                        setEditing(false);
                      } catch (error) {
                        toast.error(
                          error instanceof Error
                            ? error.message
                            : "Could not edit.",
                        );
                      }
                    }
                  }
                  if (event.key === "Escape") {
                    setDraft(message.content);
                    setEditing(false);
                  }
                }}
                rows={Math.min(6, draft.split("\n").length + 1)}
                className="w-full resize-none rounded-lg border border-primary/50 bg-surface p-2 text-sm outline-none"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Enter to save · Esc to cancel · Shift+Enter for a new line
              </p>
            </div>
          ) : (
            <div className="whitespace-pre-wrap break-words text-sm leading-6 text-foreground/95">
              {renderMessage(message.content, {
                customEmojis: message.customEmojis,
                onMention: openMention,
                onMedia: (url) => onOpenMedia(url, "Shared image"),
              })}
              {message.editedAt && (
                <span className="ml-1.5 text-[10px] text-muted-foreground">
                  (edited)
                </span>
              )}
            </div>
          )}

          {inviteCodes.length > 0 && !editing && (
            <div className="mt-2 flex flex-col gap-2">
              {inviteCodes.slice(0, 2).map((code) => (
                <ServerInviteCard key={code} code={code} />
              ))}
            </div>
          )}

          {embeddedMedia.length > 0 && !editing && (
            <div className="mt-2 flex flex-wrap gap-2">
              {embeddedMedia.map((url) => (
                <button
                  key={url}
                  type="button"
                  onClick={() => onOpenMedia(url, "Shared image or GIF")}
                  className="block overflow-hidden rounded-lg border border-border/70 bg-black/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <img
                    src={url}
                    alt="Shared image or GIF"
                    loading="lazy"
                    className="max-h-72 max-w-xs object-contain sm:max-w-sm"
                  />
                </button>
              ))}
            </div>
          )}

          {message.attachments.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-2">
              {" "}
              {message.attachments.map((attachment) =>
                attachment.mimeType.startsWith("video/") && attachment.url ? (
                  <video
                    key={attachment.storageId}
                    src={attachment.url}
                    controls
                    playsInline
                    preload="metadata"
                    className="max-h-72 max-w-xs rounded-lg border border-border/70 bg-black"
                  />
                ) : attachment.mimeType.startsWith("image/") &&
                  attachment.url ? (
                  <button
                    key={attachment.storageId}
                    type="button"
                    onClick={() =>
                      onOpenMedia(attachment.url!, attachment.name)
                    }
                    className="block overflow-hidden rounded-lg border border-border/70"
                  >
                    <img
                      src={attachment.url}
                      alt={attachment.name}
                      loading="lazy"
                      className="max-h-72 max-w-xs object-cover"
                    />
                  </button>
                ) : (
                  <a
                    key={attachment.storageId}
                    href={attachment.url ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex max-w-xs items-center gap-2 rounded-lg border border-border/70 bg-surface px-3 py-2 text-xs hover:border-primary/40"
                  >
                    <span className="truncate font-medium">
                      {attachment.name}
                    </span>
                    <span className="shrink-0 text-muted-foreground">
                      {Math.max(1, Math.round(attachment.size / 1024))} KB
                    </span>
                  </a>
                ),
              )}
            </div>
          )}

          {message.reactions.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {message.reactions.map((reaction) => (
                <button
                  key={reaction.emoji}
                  type="button"
                  onClick={() => void send(reaction.emoji)}
                  className={cn(
                    "flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors",
                    reaction.mine
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border/70 bg-surface text-muted-foreground hover:border-primary/40",
                  )}
                >
                  {reaction.url ? (
                    <img
                      src={reaction.url}
                      alt={reaction.emoji}
                      className="size-4 object-contain"
                    />
                  ) : (
                    <span>{reaction.emoji}</span>
                  )}
                  <span>{reaction.count}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Hover toolbar */}
      <div className="message-toolbar absolute -top-3 right-2 flex items-center gap-0.5 rounded-lg border border-border/70 bg-panel px-1 py-0.5 shadow-lg">
        <Popover onOpenChange={(open) => open && loadReactionEmojis()}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="Add reaction"
              className="rounded p-1.5 text-muted-foreground hover:bg-surface hover:text-foreground"
            >
              <SmilePlus className="size-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-auto p-3">
            <EmojiPicker
              customEmojis={reactionCustomEmojis}
              onSelect={(emoji) => void send(emoji)}
            />
          </PopoverContent>
        </Popover>

        <button
          type="button"
          aria-label="Reply"
          onClick={() =>
            onReply({
              id: message.id,
              author: author?.name ?? "Unknown",
              excerpt: message.content.slice(0, 80),
            })
          }
          className="rounded p-1.5 text-muted-foreground hover:bg-surface hover:text-foreground"
        >
          <Reply className="size-4" />
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="More message actions"
              className="rounded p-1.5 text-muted-foreground hover:bg-surface hover:text-foreground"
            >
              <Ellipsis className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => {
                void navigator.clipboard
                  .writeText(message.content)
                  .then(() => toast.success("Message copied."))
                  .catch(() => toast.error("Could not copy that message."));
              }}
            >
              <Copy className="size-4" /> Copy text
            </DropdownMenuItem>
            {isAuthor && (
              <DropdownMenuItem
                onClick={() => {
                  setDraft(message.content);
                  setEditing(true);
                }}
              >
                <Pencil className="size-4" /> Edit message
              </DropdownMenuItem>
            )}
            {(isAuthor || canManageMessages) && (
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={async () => {
                  try {
                    await deleteMessage({
                      messageId: message.id as Id<"messages">,
                    });
                  } catch (error) {
                    toast.error(
                      error instanceof Error
                        ? error.message
                        : "Could not delete.",
                    );
                  }
                }}
              >
                <Trash2 className="size-4" /> Delete message
              </DropdownMenuItem>
            )}
            {!isAuthor && (
              <DropdownMenuItem onClick={() => onReport(message)}>
                <AlertTriangle className="size-4" /> Report message
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
