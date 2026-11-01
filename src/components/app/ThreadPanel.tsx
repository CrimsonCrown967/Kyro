import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { Loader2, Lock, Send, X } from "@/components/icons";
import { UserAvatar } from "@/components/app/UserAvatar";
import { StyledDisplayName } from "@/components/app/StyledDisplayName";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatTime } from "@/lib/format";
import { renderMessage } from "@/lib/markdown";
import { toast } from "sonner";

export function ThreadPanel({
  threadId,
  onClose,
}: {
  threadId: string;
  onClose: () => void;
}) {
  const thread = useQuery(api.threads.get, {
    threadId: threadId as Id<"threads">,
  });
  const messages = useQuery(api.threads.listMessages, {
    threadId: threadId as Id<"threads">,
  });
  const send = useMutation(api.threads.send);
  const toggleLock = useMutation(api.threads.toggleLock);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = scrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [messages?.length]);

  const submit = async () => {
    const content = draft.trim();
    if (!content || busy) return;
    setBusy(true);
    try {
      await send({ threadId: threadId as Id<"threads">, content });
      setDraft("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not reply.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        aria-label="Close thread"
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/40 lg:hidden"
      />
      <aside className="user-preview-enter fixed bottom-0 right-0 top-0 z-40 flex w-[min(28rem,96vw)] flex-col border-l border-border/70 bg-background shadow-[-20px_0_50px_rgba(0,0,0,.3)] md:top-9">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border/70 bg-panel/90 px-4">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">Thread</p>
            <p className="truncate text-xs text-muted-foreground">
              {thread?.replyCount ?? 0} replies
            </p>
          </div>
          {thread?.canManage && (
            <button
              type="button"
              title={thread.locked ? "Unlock thread" : "Lock thread"}
              onClick={() =>
                void toggleLock({ threadId: threadId as Id<"threads"> }).catch(
                  (error) =>
                    toast.error(
                      error instanceof Error
                        ? error.message
                        : "Could not update thread.",
                    ),
                )
              }
              className="rounded-lg p-2 text-muted-foreground hover:bg-surface hover:text-foreground"
            >
              <Lock className="size-4" />
            </button>
          )}
          <button
            type="button"
            aria-label="Close thread"
            onClick={onClose}
            className="rounded-lg p-2 text-muted-foreground hover:bg-surface hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </header>

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-4">
          {thread === undefined || messages === undefined ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {thread.parent && (
                <div className="mb-5 rounded-xl border border-primary/25 bg-primary/5 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-primary">
                    Original message
                  </p>
                  <p className="mt-1 text-sm font-semibold">
                    {thread.parent.author?.name ?? "Unknown member"}
                  </p>
                  <div className="mt-1 whitespace-pre-wrap text-sm text-foreground/90">
                    {renderMessage(thread.parent.content)}
                  </div>
                </div>
              )}

              <div className="space-y-4">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className="thread-reply-enter flex gap-3"
                  >
                    {message.author ? (
                      <UserAvatar user={message.author} size="sm" />
                    ) : (
                      <span className="size-8 rounded-full bg-muted" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        {message.author ? (
                          <StyledDisplayName
                            user={message.author}
                            className="truncate text-sm"
                          />
                        ) : (
                          <span className="text-sm font-semibold">
                            Unknown member
                          </span>
                        )}
                        <span className="text-[10px] text-muted-foreground">
                          {formatTime(message.createdAt)}
                        </span>
                      </div>
                      <div className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-6">
                        {renderMessage(message.content)}
                      </div>
                    </div>
                  </div>
                ))}
                {messages.length === 0 && (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Be the first person to reply in this thread.
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        <div className="shrink-0 border-t border-border/70 bg-panel/80 p-3">
          {thread?.locked && !thread.canManage ? (
            <p className="rounded-xl border border-border/70 bg-surface px-3 py-2 text-center text-sm text-muted-foreground">
              This thread is locked.
            </p>
          ) : (
            <div className="flex items-end gap-2 rounded-2xl border border-input bg-background p-2 focus-within:border-primary/60">
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void submit();
                  }
                }}
                rows={1}
                placeholder="Reply to thread…"
                className="max-h-36 min-h-8 flex-1 resize-none bg-transparent px-1 py-1.5 text-sm outline-none"
              />
              <Button
                size="icon"
                variant="ghost"
                disabled={busy || !draft.trim()}
                onClick={() => void submit()}
              >
                {busy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
              </Button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
