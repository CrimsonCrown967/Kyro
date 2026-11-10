import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Bot, Loader2, Plus, Trash2 } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { toast } from "sonner";
import { InstalledBots } from "./InstalledBots";

export function BotSettings({ serverId }: { serverId: string }) {
  const data = useQuery(api.bots.listForServer, {
    serverId: serverId as Id<"servers">,
  });
  const create = useMutation(api.bots.create);
  const update = useMutation(api.bots.update);
  const remove = useMutation(api.bots.remove);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [response, setResponse] = useState("");
  const [busy, setBusy] = useState(false);

  if (!data) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const add = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await create({
        serverId: serverId as Id<"servers">,
        name,
        description,
        response,
      });
      setName("");
      setDescription("");
      setResponse("");
      toast.success(`/${name.trim().toLowerCase()} is ready.`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not create command.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      {data.canManage && <InstalledBots serverId={serverId as Id<"servers">} />}
      <section className="rounded-xl border border-border/70 bg-panel p-5">
        <div className="flex items-start gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Bot className="size-5" />
          </span>
          <div>
            <h2 className="text-base font-semibold">Kyro Bot commands</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Members type slash commands in any text channel. Custom responses
              support {"{user}"}, {"{username}"}, {"{server}"} and {"{args}"}.
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {data.builtIns.map((command) => (
            <div
              key={command.name}
              className="rounded-lg border border-border/60 bg-surface p-3"
            >
              <p className="font-mono text-sm font-semibold text-primary">
                /{command.name}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {command.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {data.canManage ? (
        <section className="rounded-xl border border-border/70 bg-panel p-5">
          <h2 className="text-sm font-semibold">Create a custom command</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value.toLowerCase())}
              placeholder="command-name"
              maxLength={24}
            />
            <Input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What this command does"
              maxLength={120}
            />
            <Textarea
              value={response}
              onChange={(event) => setResponse(event.target.value)}
              placeholder="Hey {user}! You passed: {args}"
              maxLength={1800}
              className="sm:col-span-2"
            />
          </div>
          <Button
            className="mt-3"
            disabled={busy || name.trim().length < 2 || !response.trim()}
            onClick={() => void add()}
          >
            {busy ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Plus className="mr-2 size-4" />
            )}
            Add command
          </Button>
        </section>
      ) : null}

      <section className="rounded-xl border border-border/70 bg-panel p-5">
        <h2 className="text-sm font-semibold">Custom commands</h2>
        {data.commands.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            No custom commands yet.
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {data.commands.map((command) => (
              <div
                key={command.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-border/60 bg-surface p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-sm font-semibold text-primary">
                    /{command.name}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {command.description}
                  </p>
                  <p className="mt-1 line-clamp-2 text-xs text-foreground/80">
                    {command.response}
                  </p>
                </div>
                {data.canManage ? (
                  <>
                    <Switch
                      checked={command.enabled}
                      aria-label={`Enable /${command.name}`}
                      onCheckedChange={(enabled) =>
                        void update({
                          commandId: command.id as Id<"serverBotCommands">,
                          enabled,
                        }).catch((error: unknown) =>
                          toast.error(
                            error instanceof Error
                              ? error.message
                              : "Could not update command.",
                          ),
                        )
                      }
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Delete /${command.name}`}
                      onClick={() => {
                        if (!window.confirm(`Delete /${command.name}?`)) return;
                        void remove({
                          commandId: command.id as Id<"serverBotCommands">,
                        }).catch((error: unknown) =>
                          toast.error(
                            error instanceof Error
                              ? error.message
                              : "Could not delete command.",
                          ),
                        );
                      }}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
