import { useMutation, useQuery } from "convex/react";
import { useDeferredValue, useState } from "react";
import {
  Hash,
  Loader2,
  Lock,
  Pin,
  Plus,
  Search,
  Send,
  X,
} from "@/components/icons";
import { UserAvatar } from "@/components/app/UserAvatar";
import { StyledDisplayName } from "@/components/app/StyledDisplayName";
import { WorkspaceActions } from "@/components/app/WorkspaceActions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { dayLabel, formatTime } from "@/lib/format";
import { renderMessage } from "@/lib/markdown";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function ForumChannelPage({
  channelId,
}: {
  serverId: string;
  channelId: string;
}) {
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [postId, setPostId] = useState<string | null>(null);
  const data = useQuery(api.forums.list, {
    channelId: channelId as Id<"channels">,
    search: deferredSearch || undefined,
    tag: activeTag || undefined,
  });

  const tags = Array.from(
    new Set((data?.posts ?? []).flatMap((post) => post.tags)),
  ).slice(0, 20);

  if (data === undefined) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border/70 bg-panel/90 px-4 shadow-sm">
        <span className="flex size-8 items-center justify-center rounded-lg bg-surface text-muted-foreground">
          <Hash className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-bold">{data.channel.name}</p>
          {data.channel.topic && (
            <p className="truncate text-xs text-muted-foreground">
              {data.channel.topic}
            </p>
          )}
        </div>
        <WorkspaceActions />
      </header>

      <div className="border-b border-border/60 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-52 flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search discussions"
              className="h-10 rounded-xl bg-panel/70 pl-9"
            />
          </div>
          {data.canPost && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1.5 size-4" /> New post
            </Button>
          )}
        </div>
        {tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setActiveTag(null)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs",
                activeTag === null
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border/70 text-muted-foreground",
              )}
            >
              All
            </button>
            {tags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => setActiveTag(tag)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs",
                  activeTag === tag
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border/70 text-muted-foreground",
                )}
              >
                {tag}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        {data.posts.length === 0 ? (
          <div className="mx-auto mt-12 max-w-md rounded-2xl border border-dashed border-border p-8 text-center">
            <h2 className="font-semibold">No discussions yet</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Create the first tagged post in this forum.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
            {data.posts.map((post) => (
              <button
                key={post.id}
                type="button"
                onClick={() => setPostId(post.id)}
                className="group rounded-2xl border border-border/70 bg-panel/70 p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-lg"
              >
                <div className="flex items-start gap-2">
                  <h2 className="min-w-0 flex-1 line-clamp-2 font-bold">
                    {post.title}
                  </h2>
                  {post.pinned && (
                    <Pin className="size-4 shrink-0 text-primary" />
                  )}
                  {post.locked && (
                    <Lock className="size-4 shrink-0 text-warning" />
                  )}
                </div>
                <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                  {post.excerpt}
                </p>
                {post.tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {post.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                <div className="mt-4 flex items-center gap-2 border-t border-border/50 pt-3">
                  {post.author && <UserAvatar user={post.author} size="xs" />}
                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                    {post.author?.name ?? "Unknown"} ·{" "}
                    {dayLabel(post.createdAt)}
                  </span>
                  <span className="text-xs font-semibold text-muted-foreground">
                    {post.commentCount} repl
                    {post.commentCount === 1 ? "y" : "ies"}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <CreateForumPostDialog
        channelId={channelId}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(id) => setPostId(id)}
      />
      {postId && (
        <ForumPostPanel postId={postId} onClose={() => setPostId(null)} />
      )}
    </div>
  );
}

function CreateForumPostDialog({
  channelId,
  open,
  onOpenChange,
  onCreated,
}: {
  channelId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (id: string) => void;
}) {
  const create = useMutation(api.forums.createPost);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const id = await create({
        channelId: channelId as Id<"channels">,
        title,
        content,
        tags: tags.split(","),
      });
      setTitle("");
      setContent("");
      setTags("");
      onOpenChange(false);
      onCreated(id as string);
      toast.success("Forum post created.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not create post.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New forum post</DialogTitle>
          <DialogDescription>
            Start a longer discussion. Separate tags with commas.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="forum-title">Title</Label>
            <Input
              id="forum-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={120}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="forum-content">Post</Label>
            <Textarea
              id="forum-content"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              rows={8}
              maxLength={10_000}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="forum-tags">Tags</Label>
            <Input
              id="forum-tags"
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              placeholder="help, guide, feedback"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              disabled={busy || title.trim().length < 3 || !content.trim()}
              onClick={() => void submit()}
            >
              {busy && <Loader2 className="mr-1.5 size-4 animate-spin" />}
              Publish post
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ForumPostPanel({
  postId,
  onClose,
}: {
  postId: string;
  onClose: () => void;
}) {
  const post = useQuery(api.forums.get, { postId: postId as Id<"forumPosts"> });
  const addComment = useMutation(api.forums.addComment);
  const togglePinned = useMutation(api.forums.togglePinned);
  const toggleLocked = useMutation(api.forums.toggleLocked);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!draft.trim() || busy) return;
    setBusy(true);
    try {
      await addComment({ postId: postId as Id<"forumPosts">, content: draft });
      setDraft("");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not comment.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        aria-label="Close forum post"
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/40 lg:hidden"
      />
      <aside className="user-preview-enter fixed bottom-0 right-0 top-0 z-40 flex w-[min(36rem,98vw)] flex-col border-l border-border/70 bg-background shadow-[-20px_0_50px_rgba(0,0,0,.3)] md:top-9">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border/70 bg-panel/90 px-4">
          <p className="min-w-0 flex-1 truncate font-bold">Discussion</p>
          {post?.canManage && (
            <>
              <button
                type="button"
                title={post.pinned ? "Unpin" : "Pin"}
                onClick={() =>
                  void togglePinned({ postId: postId as Id<"forumPosts"> })
                }
                className="rounded-lg p-2 text-muted-foreground hover:bg-surface hover:text-foreground"
              >
                <Pin className="size-4" />
              </button>
              <button
                type="button"
                title={post.locked ? "Unlock" : "Lock"}
                onClick={() =>
                  void toggleLocked({ postId: postId as Id<"forumPosts"> })
                }
                className="rounded-lg p-2 text-muted-foreground hover:bg-surface hover:text-foreground"
              >
                <Lock className="size-4" />
              </button>
            </>
          )}
          <button
            type="button"
            aria-label="Close post"
            onClick={onClose}
            className="rounded-lg p-2 text-muted-foreground hover:bg-surface hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {!post ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-bold leading-tight">{post.title}</h1>
              <div className="mt-3 flex items-center gap-2">
                {post.author && <UserAvatar user={post.author} size="sm" />}
                <div className="min-w-0">
                  {post.author && (
                    <StyledDisplayName
                      user={post.author}
                      className="block truncate text-sm"
                    />
                  )}
                  <p className="text-[10px] text-muted-foreground">
                    {dayLabel(post.createdAt)} · {formatTime(post.createdAt)}
                  </p>
                </div>
              </div>
              <div className="mt-5 whitespace-pre-wrap break-words text-sm leading-7">
                {renderMessage(post.content)}
              </div>
              <div className="my-6 border-t border-border/70" />
              <p className="mb-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Replies · {post.comments.length}
              </p>
              <div className="space-y-5">
                {post.comments.map((comment) => (
                  <div
                    key={comment.id}
                    className="thread-reply-enter flex gap-3"
                  >
                    {comment.author && (
                      <UserAvatar user={comment.author} size="sm" />
                    )}
                    <div className="min-w-0 flex-1">
                      {comment.author && (
                        <StyledDisplayName
                          user={comment.author}
                          className="text-sm"
                        />
                      )}
                      <span className="ml-2 text-[10px] text-muted-foreground">
                        {formatTime(comment.createdAt)}
                      </span>
                      <div className="mt-1 text-sm leading-6">
                        {renderMessage(comment.content)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {post &&
          (post.canComment || post.canManage) &&
          (!post.locked || post.canManage) && (
            <div className="border-t border-border/70 bg-panel/80 p-3">
              <div className="flex items-end gap-2 rounded-2xl border border-input bg-background p-2">
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
                  placeholder="Write a reply…"
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
            </div>
          )}
      </aside>
    </>
  );
}
