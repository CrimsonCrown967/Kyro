import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
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
import { toast } from "sonner";
import { readableDeveloperError } from "./DeveloperShared";
import type { MentionUser } from "./Composer";
import { BotEmbeds } from "./BotEmbeds";

export type InstalledCommand = FunctionReturnType<
  typeof api.botCommands.listForChannel
>[number];

export function BotCommandDialog({
  command,
  channelId,
  users,
  onClose,
  onSent,
}: {
  command: InstalledCommand;
  channelId: string;
  users: MentionUser[];
  onClose: () => void;
  onSent: () => void;
}) {
  const invoke = useMutation(api.botCommands.invoke);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            /{command.name}{" "}
            <span className="text-xs font-normal text-muted-foreground">
              {command.applicationName}
            </span>
          </DialogTitle>
          <DialogDescription>{command.description}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (busy) return;
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
            setBusy(true);
            void invoke({
              channelId: channelId as Id<"channels">,
              commandId: command.id,
              options,
            })
              .then(() => {
                toast.success("Command sent to " + command.applicationName);
                onSent();
                onClose();
              })
              .catch((e) => toast.error(readableDeveloperError(e)))
              .finally(() => setBusy(false));
          }}
        >
          {command.options.map((option) => (
            <label key={option.name} className="block space-y-2 text-sm">
              <span className="font-medium">
                {option.name}
                {option.required ? " *" : " (optional)"}
              </span>
              <span className="block text-xs text-muted-foreground">
                {option.description}
              </span>
              {option.type === "boolean" ||
              option.type === "user" ||
              option.choices?.length ? (
                <select
                  aria-label={option.name}
                  className="h-10 w-full rounded-md border border-border bg-background px-3"
                  value={values[option.name] ?? ""}
                  required={option.required}
                  onChange={(e) =>
                    setValues({ ...values, [option.name]: e.target.value })
                  }
                >
                  <option value="">Choose {option.name}</option>
                  {option.type === "boolean" ? (
                    <>
                      <option value="true">True</option>
                      <option value="false">False</option>
                    </>
                  ) : option.type === "user" ? (
                    users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name} (@{user.username})
                      </option>
                    ))
                  ) : (
                    option.choices?.map((choice) => (
                      <option key={choice.value} value={String(choice.value)}>
                        {choice.name}
                      </option>
                    ))
                  )}
                </select>
              ) : (
                <Input
                  aria-label={option.name}
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
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Sending…" : "Run command"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function BotInteractionResponses({ channelId }: { channelId: string }) {
  const interactions = useQuery(api.botCommands.ownInteractions, {
    channelId: channelId as Id<"channels">,
  });
  const [dismissed, setDismissed] = useState<string[]>([]);
  const visible = interactions?.filter(
    (row) =>
      !dismissed.includes(row.id) &&
      (row.response || row.status !== "responded"),
  );
  if (!visible?.length) return null;
  return (
    <div
      aria-live="polite"
      className="max-h-56 shrink-0 space-y-2 overflow-auto px-4 py-2"
    >
      {visible.slice(0, 5).map((row) => (
        <article
          key={row.id}
          className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              {row.applicationName} · /{row.commandName} · Only you can see this
            </span>
            <button
              type="button"
              className="px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setDismissed([...dismissed, row.id])}
            >
              Dismiss
            </button>
          </div>
          {row.response ? (
            <>
              <p className="mt-2 whitespace-pre-wrap break-words">
                {row.response.content}
              </p>
              <BotEmbeds embeds={row.response.embeds} />
            </>
          ) : (
            <p className="mt-2 text-muted-foreground">
              {row.status === "expired"
                ? "The bot did not respond before this interaction expired."
                : "Waiting for the bot to respond…"}
            </p>
          )}
        </article>
      ))}
    </div>
  );
}
