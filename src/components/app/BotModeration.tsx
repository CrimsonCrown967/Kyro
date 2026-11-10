import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { DeveloperLoading, readableDeveloperError } from "./DeveloperShared";

export function BotModeration({
  isAdmin,
  isStaff,
}: {
  isAdmin: boolean;
  isStaff: boolean;
}) {
  const [search, setSearch] = useState("");
  const applications = useQuery(
    api.botApplications.moderationList,
    isStaff ? { search } : "skip",
  );
  const reports = useQuery(api.botApplications.reports, isStaff ? {} : "skip");
  const moderate = useMutation(api.botApplications.moderate);
  const [pending, setPending] = useState<{
    applicationId: Id<"botApplications">;
    name: string;
    suspended: boolean;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async (args: Parameters<typeof moderate>[0]) => {
    if (busy) return;
    setBusy(true);
    try {
      await moderate(args);
      setPending(null);
      toast.success("Bot moderation saved.");
    } catch (error) {
      toast.error(readableDeveloperError(error));
    } finally {
      setBusy(false);
    }
  };
  if (!isStaff)
    return (
      <p className="text-sm text-muted-foreground">
        Staff access is required to review bot applications.
      </p>
    );
  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-xl font-semibold">Bot applications</h2>
        <p className="my-2 text-sm text-muted-foreground">
          Review applications and abuse reports. Administrators can suspend
          bots, grant verification, and choose featured listings.
        </p>
        <Input
          aria-label="Search bot applications"
          placeholder="Search bot applications"
          maxLength={100}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="my-4 max-w-md"
        />
        {applications === undefined ? (
          <DeveloperLoading />
        ) : !applications.length ? (
          <p>No applications found.</p>
        ) : (
          <div className="space-y-3">
            {applications.map((app) => (
              <article
                key={app.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-4"
              >
                <div>
                  <h3 className="font-medium">{app.name}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {app.suspended
                      ? "Suspended"
                      : app.enabled
                        ? "Enabled"
                        : "Disabled"}{" "}
                    · {app.verified ? "Verified" : "Unverified"}
                    {app.featured ? " · Featured" : ""}
                  </p>
                  <code className="break-all text-xs text-muted-foreground">
                    {app.id}
                  </code>
                </div>
                {isAdmin && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        void save({
                          applicationId: app.id,
                          verified: !app.verified,
                        })
                      }
                    >
                      {app.verified ? "Remove verification" : "Verify"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        void save({
                          applicationId: app.id,
                          featured: !app.featured,
                        })
                      }
                    >
                      {app.featured ? "Unfeature" : "Feature"}
                    </Button>
                    <Button
                      size="sm"
                      variant={app.suspended ? "outline" : "destructive"}
                      disabled={busy}
                      onClick={() =>
                        setPending({
                          applicationId: app.id,
                          name: app.name,
                          suspended: !app.suspended,
                        })
                      }
                    >
                      {app.suspended ? "Lift suspension" : "Suspend"}
                    </Button>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
      <section>
        <h2 className="mb-3 font-semibold">Open abuse reports</h2>
        {reports === undefined ? (
          <DeveloperLoading label="Loading reports" />
        ) : !reports.length ? (
          <p className="text-sm text-muted-foreground">No open bot reports.</p>
        ) : (
          <div className="space-y-3">
            {reports.map((report) => (
              <article
                key={report._id}
                className="rounded-xl border border-border p-4"
              >
                <p className="break-all text-xs text-muted-foreground">
                  Application {report.applicationId} ·{" "}
                  {new Date(report.createdAt).toLocaleString()}
                </p>
                <p className="my-3 whitespace-pre-wrap text-sm">
                  {report.reason}
                </p>
                {isAdmin && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      void save({
                        applicationId: report.applicationId,
                        reportId: report._id,
                      })
                    }
                  >
                    Resolve report
                  </Button>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
      <Dialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setPending(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pending?.suspended ? "Suspend" : "Restore"} {pending?.name}?
            </DialogTitle>
            <DialogDescription>
              {pending?.suspended
                ? "The bot token will be revoked immediately. API requests and event delivery stop, and the bot leaves discovery."
                : "The owner must generate a new token and enable the bot again. Old tokens remain revoked."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => setPending(null)}
            >
              Cancel
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                pending &&
                void save({
                  applicationId: pending.applicationId,
                  suspended: pending.suspended,
                })
              }
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
