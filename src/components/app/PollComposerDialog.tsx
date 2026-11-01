import { useMutation } from "convex/react";
import { useState } from "react";
import { BarChart3, Loader2, Plus, Trash2 } from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { toast } from "sonner";

export function PollComposerDialog({
  open,
  onOpenChange,
  containerType,
  containerId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  containerType: "channel" | "conversation";
  containerId: string;
}) {
  const send = useMutation(api.messages.send);
  const attach = useMutation(api.polls.attach);
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [multiple, setMultiple] = useState(false);
  const [duration, setDuration] = useState("1440");
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (busy) return;
    const cleanOptions = options.map((option) => option.trim()).filter(Boolean);
    if (question.trim().length < 3 || cleanOptions.length < 2) return;
    setBusy(true);
    try {
      const result = await send({
        containerType,
        containerId,
        content: `📊 ${question.trim()}`,
        clientId: crypto.randomUUID(),
      });
      await attach({
        messageId: result.messageId as Id<"messages">,
        question,
        options: cleanOptions,
        multiple,
        durationMinutes: duration === "0" ? undefined : Number(duration),
      });
      toast.success("Poll created.");
      setQuestion("");
      setOptions(["", ""]);
      setMultiple(false);
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not create poll.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create a poll</DialogTitle>
          <DialogDescription>
            Ask up to ten options. Votes update live for everyone.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="poll-question">Question</Label>
            <Input
              id="poll-question"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              maxLength={200}
              placeholder="What should we do next?"
            />
          </div>
          <div className="grid gap-2">
            <Label>Options</Label>
            {options.map((option, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  value={option}
                  onChange={(event) =>
                    setOptions((current) =>
                      current.map((value, optionIndex) =>
                        optionIndex === index ? event.target.value : value,
                      ),
                    )
                  }
                  maxLength={100}
                  placeholder={`Option ${index + 1}`}
                />
                {options.length > 2 && (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() =>
                      setOptions((current) =>
                        current.filter(
                          (_, optionIndex) => optionIndex !== index,
                        ),
                      )
                    }
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
            ))}
            {options.length < 10 && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="justify-self-start"
                onClick={() => setOptions((current) => [...current, ""])}
              >
                <Plus className="mr-1.5 size-4" /> Add option
              </Button>
            )}
          </div>
          <label className="flex items-center justify-between gap-4 rounded-xl border border-border/70 bg-surface p-3 text-sm">
            Allow multiple choices
            <Switch checked={multiple} onCheckedChange={setMultiple} />
          </label>
          <div className="grid gap-2">
            <Label htmlFor="poll-duration">Close poll</Label>
            <select
              id="poll-duration"
              value={duration}
              onChange={(event) => setDuration(event.target.value)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="60">In 1 hour</option>
              <option value="360">In 6 hours</option>
              <option value="1440">In 1 day</option>
              <option value="4320">In 3 days</option>
              <option value="10080">In 7 days</option>
              <option value="0">Manually</option>
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              disabled={
                busy ||
                question.trim().length < 3 ||
                options.filter((option) => option.trim()).length < 2
              }
              onClick={() => void create()}
            >
              {busy ? (
                <Loader2 className="mr-1.5 size-4 animate-spin" />
              ) : (
                <BarChart3 className="mr-1.5 size-4" />
              )}
              Create poll
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
