import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Loader2, Check, Shield } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type AutoModValues = {
  enabled: boolean;
  blockedWords: string[];
  blockInvites: boolean;
  blockLinks: boolean;
  maxMentions: number;
  blockCaps: boolean;
  blockSpam: boolean;
  exemptRoleIds: string[];
  exemptChannelIds: string[];
};

export function JoinApplicationSettings({
  serverId,
  isPublic,
  applyToJoin,
  applicationQuestions,
}: {
  serverId: string;
  isPublic: boolean;
  applyToJoin: boolean;
  applicationQuestions: string[];
}) {
  const update = useMutation(api.servers.update);
  const [enabled, setEnabled] = useState(applyToJoin);
  const [questions, setQuestions] = useState(applicationQuestions.join("\n"));
  const [busy, setBusy] = useState(false);

  const save = async (nextEnabled = enabled) => {
    if (busy) return;
    setBusy(true);
    try {
      await update({
        serverId: serverId as Id<"servers">,
        applyToJoin: nextEnabled,
        applicationQuestions: questions
          .split("\n")
          .map((question) => question.trim())
          .filter(Boolean),
      });
      toast.success(
        nextEnabled ? "Application settings saved." : "Open joins restored.",
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save applications.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-7">
      <h2 className="text-sm font-semibold">Join applications</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Review people before they join. Invite links still work instantly.
        {!isPublic && " Turn on Discoverable to accept applications."}
      </p>
      <div className="mt-3 flex items-center justify-between rounded-md border border-border/60 px-3 py-2.5">
        <div>
          <p className="text-sm font-medium">Require an application</p>
          <p className="text-xs text-muted-foreground">
            New people answer your questions; staff approve or decline.
          </p>
        </div>
        <Switch
          checked={enabled}
          disabled={busy || !isPublic}
          onCheckedChange={(checked) => {
            setEnabled(checked);
            void save(checked);
          }}
          aria-label="Require an application"
        />
      </div>
      {enabled && (
        <div className="mt-3 space-y-2">
          <Label htmlFor="application-questions">
            Questions — one per line
          </Label>
          <Textarea
            id="application-questions"
            value={questions}
            onChange={(event) => setQuestions(event.target.value)}
            rows={3}
            maxLength={1000}
            placeholder={"Why do you want to join?\nWhat will you contribute?"}
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] text-muted-foreground">
              Leave empty for the default two questions. Up to 5.
            </p>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void save()}
            >
              {busy ? (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              ) : (
                <Check className="mr-1.5 size-3.5" />
              )}
              Save questions
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function AutoModSettings({
  serverId,
  channels,
  roles,
}: {
  serverId: string;
  channels: { id: string; name: string }[];
  roles: { id: string; name: string }[];
}) {
  const settings = useQuery(api.automod.getSettings, {
    serverId: serverId as Id<"servers">,
  });

  if (settings === undefined) {
    return (
      <div className="mt-7 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading AutoMod…
      </div>
    );
  }

  return (
    <AutoModForm
      serverId={serverId}
      channels={channels}
      roles={roles}
      initial={settings}
    />
  );
}

function AutoModForm({
  serverId,
  channels,
  roles,
  initial,
}: {
  serverId: string;
  channels: { id: string; name: string }[];
  roles: { id: string; name: string }[];
  initial: AutoModValues;
}) {
  const update = useMutation(api.automod.updateSettings);
  const [form, setForm] = useState<AutoModValues>(() => ({
    enabled: initial.enabled,
    blockedWords: initial.blockedWords,
    blockInvites: initial.blockInvites,
    blockLinks: initial.blockLinks,
    maxMentions: initial.maxMentions,
    blockCaps: initial.blockCaps,
    blockSpam: initial.blockSpam,
    exemptRoleIds: initial.exemptRoleIds,
    exemptChannelIds: initial.exemptChannelIds,
  }));
  const [words, setWords] = useState(initial.blockedWords.join("\n"));
  const [busy, setBusy] = useState(false);

  const toggleList = (
    key: "exemptRoleIds" | "exemptChannelIds",
    id: string,
  ) => {
    setForm((current) => ({
      ...current,
      [key]: current[key].includes(id)
        ? current[key].filter((value) => value !== id)
        : [...current[key], id],
    }));
  };

  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await update({
        serverId: serverId as Id<"servers">,
        enabled: form.enabled,
        blockedWords: words
          .split(/[\n,]/)
          .map((word) => word.trim())
          .filter(Boolean),
        blockInvites: form.blockInvites,
        blockLinks: form.blockLinks,
        maxMentions: form.maxMentions,
        blockCaps: form.blockCaps,
        blockSpam: form.blockSpam,
        exemptRoleIds: form.exemptRoleIds as Id<"serverRoles">[],
        exemptChannelIds: form.exemptChannelIds as Id<"channels">[],
      });
      toast.success("AutoMod settings saved.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save AutoMod.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-7">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Shield className="size-4 text-primary" /> AutoMod
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Stops spam and unsafe messages before they're posted. Staff with
            Manage Messages and the community owner always bypass it.
          </p>
        </div>
        <Switch
          checked={form.enabled}
          onCheckedChange={(checked) =>
            setForm((current) => ({ ...current, enabled: checked }))
          }
          aria-label="Enable AutoMod"
        />
      </div>

      {form.enabled && (
        <>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <ToggleRow
              label="Block invite links"
              description="Discord and Kyro invite URLs"
              checked={form.blockInvites}
              onChange={(checked) =>
                setForm((current) => ({ ...current, blockInvites: checked }))
              }
            />
            <ToggleRow
              label="Block all links"
              description="Any http:// or https:// URL"
              checked={form.blockLinks}
              onChange={(checked) =>
                setForm((current) => ({ ...current, blockLinks: checked }))
              }
            />
            <ToggleRow
              label="Block excessive caps"
              description="Mostly-uppercase messages over 12 letters"
              checked={form.blockCaps}
              onChange={(checked) =>
                setForm((current) => ({ ...current, blockCaps: checked }))
              }
            />
            <ToggleRow
              label="Block duplicate spam"
              description="The same message three times in 30 seconds"
              checked={form.blockSpam}
              onChange={(checked) =>
                setForm((current) => ({ ...current, blockSpam: checked }))
              }
            />
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="automod-words">Blocked words</Label>
              <Textarea
                id="automod-words"
                value={words}
                onChange={(event) => setWords(event.target.value)}
                rows={4}
                placeholder={"One word or phrase per line\nslur\ntypo-phrase"}
              />
              <p className="text-[11px] text-muted-foreground">
                Whole words only, case-insensitive. Up to 100.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="automod-mentions">Maximum mentions</Label>
              <Input
                id="automod-mentions"
                type="number"
                min={0}
                max={50}
                value={form.maxMentions}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    maxMentions: Number(event.target.value) || 0,
                  }))
                }
              />
              <p className="text-[11px] text-muted-foreground">
                0 disables the mention limit. @everyone and @here count.
              </p>
            </div>
          </div>

          {channels.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold">Exempt channels</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {channels.slice(0, 40).map((channel) => (
                  <button
                    key={channel.id}
                    type="button"
                    onClick={() => toggleList("exemptChannelIds", channel.id)}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-[11px]",
                      form.exemptChannelIds.includes(channel.id)
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border/70 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    #{channel.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {roles.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold">Exempt roles</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {roles.slice(0, 30).map((role) => (
                  <button
                    key={role.id}
                    type="button"
                    onClick={() => toggleList("exemptRoleIds", role.id)}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-[11px]",
                      form.exemptRoleIds.includes(role.id)
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border/70 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {role.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <div className="mt-4 flex justify-end">
        <Button size="sm" disabled={busy} onClick={() => void save()}>
          {busy ? (
            <Loader2 className="mr-1.5 size-3.5 animate-spin" />
          ) : (
            <Check className="mr-1.5 size-3.5" />
          )}
          Save AutoMod
        </Button>
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2">
      <div>
        <p className="text-xs font-medium">{label}</p>
        <p className="text-[11px] text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </div>
  );
}

export function AutoModEvents({ serverId }: { serverId: string }) {
  const events = useQuery(api.automod.recentEvents, {
    serverId: serverId as Id<"servers">,
  });

  return (
    <div className="mt-6 border-t border-border/60 pt-5">
      <h3 className="text-sm font-semibold">AutoMod activity</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Messages AutoMod stopped in this community. Nothing here was delivered.
      </p>
      <div className="mt-3 space-y-2">
        {events === undefined ? (
          <p className="text-sm text-muted-foreground">Loading activity…</p>
        ) : events.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No AutoMod catches yet.
          </p>
        ) : (
          events.map((event) => (
            <div
              key={event.id}
              className="rounded-lg border border-border/60 bg-surface px-3 py-2 text-xs"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">
                  {event.author?.name ?? "Unknown member"}
                  <span className="ml-1.5 font-normal text-muted-foreground">
                    in #{event.channelName}
                  </span>
                </span>
                <span className="text-muted-foreground">
                  {formatRelative(event.createdAt)}
                </span>
              </div>
              <p className="mt-1 truncate text-muted-foreground">
                “{event.excerpt}”
              </p>
              <span className="mt-1 inline-block rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive">
                {event.rule}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
