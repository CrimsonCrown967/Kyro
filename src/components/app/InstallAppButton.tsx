import { useSyncExternalStore } from "react";
import { Link } from "react-router";
import { Download, MonitorSmartphone } from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  getInstallState,
  requestAppInstall,
  subscribeInstallState,
} from "@/lib/installApp";

export function InstallAppButton() {
  const { installed, prompt } = useSyncExternalStore(
    subscribeInstallState,
    getInstallState,
    getInstallState,
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-surface p-4">
        <div>
          <p className="text-sm font-semibold">Kyro for Windows</p>
          <p className="text-xs text-muted-foreground">
            A dedicated app for Windows 10 and 11. Keep Kyro on your desktop.
          </p>
        </div>
        <Button asChild size="sm">
          <Link to="/download">
            <Download className="mr-1.5 size-4" />
            Download for Windows
          </Link>
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/70 bg-surface p-4">
        <span className="flex size-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <MonitorSmartphone className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            {installed ? "Kyro is installed" : "Install Kyro as an app"}
          </p>
          <p className="text-xs text-muted-foreground">
            {installed
              ? "Launch it from your desktop, dock or home screen."
              : prompt
                ? "Faster launching, its own window and an app icon."
                : "Use your browser's Install app or Add to Home Screen action."}
          </p>
        </div>
        {prompt && !installed ? (
          <Button size="sm" onClick={() => void requestAppInstall()}>
            <Download className="mr-1.5 size-4" /> Install
          </Button>
        ) : null}
      </div>
    </div>
  );
}
