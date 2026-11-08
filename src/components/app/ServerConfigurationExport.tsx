import { useMutation } from "convex/react";
import { useState } from "react";
import { Download, Loader2, Upload } from "@/components/icons";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { readableError } from "@/lib/errors";
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
  const publishTemplate = useMutation(api.templates.publish);
  const [busy, setBusy] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [templateName, setTemplateName] = useState(`${serverName} template`);
  const [templateDescription, setTemplateDescription] = useState("");
  const [templatePublic, setTemplatePublic] = useState(true);

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
      toast.error(readableError(error, "Could not export this community."));
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const configuration = await exportConfiguration({
        serverId: serverId as Id<"servers">,
      });
      await publishTemplate({
        serverId: serverId as Id<"servers">,
        name: templateName,
        description: templateDescription,
        isPublic: templatePublic,
        snapshotJson: JSON.stringify(configuration),
      });
      toast.success("Community template published.");
      setPublishOpen(false);
    } catch (error) {
      toast.error(readableError(error, "Could not publish this template."));
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
        <div className="flex flex-wrap gap-2">
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
          <Button disabled={busy} onClick={() => setPublishOpen(true)}>
            <Upload className="mr-2 size-4" /> Publish as template
          </Button>
        </div>
      </div>
      <Dialog open={publishOpen} onOpenChange={setPublishOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Publish community template</DialogTitle>
            <DialogDescription>
              Share this server's layout without members, messages or private
              credentials.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={templateName}
            onChange={(event) => setTemplateName(event.target.value)}
            placeholder="Template name"
            maxLength={80}
          />
          <Textarea
            value={templateDescription}
            onChange={(event) => setTemplateDescription(event.target.value)}
            placeholder="What is this layout useful for?"
            maxLength={300}
          />
          <label className="flex items-center justify-between rounded-lg border border-border/70 bg-surface p-3 text-sm">
            List this template publicly
            <Switch
              checked={templatePublic}
              onCheckedChange={setTemplatePublic}
            />
          </label>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPublishOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={busy || templateName.trim().length < 2}
              onClick={() => void publish()}
            >
              {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Publish template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
