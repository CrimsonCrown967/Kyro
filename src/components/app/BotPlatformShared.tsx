import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { BOT_PERMISSIONS } from "@/lib/botContract";
import { PERMISSION_META } from "@/lib/permissions";
import { readableError } from "@/lib/errors";
import { Loader2 } from "lucide-react";

export function BotPanel({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-white/10 bg-[#1B1E27] p-5 sm:p-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      {description && (
        <p className="mt-1 text-sm text-[#A0A6B5]">{description}</p>
      )}
      <div className="mt-5 space-y-4">{children}</div>
    </section>
  );
}
export function BotLoading() {
  return (
    <div className="flex min-h-48 items-center justify-center" role="status">
      <Loader2 className="size-6 animate-spin" />
      <span className="sr-only">Loading developer platform</span>
    </div>
  );
}
export function PermissionPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {BOT_PERMISSIONS.map((permission) => (
        <label
          key={permission}
          className="flex cursor-pointer items-start gap-3 rounded-lg border border-white/10 p-3 text-sm"
        >
          <Checkbox
            className="mt-0.5"
            disabled={disabled}
            checked={value.includes(permission)}
            onCheckedChange={(checked) =>
              onChange(
                checked
                  ? [...value, permission]
                  : value.filter((p) => p !== permission),
              )
            }
          />
          <span>
            <span className="font-medium">
              {PERMISSION_META[permission].label}
            </span>
            <span className="mt-1 block text-xs text-[#A0A6B5]">
              {PERMISSION_META[permission].description}
            </span>
          </span>
        </label>
      ))}
    </div>
  );
}
export function TokenDialog({
  token,
  onClose,
}: {
  token: string;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={Boolean(token)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Save your bot token</DialogTitle>
          <DialogDescription>
            This token is shown once. Save it in your bot host's secret
            environment variables. Kyro stores its hash and cannot reveal it
            again.
          </DialogDescription>
        </DialogHeader>
        <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-muted p-4 text-xs select-all">
          {token}
        </pre>
        <div className="flex gap-2">
          <Button
            onClick={() =>
              void navigator.clipboard.writeText(token).then(
                () => toast.success("Token copied"),
                () =>
                  toast.error(
                    "Clipboard unavailable. Select and copy the token.",
                  ),
              )
            }
          >
            Copy token
          </Button>
          <Button variant="outline" onClick={onClose}>
            I've saved it
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
export function useBotTask() {
  const [busy, setBusy] = useState(false);
  return {
    busy,
    run: async (task: () => Promise<unknown>, success?: string) => {
      if (busy) return;
      setBusy(true);
      try {
        await task();
        if (success) toast.success(success);
      } catch (error) {
        toast.error(
          readableError(error, "The operation could not be completed."),
        );
      } finally {
        setBusy(false);
      }
    },
  };
}
export const BOT_DOC_ROUTES = [
  ["GET", "/me", "Bot identity"],
  ["GET", "/servers", "Installed servers"],
  ["GET / PATCH", "/servers/:id", "Read or update a server"],
  ["GET / POST", "/servers/:id/channels", "List or create channels"],
  [
    "GET / PATCH / DELETE",
    "/channels/:id",
    "Channel information and management",
  ],
  ["GET / POST", "/channels/:id/messages", "History or send a message"],
  [
    "GET / PATCH / DELETE",
    "/channels/:id/messages/:message",
    "Read, edit or delete a message",
  ],
  [
    "POST",
    "/channels/:id/messages/:message/reactions",
    "Add an emoji reaction",
  ],
  ["POST", "/channels/:id/messages/:message/polls", "Attach a poll"],
  ["POST", "/channels/:id/uploads", "Create a storage upload URL"],
  ["POST", "/channels/:id/uploads/register", "Register the uploaded file"],
  ["GET / DELETE", "/servers/:id/members/:user", "Member information or kick"],
  ["PUT", "/servers/:id/bans/:user", "Ban a member"],
  ["GET / POST", "/servers/:id/roles", "List or create roles"],
  ["PATCH / DELETE", "/servers/:id/roles/:role", "Update or delete a role"],
  [
    "PUT / DELETE",
    "/servers/:id/members/:user/roles/:role",
    "Assign or remove a role",
  ],
  ["GET / POST", "/commands", "List or register commands"],
  ["DELETE", "/commands/:id", "Delete a command"],
  ["POST", "/interactions/:id/response", "Public or ephemeral response"],
  ["GET", "/events", "Claim pending events"],
  ["POST", "/events/ack", "Acknowledge successful handling"],
  ["GET", "/webhook-key", "Public webhook verification key"],
] as const;
export function BotApiDocumentation() {
  return (
    <BotPanel
      title="Build with Kyro"
      description="Host your Node.js bot on your own server. Kyro provides identities, permissions and an API; your code runs on your infrastructure."
    >
      <p className="text-sm">
        Base URL:{" "}
        <code className="break-all text-indigo-300">
          https://kyro-chat.cyou/api/bots/v1
        </code>
      </p>
      <p className="text-sm text-[#A0A6B5]">
        Send <code>Authorization: Bot &lt;token&gt;</code> and JSON request
        bodies. Responses use <code>{"{ ok: true, data }"}</code> or{" "}
        <code>{"{ ok: false, error: { code, message } }"}</code>. Respect HTTP
        429 and the Retry-After header. Tokens belong in server environment
        variables.
      </p>
      <pre className="overflow-x-auto rounded-lg bg-black/25 p-4 text-xs leading-6">{`import { KyroClient } from "kyro.js";\nconst client = new KyroClient({ token: process.env.KYRO_BOT_TOKEN });\nclient.on("messageCreate", async message => {\n  if (!message.author.bot && message.content === "!ping") {\n    await message.reply("Pong!");\n  }\n});\nawait client.login();`}</pre>
      <p className="text-sm text-[#A0A6B5]">
        The TypeScript SDK is distributed in this repository at{" "}
        <code>sdk/kyro.js</code>. Build it locally and install from that path.
        It has not been published to npm.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-white/10">
              <th className="p-2">Method</th>
              <th className="p-2">Endpoint</th>
              <th className="p-2">Operation</th>
            </tr>
          </thead>
          <tbody>
            {BOT_DOC_ROUTES.map(([method, path, purpose]) => (
              <tr key={path} className="border-b border-white/5">
                <td className="p-2 text-indigo-300">{method}</td>
                <td className="p-2 font-mono">{path}</td>
                <td className="p-2 text-[#A0A6B5]">{purpose}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <a
        className="inline-block text-sm text-indigo-300 underline"
        href="https://github.com/CrimsonCrown967/Kyro/blob/main/docs/bot-platform.md"
        target="_blank"
        rel="noreferrer"
      >
        Full API, permissions, webhook and deployment documentation
      </a>
    </BotPanel>
  );
}
