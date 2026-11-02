import { useMutation, useQuery } from "convex/react";
import {
  AlertTriangle,
  Check,
  Copy,
  Hash,
  Link2,
  Loader2,
  MessagesSquare,
  Plus,
  ShieldAlert,
  Volume2,
  X,
} from "@/components/icons";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { inviteUrl } from "@/lib/site";

/** Create a community — free, no limits beyond abuse protection. */
export function CreateCommunityDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const create = useMutation(api.servers.create);
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const serverId = await create({
        name,
        description: description || undefined,
        isPublic,
      });
      onOpenChange(false);
      setName("");
      setDescription("");
      navigate(`/dashboard/s/${serverId}`);
      toast.success("Community created");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not create the community.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a community</DialogTitle>
          <DialogDescription>
            Communities are free forever — every feature is available to
            everyone.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="community-name">Community name</Label>
            <Input
              id="community-name"
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Friday Night Lobbies"
              maxLength={64}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="community-description">Description</Label>
            <Textarea
              id="community-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What's this community about?"
              rows={3}
              maxLength={400}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border/70 bg-surface px-3 py-2.5">
            <div>
              <p className="text-sm font-medium">Discoverable</p>
              <p className="text-xs text-muted-foreground">
                Anyone can find and join this community.
              </p>
            </div>
            <Switch checked={isPublic} onCheckedChange={setIsPublic} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy || name.trim().length < 2}>
              {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
              Create community
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Invite link manager for one community. */
export function InviteDialog({
  serverId,
  open,
  onOpenChange,
}: {
  serverId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const createInvite = useMutation(api.servers.createInvite);
  const invites = useQuery(api.servers.listInvites, {
    serverId: serverId as Id<"servers">,
  });
  const revoke = useMutation(api.servers.revokeInvite);
  const [expiresInHours, setExpiresInHours] = useState(0);
  const [maxUses, setMaxUses] = useState(0);
  const [busy, setBusy] = useState(false);
  // Clock for the invite list's "expired" label. Kept in state and ticked
  // from an interval so rendering stays pure.
  const [now, setNow] = useState(0);
  useEffect(() => {
    const refresh = () => setNow(Date.now());
    const immediate = window.setTimeout(refresh, 0);
    const timer = window.setInterval(refresh, 30_000);
    return () => {
      window.clearTimeout(immediate);
      window.clearInterval(timer);
    };
  }, []);
  const [copied, setCopied] = useState<string | null>(null);

  // Canonical Kyro origin — invites point at kyro-chat.cyou everywhere.
  const linkFor = (code: string) => inviteUrl(code);

  const create = async () => {
    setBusy(true);
    try {
      const code = await createInvite({
        serverId: serverId as Id<"servers">,
        expiresInHours: expiresInHours || undefined,
        maxUses: maxUses || undefined,
      });
      try {
        await navigator.clipboard.writeText(linkFor(code));
        setCopied(code);
        window.setTimeout(() => setCopied(null), 2000);
        toast.success("Invite link copied to your clipboard");
      } catch {
        toast.success("Invite created — use the code below");
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not create an invite.",
      );
    } finally {
      setBusy(false);
    }
  };

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(linkFor(code));
      setCopied(code);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      toast.error("Clipboard access was blocked by the browser.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Invite people</DialogTitle>
          <DialogDescription>
            Create a link anyone can use to join this community.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="invite-expiry">Expires after</Label>
            <select
              id="invite-expiry"
              value={expiresInHours}
              onChange={(event) =>
                setExpiresInHours(Number(event.target.value))
              }
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value={0}>Never</option>
              <option value={1}>1 hour</option>
              <option value={24}>24 hours</option>
              <option value={168}>7 days</option>
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="invite-uses">Max uses</Label>
            <select
              id="invite-uses"
              value={maxUses}
              onChange={(event) => setMaxUses(Number(event.target.value))}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value={0}>No limit</option>
              <option value={1}>1 use</option>
              <option value={5}>5 uses</option>
              <option value={25}>25 uses</option>
            </select>
          </div>
          <Button onClick={create} disabled={busy} className="ml-auto">
            {busy ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Plus className="mr-2 size-4" />
            )}
            Generate link
          </Button>
        </div>

        <div className="grid gap-2">
          {invites === undefined ? (
            <p className="text-sm text-muted-foreground">Loading invites…</p>
          ) : invites.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No active invites yet — generate one above.
            </p>
          ) : (
            invites
              .filter((invite) => !invite.revoked)
              .map((invite) => {
                const expired =
                  (invite.expiresAt !== null &&
                    now > 0 &&
                    invite.expiresAt < now) ||
                  (invite.maxUses !== null && invite.uses >= invite.maxUses);
                return (
                  <div
                    key={invite.id}
                    className="flex items-center gap-2 rounded-lg border border-border/70 bg-surface px-3 py-2"
                  >
                    <Link2 className="size-4 shrink-0 text-cyan" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-xs">
                        {invite.code}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {invite.uses} use{invite.uses === 1 ? "" : "s"}
                        {invite.maxUses ? ` of ${invite.maxUses}` : ""}
                        {expired ? " · expired" : ""}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => copy(invite.code)}
                      aria-label="Copy invite link"
                    >
                      {copied === invite.code ? (
                        <Check className="size-4 text-success" />
                      ) : (
                        <Copy className="size-4" />
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        revoke({ inviteId: invite.id as Id<"invites"> })
                      }
                      aria-label="Revoke invite"
                    >
                      <X className="size-4 text-destructive" />
                    </Button>
                  </div>
                );
              })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Create a text channel in the open community. */
export function CreateChannelDialog({
  serverId,
  open,
  onOpenChange,
  categories,
}: {
  serverId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: { id: string; name: string }[];
}) {
  const create = useMutation(api.channels.create);
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [topic, setTopic] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [kind, setKind] = useState<"text" | "voice" | "forum">("text");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const channelId = await create({
        serverId: serverId as Id<"servers">,
        name,
        topic: topic || undefined,
        categoryId: categoryId ? (categoryId as Id<"categories">) : null,
        kind,
      });
      onOpenChange(false);
      setName("");
      setTopic("");
      setKind("text");
      navigate(
        kind === "voice"
          ? `/dashboard/s/${serverId}/v/${channelId}`
          : kind === "forum"
            ? `/dashboard/s/${serverId}/f/${channelId}`
            : `/dashboard/s/${serverId}/c/${channelId}`,
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not create the channel.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create channel</DialogTitle>
          <DialogDescription>
            Create text chat, live voice, or a tagged forum for longer
            discussions.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <div className="grid gap-2">
            <Label>Channel type</Label>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { value: "text", label: "Text", icon: Hash },
                  { value: "voice", label: "Voice", icon: Volume2 },
                  { value: "forum", label: "Forum", icon: MessagesSquare },
                ] as const
              ).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setKind(option.value)}
                  className={
                    kind === option.value
                      ? "flex items-center justify-center gap-2 rounded-md border border-primary/60 bg-primary/10 px-3 py-2 text-sm font-medium"
                      : "flex items-center justify-center gap-2 rounded-md border border-border/70 px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
                  }
                >
                  <option.icon className="size-4" />
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="channel-name">Channel name</Label>
            <div className="flex items-center gap-2 rounded-md border border-input bg-background px-3">
              {kind === "voice" ? (
                <Volume2 className="size-4 text-muted-foreground" />
              ) : kind === "forum" ? (
                <MessagesSquare className="size-4 text-muted-foreground" />
              ) : (
                <Hash className="size-4 text-muted-foreground" />
              )}
              <input
                id="channel-name"
                autoFocus
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="squad-up"
                className="h-9 flex-1 bg-transparent text-sm outline-none"
                maxLength={100}
                required
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="channel-topic">Topic (optional)</Label>
            <Input
              id="channel-topic"
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              placeholder="What's this channel about?"
              maxLength={300}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="channel-category">Category</Label>
            <select
              id="channel-category"
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">No category</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy || name.trim().length < 1}>
              {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
              Create channel
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const REPORT_REASONS = [
  "Harassment or bullying",
  "Hate speech or discrimination",
  "Spam or scams",
  "Sexual or violent content",
  "Impersonation",
  "Something else",
];

/** Report a user or message to community moderators and site admins. */
export function ReportDialog({
  open,
  onOpenChange,
  reportedUserId,
  messageId,
  serverId,
  targetLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reportedUserId?: string;
  messageId?: string;
  serverId?: string;
  targetLabel?: string;
}) {
  const createReport = useMutation(api.reports.create);
  const [reason, setReason] = useState(REPORT_REASONS[0]);
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await createReport({
        reportedUserId: reportedUserId as Id<"users"> | undefined,
        messageId: messageId as Id<"messages"> | undefined,
        serverId: serverId as Id<"servers"> | undefined,
        reason,
        details: details || undefined,
      });
      setDone(true);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not send the report.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setDone(false);
          setDetails("");
        }
        onOpenChange(next);
      }}
    >
      <DialogContent>
        {done ? (
          <>
            <DialogHeader>
              <DialogTitle>Report sent</DialogTitle>
              <DialogDescription>
                Moderators will review this. Thanks for helping keep Kyro safe.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShieldAlert className="size-5 text-destructive" />
                Report {targetLabel ?? "content"}
              </DialogTitle>
              <DialogDescription>
                Reports go to community moderators and the Kyro trust team.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor="report-reason">Reason</Label>
              <select
                id="report-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                {REPORT_REASONS.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="report-details">Details</Label>
              <Textarea
                id="report-details"
                rows={3}
                value={details}
                onChange={(event) => setDetails(event.target.value)}
                placeholder="What happened?"
                maxLength={1000}
              />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={submit} disabled={busy}>
                {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
                Send report
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Destructive confirmation that requires typing an exact phrase. */
export function ConfirmDangerDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmPhrase,
  confirmLabel = "Delete",
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmPhrase: string;
  confirmLabel?: string;
  onConfirm: () => Promise<void>;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      setValue("");
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setValue("");
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-warning" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="confirm-phrase">
            Type{" "}
            <span className="font-mono font-semibold">{confirmPhrase}</span> to
            confirm
          </Label>
          <Input
            id="confirm-phrase"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            autoComplete="off"
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={value !== confirmPhrase || busy}
            onClick={submit}
          >
            {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
