import { useState } from "react";
import { Link } from "react-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { PermissionPicker, useBotTask } from "./BotPlatformShared";
export function InstalledBots({ serverId }: { serverId: Id<"servers"> }) {
  const bots = useQuery(api.botApplications.installations, { serverId });
  const update = useMutation(api.botApplications.install);
  const remove = useMutation(api.botApplications.removeInstallation);
  const task = useBotTask();
  const [selected, setSelected] = useState<{
    applicationId: Id<"botApplications">;
    name: string;
    permissions: string[];
  } | null>(null);
  const [removing, setRemoving] = useState(false);
  return (
    <section className="rounded-xl border border-border/70 bg-panel p-5">
      <div className="flex justify-between gap-3">
        <h2 className="font-semibold">Installed applications</h2>
        <Button asChild size="sm" variant="outline">
          <Link to="/dashboard/bots">Find bots</Link>
        </Button>
      </div>
      {bots === undefined ? (
        <p className="mt-3 text-sm text-muted-foreground">Loading bots…</p>
      ) : bots.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          No developer bots installed yet. Your custom commands below remain
          available.
        </p>
      ) : (
        bots.map((bot) => (
          <div
            key={bot.id}
            className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-border/60 p-3"
          >
            <div>
              <p className="text-sm font-medium">
                {bot.name} <span className="text-[10px] text-primary">BOT</span>
              </p>
              <p className="text-xs text-muted-foreground">
                {bot.permissions.length} permissions ·{" "}
                {bot.enabled ? "Enabled" : "Unavailable"}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setSelected(bot);
                setRemoving(false);
              }}
            >
              Manage
            </Button>
          </div>
        ))
      )}
      <Dialog
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {removing
                ? `Remove ${selected?.name}?`
                : `Manage ${selected?.name}`}
            </DialogTitle>
            <DialogDescription>
              {removing
                ? "The bot will immediately lose access to this server."
                : "Changes apply immediately and cannot exceed your own permissions."}
            </DialogDescription>
          </DialogHeader>
          {selected && !removing && (
            <PermissionPicker
              value={selected.permissions}
              onChange={(permissions) =>
                setSelected({ ...selected, permissions })
              }
            />
          )}
          <div className="flex gap-3">
            {selected && !removing && (
              <Button
                disabled={task.busy}
                onClick={() =>
                  void task.run(async () => {
                    await update({
                      applicationId: selected.applicationId,
                      serverId,
                      permissions: selected.permissions,
                    });
                    setSelected(null);
                  }, "Bot permissions updated")
                }
              >
                Save permissions
              </Button>
            )}
            <Button
              variant="destructive"
              disabled={task.busy}
              onClick={() => {
                if (!removing) {
                  setRemoving(true);
                  return;
                }
                if (selected)
                  void task.run(async () => {
                    await remove({
                      applicationId: selected.applicationId,
                      serverId,
                    });
                    setSelected(null);
                  }, "Bot removed");
              }}
            >
              {removing ? "Confirm removal" : "Remove bot"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
