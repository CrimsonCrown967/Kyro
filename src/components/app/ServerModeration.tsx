import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Clock, Loader2, ShieldAlert } from "@/components/icons";
import { UserAvatar, type AvatarUser } from "@/components/app/UserAvatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useNow } from "@/hooks/use-now";
import { cn } from "@/lib/utils";
import { readableError } from "@/lib/errors";
import { toast } from "sonner";

type ModerationAction = "note" | "warning" | "timeout";

const ACTION_LABELS: Record<string, string> = {
  note: "Staff note",
  warning: "Warning",
  timeout: "Timeout",
  timeout_cleared: "Timeout cleared",
  kick: "Kick",
  ban: "Ban",
  unban: "Unban",
};

const ACTION_STYLES: Record<string, string> = {
  note: "border-border bg-surface text-muted-foreground",
  warning: "border-warning/40 bg-warning/10 text-warning",
  timeout: "border-warning/40 bg-warning/10 text-warning",
  timeout_cleared: "border-primary/35 bg-primary/10 text-primary",
  kick: "border-destructive/35 bg-destructive/10 text-destructive",
  ban: "border-destructive/35 bg-destructive/10 text-destructive",
  unban: "border-primary/35 bg-primary/10 text-primary",
};

export function ModerateMemberDialog({
  serverId,
  member,
  onOpenChange,
}: {
  serverId: string;
  member: {
    user: AvatarUser;
    communicationDisabledUntil: number | null;
  };
  onOpenChange: (open: boolean) => void;
}) {
  const cases = useQuery(api.moderation.memberCases, {
    serverId: serverId as Id<"servers">,
    userId: member.user.id as Id<"users">,
  });
  const createCase = useMutation(api.moderation.create);
  const clearTimeout = useMutation(api.moderation.clearTimeout);
  const resolveCase = useMutation(api.moderation.resolve);
  const [action, setAction] = useState<ModerationAction>("warning");
  const [reason, setReason] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [busy, setBusy] = useState(false);
  const now = useNow(30_000);
  const timedOut = now > 0 && (member.communicationDisabledUntil ?? 0) > now;

  const submit = async () => {
    if (busy || reason.trim().length < 3) return;
    setBusy(true);
    try {
      await createCase({
        serverId: serverId as Id<"servers">,
        userId: member.user.id as Id<"users">,
        action,
        reason,
        durationMinutes: action === "timeout" ? durationMinutes : undefined,
      });
      toast.success(
        action === "note"
          ? "Private staff note added."
          : action === "warning"
            ? "Warning sent."
            : "Member timed out.",
      );
      setReason("");
    } catch (error) {
      toast.error(readableError(error, "Could not create that case."));
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await clearTimeout({
        serverId: serverId as Id<"servers">,
        userId: member.user.id as Id<"users">,
        reason: reason.trim() || undefined,
      });
      toast.success("Timeout cleared.");
      setReason("");
    } catch (error) {
      toast.error(readableError(error, "Could not clear the timeout."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserAvatar user={member.user} size="sm" />
            Moderate {member.user.name}
          </DialogTitle>
          <DialogDescription>
            Add a private note, warn this member, or temporarily stop them from
            posting. Every action is kept in the community's case history.
          </DialogDescription>
        </DialogHeader>

        {timedOut && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
            <span className="flex items-center gap-1.5 text-warning">
              <Clock className="size-3.5" /> Timed out until{" "}
              {new Date(member.communicationDisabledUntil!).toLocaleString()}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void clear()}
            >
              Clear timeout
            </Button>
          </div>
        )}

        <div className="grid grid-cols-3 gap-2">
          {(["note", "warning", "timeout"] as ModerationAction[]).map(
            (value) => (
              <button
                key={value}
                type="button"
                onClick={() => setAction(value)}
                className={cn(
                  "rounded-lg border px-3 py-2 text-xs font-semibold capitalize transition-colors",
                  action === value
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border/70 bg-surface text-muted-foreground hover:text-foreground",
                )}
              >
                {value === "note" ? "Staff note" : value}
              </button>
            ),
          )}
        </div>

        {action === "timeout" && (
          <div className="space-y-1.5">
            <Label htmlFor="moderation-duration">Duration</Label>
            <select
              id="moderation-duration"
              value={durationMinutes}
              onChange={(event) =>
                setDurationMinutes(Number(event.target.value))
              }
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value={5}>5 minutes</option>
              <option value={10}>10 minutes</option>
              <option value={60}>1 hour</option>
              <option value={1440}>1 day</option>
              <option value={10080}>7 days</option>
            </select>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="moderation-reason">
            {action === "note" ? "Private note" : "Reason shown to member"}
          </Label>
          <Textarea
            id="moderation-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            maxLength={500}
            placeholder={
              action === "note"
                ? "Context for other moderators…"
                : "Explain which community rule was broken…"
            }
          />
        </div>
        <div className="flex justify-end">
          <Button
            disabled={busy || reason.trim().length < 3}
            onClick={() => void submit()}
          >
            {busy && <Loader2 className="mr-1.5 size-4 animate-spin" />}
            {action === "note"
              ? "Add note"
              : action === "warning"
                ? "Send warning"
                : "Apply timeout"}
          </Button>
        </div>

        <div className="border-t border-border/60 pt-4">
          <h3 className="text-sm font-semibold">Case history</h3>
          <div className="mt-2 space-y-2">
            {cases === undefined ? (
              <p className="text-xs text-muted-foreground">Loading cases…</p>
            ) : cases.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No moderation cases for this member.
              </p>
            ) : (
              cases.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-lg border border-border/60 bg-surface px-3 py-2 text-xs"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <CaseChip action={entry.action} />
                    <span className="text-muted-foreground">
                      {new Date(entry.createdAt).toLocaleString()} ·{" "}
                      {entry.moderator?.name ?? "Unknown moderator"}
                    </span>
                    {entry.resolvedAt ? (
                      <span className="ml-auto text-muted-foreground">
                        Resolved
                      </span>
                    ) : entry.action === "warning" ||
                      entry.action === "note" ? (
                      <button
                        type="button"
                        className="ml-auto font-medium text-primary hover:underline"
                        onClick={() =>
                          void resolveCase({
                            caseId: entry.id as Id<"moderationCases">,
                          })
                        }
                      >
                        Resolve
                      </button>
                    ) : null}
                  </div>
                  <p className="mt-1 text-muted-foreground">{entry.reason}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CaseChip({ action }: { action: string }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold",
        ACTION_STYLES[action] ?? ACTION_STYLES.note,
      )}
    >
      {ACTION_LABELS[action] ?? action}
    </span>
  );
}

export function ModerationCaseActivity({ serverId }: { serverId: string }) {
  const cases = useQuery(api.moderation.list, {
    serverId: serverId as Id<"servers">,
  });
  const resolveCase = useMutation(api.moderation.resolve);

  return (
    <div className="mt-6 border-t border-border/60 pt-5">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <ShieldAlert className="size-4 text-warning" /> Moderation cases
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Staff notes, warnings, timeouts, kicks and bans across this community.
      </p>
      <div className="mt-3 space-y-2">
        {cases === undefined ? (
          <p className="text-sm text-muted-foreground">Loading cases…</p>
        ) : cases.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No moderation cases yet.
          </p>
        ) : (
          cases.slice(0, 30).map((entry) => (
            <div
              key={entry.id}
              className="rounded-lg border border-border/60 bg-surface px-3 py-2 text-xs"
            >
              <div className="flex flex-wrap items-center gap-2">
                <CaseChip action={entry.action} />
                <span className="font-semibold">
                  {entry.target?.name ?? "Deleted member"}
                </span>
                <span className="text-muted-foreground">
                  by {entry.moderator?.name ?? "Unknown moderator"} ·{" "}
                  {new Date(entry.createdAt).toLocaleString()}
                </span>
                {entry.resolvedAt ? (
                  <span className="ml-auto text-muted-foreground">
                    Resolved
                  </span>
                ) : entry.action === "warning" || entry.action === "note" ? (
                  <button
                    type="button"
                    className="ml-auto font-medium text-primary hover:underline"
                    onClick={() =>
                      void resolveCase({
                        caseId: entry.id as Id<"moderationCases">,
                      })
                    }
                  >
                    Resolve
                  </button>
                ) : null}
              </div>
              <p className="mt-1 text-muted-foreground">{entry.reason}</p>
              {entry.expiresAt && entry.action === "timeout" && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Until {new Date(entry.expiresAt).toLocaleString()}
                </p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
