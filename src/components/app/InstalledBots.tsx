import { useState } from "react";
import { Link } from "react-router";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  BotAvatar,
  PermissionPicker,
  readableDeveloperError,
} from "./DeveloperShared";

export function InstalledBots({ serverId }: { serverId: string }) {
  const bots = useQuery(api.botApplications.installations, {
    serverId: serverId as Id<"servers">,
  });
  return (
    <section className="mb-8 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Installed applications</h2>
        <Button asChild variant="outline">
          <Link to="/bots">Find bots</Link>
        </Button>
      </div>
      {bots === undefined ? (
        <p role="status">Loading bots…</p>
      ) : !bots.length ? (
        <p className="text-sm text-muted-foreground">
          No developer bots installed. Browse the directory or use a developer's
          invitation link.
        </p>
      ) : (
        bots.map((bot) => <InstalledBot key={bot.id} bot={bot} />)
      )}
    </section>
  );
}
function InstalledBot({
  bot,
}: {
  bot: FunctionReturnType<typeof api.botApplications.installations>[number];
}) {
  const update = useMutation(api.botApplications.updateInstallation);
  const remove = useMutation(api.botApplications.uninstall);
  const [permissions, setPermissions] = useState(bot.permissions);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <article className="rounded-xl border border-border p-4">
      <div className="flex items-center gap-3">
        <BotAvatar name={bot.name} url={bot.avatarUrl} />
        <div className="flex-1">
          <Link
            to={`/bots/${bot.applicationId}`}
            className="font-semibold hover:underline"
          >
            {bot.name}
          </Link>
          <p className="text-xs text-muted-foreground">
            @{bot.username} · {bot.enabled ? "Enabled" : "Disabled"}
          </p>
        </div>
        <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
          Remove
        </Button>
      </div>
      <details className="mt-4">
        <summary className="cursor-pointer text-sm">
          Permissions ({bot.permissions.length})
        </summary>
        <div className="mt-3">
          <PermissionPicker
            value={permissions}
            onChange={setPermissions}
            disabled={busy}
          />
          <Button
            className="mt-4"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void update({ installationId: bot.id, permissions })
                .then(() => toast.success("Bot permissions updated."))
                .catch((e) => toast.error(readableDeveloperError(e)))
                .finally(() => setBusy(false));
            }}
          >
            Save permissions
          </Button>
        </div>
      </details>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {bot.name}?</DialogTitle>
            <DialogDescription>
              This immediately revokes its access to this server.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void remove({ installationId: bot.id })
                  .then(() => toast.success("Bot removed."))
                  .catch((e) => toast.error(readableDeveloperError(e)))
                  .finally(() => setBusy(false));
              }}
            >
              Remove bot
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </article>
  );
}
