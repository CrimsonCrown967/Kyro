import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Code, Loader2, Pencil, Plus, Trash2 } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  BOT_EVENT_TYPES,
  botCommandSchema,
  type BotCommandInput,
} from "@/lib/botContracts";
import {
  DeveloperEmpty,
  DeveloperField,
  DeveloperLoading,
  developerInput,
  developerPanel,
  developerSelect,
  PermissionPicker,
  readableDeveloperError,
} from "./DeveloperShared";

export function DeveloperCommands({
  applicationId,
}: {
  applicationId: Id<"botApplications">;
}) {
  const commands = useQuery(api.botCommands.list, { applicationId });
  const servers = useQuery(api.botApplications.ownedInstallations, {
    applicationId,
  });
  const replace = useMutation(api.botCommands.replace);
  const [scope, setScope] = useState("global");
  const [editor, setEditor] = useState<{
    originalName?: string;
    name: string;
    description: string;
    options: string;
    permissions: string[];
  } | null>(null);
  const [deleteName, setDeleteName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const scoped = commands?.filter(
    (command) => (command.serverId ?? "global") === scope,
  );
  const existing = (): BotCommandInput[] =>
    (scoped ?? []).map(({ name, description, options, permissions }) => ({
      name,
      description,
      options,
      permissions,
    }));
  const save = async (nextCommands: BotCommandInput[]) => {
    if (busy) return;
    setBusy(true);
    try {
      const validated = nextCommands.map((command) =>
        botCommandSchema.parse(command),
      );
      await replace({
        applicationId,
        serverId: scope === "global" ? undefined : (scope as Id<"servers">),
        commands: validated,
      });
      setEditor(null);
      setDeleteName(null);
      toast.success("Commands saved. Changes are available immediately.");
    } catch (error) {
      toast.error(readableDeveloperError(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-5">
      <section className={developerPanel}>
        <p className="text-sm leading-6 text-[#A0A6B5]">
          Register commands for every server or one installed server. Your bot
          receives an interaction when a member runs a command and responds
          through the SDK or API.
        </p>
        <div className="mt-5 flex flex-wrap items-end gap-3">
          <div className="min-w-48 flex-1">
            <DeveloperField label="Command scope">
              <select
                className={developerSelect}
                value={scope}
                onChange={(event) => setScope(event.target.value)}
              >
                <option value="global">Global — all installations</option>
                {servers?.map((server) => (
                  <option key={server.id} value={server.id}>
                    {server.name}
                  </option>
                ))}
              </select>
            </DeveloperField>
          </div>
          <Button
            className="bg-[#5865F2] text-white"
            onClick={() =>
              setEditor({
                name: "",
                description: "",
                options: "[]",
                permissions: [],
              })
            }
          >
            <Plus className="mr-2 size-4" />
            Create command
          </Button>
        </div>
      </section>
      {scoped === undefined ? (
        <DeveloperLoading label="Loading commands" />
      ) : scoped.length === 0 ? (
        <DeveloperEmpty title="No commands in this scope">
          Create your first command, or register commands from your bot with the
          SDK.
        </DeveloperEmpty>
      ) : (
        <div className="space-y-3">
          {scoped.map((command) => (
            <section key={command.id} className={developerPanel}>
              <div className="flex items-start gap-3">
                <Code className="mt-1 size-5 shrink-0 text-[#A5ACFF]" />
                <div className="min-w-0 flex-1">
                  <h2 className="font-mono font-semibold">/{command.name}</h2>
                  <p className="mt-1 text-sm text-[#A0A6B5]">
                    {command.description}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {command.options.map((option) => (
                      <span
                        key={option.name}
                        className="rounded-md bg-[#111318] px-2 py-1 font-mono text-[10px] text-[#A0A6B5]"
                      >
                        {option.required ? "<" : "["}
                        {option.name}: {option.type}
                        {option.required ? ">" : "]"}
                      </span>
                    ))}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={"Edit /" + command.name}
                  onClick={() =>
                    setEditor({
                      originalName: command.name,
                      name: command.name,
                      description: command.description,
                      options: JSON.stringify(command.options, null, 2),
                      permissions: command.permissions,
                    })
                  }
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={"Delete /" + command.name}
                  onClick={() => setDeleteName(command.name)}
                >
                  <Trash2 className="size-4 text-red-300" />
                </Button>
              </div>
            </section>
          ))}
        </div>
      )}
      <Dialog
        open={editor !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setEditor(null);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto border-white/10 bg-[#1B1E27] text-white sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editor?.originalName ? "Edit command" : "Create slash command"}
            </DialogTitle>
            <DialogDescription className="text-[#A0A6B5]">
              Command registration is saved to Kyro. Your external bot handles
              execution.
            </DialogDescription>
          </DialogHeader>
          {editor && (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                try {
                  const command = botCommandSchema.parse({
                    name: editor.name,
                    description: editor.description,
                    options: JSON.parse(editor.options),
                    permissions: editor.permissions,
                  });
                  if (
                    existing().some(
                      (entry) =>
                        entry.name === command.name &&
                        entry.name !== editor.originalName,
                    )
                  )
                    throw new Error(
                      "A command with that name already exists in this scope.",
                    );
                  void save([
                    ...existing().filter(
                      (entry) => entry.name !== editor.originalName,
                    ),
                    command,
                  ]);
                } catch (error) {
                  toast.error(readableDeveloperError(error));
                }
              }}
            >
              <DeveloperField label="Command name">
                <Input
                  className={developerInput}
                  value={editor.name}
                  onChange={(event) =>
                    setEditor({
                      ...editor,
                      name: event.target.value.toLowerCase(),
                    })
                  }
                  required
                  pattern="[a-z][a-z0-9_-]{0,31}"
                  placeholder="ping"
                />
              </DeveloperField>
              <DeveloperField label="Description">
                <Input
                  className={developerInput}
                  value={editor.description}
                  onChange={(event) =>
                    setEditor({ ...editor, description: event.target.value })
                  }
                  required
                  maxLength={100}
                  placeholder="Check if the bot is online"
                />
              </DeveloperField>
              <DeveloperField
                label="Arguments (JSON)"
                hint={
                  'Supported types: string, integer, boolean, user. Example: [{"name":"member","description":"Choose a member","type":"user","required":true}]. Use choices for autocomplete suggestions.'
                }
              >
                <Textarea
                  className={developerInput + " font-mono text-xs"}
                  rows={8}
                  spellCheck={false}
                  value={editor.options}
                  onChange={(event) =>
                    setEditor({ ...editor, options: event.target.value })
                  }
                />
              </DeveloperField>
              <details className="rounded-lg border border-white/10 p-3">
                <summary className="cursor-pointer text-sm">
                  Required member permissions ({editor.permissions.length})
                </summary>
                <div className="mt-3">
                  <PermissionPicker
                    value={editor.permissions}
                    onChange={(permissions) =>
                      setEditor({ ...editor, permissions })
                    }
                  />
                </div>
              </details>
              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setEditor(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={busy}
                  className="bg-[#5865F2] text-white"
                >
                  {busy && <Loader2 className="mr-2 size-4 animate-spin" />}Save
                  command
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={deleteName !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteName(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete /{deleteName}?</DialogTitle>
            <DialogDescription>
              Members will no longer see this command in this scope.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteName(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() =>
                void save(
                  existing().filter((entry) => entry.name !== deleteName),
                )
              }
            >
              Delete command
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

type Application = FunctionReturnType<typeof api.botApplications.list>[number];

export function DeveloperEvents({ application }: { application: Application }) {
  const update = useMutation(api.botApplications.update);
  const retry = useMutation(api.botEvents.retry);
  const logs = useQuery(api.botEvents.logs, { applicationId: application.id });
  const [subscriptions, setSubscriptions] = useState<string[]>(
    application.subscriptions ?? [],
  );
  const [webhookUrl, setWebhookUrl] = useState(application.webhookUrl ?? "");
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-5">
      <form
        className={developerPanel + " space-y-5"}
        onSubmit={(event) => {
          event.preventDefault();
          setBusy(true);
          void update({
            applicationId: application.id,
            subscriptions,
            webhookUrl: webhookUrl.trim(),
          })
            .then(() => toast.success("Event settings saved."))
            .catch((error) => toast.error(readableDeveloperError(error)))
            .finally(() => setBusy(false));
        }}
      >
        <p className="text-sm leading-6 text-[#A0A6B5]">
          Subscribe to events for your installed servers. The SDK polls the
          durable event queue. Optionally receive signed deliveries at an HTTPS
          webhook endpoint on your host.
        </p>
        <DeveloperField
          label="Webhook endpoint"
          hint="Use a public HTTPS URL. Leave empty to receive events through the SDK only."
        >
          <Input
            type="url"
            className={developerInput}
            value={webhookUrl}
            onChange={(event) => setWebhookUrl(event.target.value)}
            placeholder="https://your-bot.example.com/kyro/events"
            maxLength={2048}
          />
        </DeveloperField>
        <fieldset>
          <legend className="mb-3 text-sm font-medium">
            Event subscriptions
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {BOT_EVENT_TYPES.map((type) => (
              <label
                key={type}
                className="flex items-center gap-3 rounded-lg border border-white/10 p-3 font-mono text-xs"
              >
                <input
                  type="checkbox"
                  className="size-4 accent-[#5865F2]"
                  checked={subscriptions.includes(type)}
                  onChange={(event) =>
                    setSubscriptions(
                      event.target.checked
                        ? [...subscriptions, type]
                        : subscriptions.filter((entry) => entry !== type),
                    )
                  }
                />
                {type}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="rounded-xl bg-[#111318] p-4 text-xs leading-6 text-[#A0A6B5]">
          Verify each delivery with the SDK's webhook verifier before processing
          it. Obtain and pin your application's Ed25519 public key from{" "}
          <code className="text-[#B8BEFF]">GET /gateway</code>. Check the
          timestamp, persist event IDs for deduplication, and return a
          successful response after durably accepting the event.
        </div>
        <Button
          disabled={busy}
          type="submit"
          className="bg-[#5865F2] text-white"
        >
          {busy && <Loader2 className="mr-2 size-4 animate-spin" />}Save event
          settings
        </Button>
      </form>
      <section className={developerPanel}>
        <h2 className="font-semibold">Delivery history</h2>
        <p className="mt-1 text-xs text-[#A0A6B5]">
          Recent delivery attempts, including retries and failures.
        </p>
        {logs === undefined ? (
          <DeveloperLoading label="Loading deliveries" />
        ) : logs.length === 0 ? (
          <p className="py-8 text-center text-sm text-[#A0A6B5]">
            No deliveries recorded yet. Subscribe to an event and trigger it in
            an installed server.
          </p>
        ) : (
          <div className="mt-5 divide-y divide-white/10">
            {logs.map((entry) => (
              <div
                key={entry.id}
                className="flex flex-wrap items-center justify-between gap-3 py-4"
              >
                <div>
                  <p className="font-mono text-sm">{entry.eventType}</p>
                  <p className="mt-1 text-xs text-[#A0A6B5]">
                    {new Date(entry.createdAt).toLocaleString()} ·{" "}
                    {entry.attempts} attempts
                  </p>
                  {entry.lastError && (
                    <p className="mt-1 max-w-lg break-words text-xs text-red-300">
                      {entry.lastError}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={
                      entry.status === "failed"
                        ? "text-xs text-red-300"
                        : "text-xs text-[#A0A6B5]"
                    }
                  >
                    {entry.status}
                  </span>
                  {entry.status === "failed" && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => {
                        setBusy(true);
                        void retry({ deliveryId: entry.id })
                          .then(() =>
                            toast.success("Delivery queued for retry."),
                          )
                          .catch((error) =>
                            toast.error(readableDeveloperError(error)),
                          )
                          .finally(() => setBusy(false));
                      }}
                    >
                      Retry
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
