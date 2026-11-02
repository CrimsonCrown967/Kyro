import { useState, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Ban, Loader2, Send, Users } from "@/components/icons";

/**
 * Wraps everything rendered under `/dashboard/s/:id`.
 *
 * The server queries (channels, members, settings) all demand membership and
 * *throw* without it — a thrown query escapes to the root error boundary and
 * the visitor sees "Preview runtime error" instead of a page. This gate asks a
 * question that never throws, so a missing membership renders a proper Join
 * screen (and a deleted community renders a proper not-found screen) while the
 * rest of the page stays mounted behind it.
 */
export function MembershipGate({
  serverId,
  children,
}: {
  serverId: string;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const state = useQuery(api.servers.joinState, {
    serverId: serverId as Id<"servers">,
  });
  const join = useMutation(api.servers.join);
  const apply = useMutation(api.applications.submit);
  const [busy, setBusy] = useState(false);
  const [answers, setAnswers] = useState<string[]>([]);

  if (state === undefined) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!state.exists) {
    return (
      <Screen>
        <p className="text-sm font-semibold">Community not found</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          It may have been deleted, or the link may be wrong.
        </p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => navigate("/dashboard")}
        >
          <ArrowLeft className="mr-1.5 size-4" /> Back to Kyro
        </Button>
      </Screen>
    );
  }

  if (state.isMember) return <>{children}</>;

  const joinNow = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await join({ serverId: serverId as Id<"servers"> });
      toast.success(`Welcome to ${state.name}!`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not join.");
      setBusy(false);
    }
  };

  const submitApplication = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await apply({
        serverId: serverId as Id<"servers">,
        answers: state.applicationQuestions.map(
          (_, index) => answers[index] ?? "",
        ),
      });
      toast.success("Application submitted.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not submit application.",
      );
      setBusy(false);
    }
  };

  const applicationPending = state.application?.status === "pending";

  return (
    <Screen>
      <div className="flex size-16 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-brand to-cyan text-lg font-bold text-white shadow-md">
        {state.iconUrl ? (
          <img src={state.iconUrl} alt="" className="size-full object-cover" />
        ) : (
          (state.name ?? "?").slice(0, 2).toUpperCase()
        )}
      </div>
      <p className="mt-4 text-lg font-semibold">{state.name}</p>
      <p className="max-w-sm text-sm text-muted-foreground">
        {state.description ?? "You're not a member of this community yet."}
      </p>
      <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Users className="size-3.5" /> {state.memberCount} member
        {state.memberCount === 1 ? "" : "s"}
      </p>

      {state.banned ? (
        <p className="mt-4 flex items-center gap-1.5 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <Ban className="size-4" /> You're banned from this community.
        </p>
      ) : applicationPending ? (
        <div className="mt-4 w-full max-w-md rounded-xl border border-primary/25 bg-primary/5 p-4">
          <p className="text-sm font-semibold">Application pending</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Staff will review your answers and send you a notification when
            there's a decision.
          </p>
        </div>
      ) : state.applyToJoin ? (
        <div className="mt-4 w-full max-w-md space-y-3 text-left">
          {state.application?.status === "rejected" && (
            <div className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
              <p className="font-semibold text-warning">
                Your last application wasn't approved.
              </p>
              {state.application.note && (
                <p className="mt-0.5 text-muted-foreground">
                  {state.application.note}
                </p>
              )}
              <p className="mt-1 text-muted-foreground">
                You can update your answers and apply again.
              </p>
            </div>
          )}
          {state.applicationQuestions.map((question, index) => (
            <div key={question} className="space-y-1.5">
              <label
                htmlFor={`application-answer-${index}`}
                className="text-xs font-semibold"
              >
                {question}
              </label>
              <Textarea
                id={`application-answer-${index}`}
                value={answers[index] ?? ""}
                onChange={(event) =>
                  setAnswers((current) => {
                    const next = [...current];
                    next[index] = event.target.value;
                    return next;
                  })
                }
                rows={3}
                maxLength={1000}
                placeholder="Your answer…"
              />
            </div>
          ))}
          <Button
            className="w-full"
            disabled={
              busy ||
              state.applicationQuestions.some(
                (_, index) => (answers[index] ?? "").trim().length < 2,
              )
            }
            onClick={() => void submitApplication()}
          >
            {busy ? (
              <Loader2 className="mr-1.5 size-4 animate-spin" />
            ) : (
              <Send className="mr-1.5 size-4" />
            )}
            Submit application
          </Button>
        </div>
      ) : state.isPublic ? (
        <Button className="mt-4" disabled={busy} onClick={() => void joinNow()}>
          {busy && <Loader2 className="mr-1.5 size-4 animate-spin" />}
          Join community
        </Button>
      ) : (
        <p className="mt-4 rounded-lg border border-border/70 bg-surface px-3 py-2 text-sm text-muted-foreground">
          This community is invite-only.
        </p>
      )}

      <Button
        variant="ghost"
        className="mt-2"
        onClick={() => navigate("/dashboard")}
      >
        <ArrowLeft className="mr-1.5 size-4" /> Back to Kyro
      </Button>
    </Screen>
  );
}

function Screen({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 p-8 text-center">
      {children}
    </div>
  );
}
