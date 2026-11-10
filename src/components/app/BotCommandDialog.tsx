import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useBotTask } from "./BotPlatformShared";
type Command = FunctionReturnType<typeof api.botCommands.forChannel>[number];
export function BotCommandDialog({
  command,
  channelId,
  members,
  onClose,
  onSent,
}: {
  command: Command;
  channelId: Id<"channels">;
  members: { id: string; name: string }[];
  onClose: () => void;
  onSent: () => void;
}) {
  const execute = useMutation(api.botCommands.execute);
  const [values, setValues] = useState<Record<string, string>>({});
  const task = useBotTask();
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>/{command.name}</DialogTitle>
          <DialogDescription>
            {command.description} · {command.applicationName}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void task.run(async () => {
              const options: Record<string, string | number | boolean> = {};
              for (const option of command.options) {
                const value = values[option.name];
                if (value === undefined || value === "") continue;
                options[option.name] =
                  option.type === "integer"
                    ? Number(value)
                    : option.type === "boolean"
                      ? value === "true"
                      : value;
              }
              await execute({ channelId, commandId: command.id, options });
              onSent();
              onClose();
            }, "Command sent to the bot");
          }}
        >
          {command.options.map((option) => (
            <label key={option.name} className="block space-y-2 text-sm">
              <span className="font-medium">
                {option.name}
                {option.required ? " *" : ""}
              </span>
              <span className="block text-xs text-muted-foreground">
                {option.description}
              </span>
              {option.type === "boolean" ||
              option.type === "user" ||
              option.choices?.length ? (
                <select
                  className="w-full rounded-md border border-border bg-background p-2"
                  required={option.required}
                  value={values[option.name] ?? ""}
                  onChange={(e) =>
                    setValues({ ...values, [option.name]: e.target.value })
                  }
                >
                  <option value="">Select a value</option>
                  {option.type === "boolean"
                    ? ["true", "false"].map((v) => <option key={v}>{v}</option>)
                    : option.type === "user"
                      ? members.map((member) => (
                          <option key={member.id} value={member.id}>
                            {member.name}
                          </option>
                        ))
                      : option.choices!.map((choice) => (
                          <option key={choice}>{choice}</option>
                        ))}
                </select>
              ) : (
                <Input
                  required={option.required}
                  type={option.type === "integer" ? "number" : "text"}
                  step={option.type === "integer" ? 1 : undefined}
                  maxLength={1000}
                  value={values[option.name] ?? ""}
                  onChange={(e) =>
                    setValues({ ...values, [option.name]: e.target.value })
                  }
                />
              )}
            </label>
          ))}
          <div className="flex gap-3">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={task.busy}>
              Run command
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
export function BotInteractionResponses({
  channelId,
}: {
  channelId: Id<"channels">;
}) {
  const responses = useQuery(api.botCommands.responses, { channelId });
  const [dismissed, setDismissed] = useState<string[]>([]);
  return (
    <>
      {responses
        ?.filter((r) => r.ephemeral && r.response && !dismissed.includes(r.id))
        .map((response) => (
          <div
            key={response.id}
            className="mx-3 my-2 flex items-start justify-between gap-3 rounded-lg border border-primary/25 bg-primary/5 p-3 text-sm"
            role="status"
          >
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase text-primary">
                Only visible to you
              </p>
              <p className="whitespace-pre-wrap break-words">
                {response.response}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDismissed([...dismissed, response.id])}
            >
              Dismiss
            </Button>
          </div>
        ))}
    </>
  );
}
