import { useMutation } from "convex/react";
import { useState } from "react";
import { Download, Loader2 } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { toast } from "sonner";

function safeFileName(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "community"
  );
}

export function ServerConfigurationExport({
  serverId,
  serverName,
}: {
  serverId: string;
  serverName: string;
}) {
  const exportConfiguration = useMutation(api.servers.exportConfiguration);
  const [busy, setBusy] = useState(false);

  const download = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const configuration = await exportConfiguration({
        serverId: serverId as Id<"servers">,
      });
      const blob = new Blob([JSON.stringify(configuration, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${safeFileName(serverName)}-kyro-config-${new Date()
        .toISOString()
        .slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast.success("Community configuration downloaded.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not export this community.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-7 border-t border-border/60 pt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Configuration backup</h2>
          <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
            Download channels, categories, roles, permissions, safety rules and
            appearance as portable JSON. Members, messages, invites, bans and
            upload credentials are never included.
          </p>
        </div>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => void download()}
        >
          {busy ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <Download className="mr-2 size-4" />
          )}
          Download configuration
        </Button>
      </div>
    </div>
  );
}
