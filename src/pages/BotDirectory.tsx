import { useState } from "react";
import { useNow } from "@/hooks/use-now";
import { Link, useNavigate, useParams } from "react-router";
import { useMutation, useQuery } from "convex/react";
import { Bot, ArrowLeft, Search, ShieldCheck } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { BOT_CATEGORIES } from "@/lib/botContract";
import {
  BotLoading,
  BotPanel,
  PermissionPicker,
  useBotTask,
} from "@/components/app/BotPlatformShared";

export default function BotDirectory() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState("featured");
  const bots = useQuery(api.botApplications.directory, {
    search,
    category,
    sort,
  });
  const { applicationId } = useParams();
  if (applicationId)
    return (
      <BotProfile applicationId={applicationId as Id<"botApplications">} />
    );
  return (
    <div className="h-full overflow-y-auto bg-[#111318] text-white">
      <div className="mx-auto max-w-5xl space-y-7 p-4 pb-24 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[.2em] text-indigo-300">
              Made for your community
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              Find your next helpful bot.
            </h1>
            <p className="mt-2 text-sm text-[#A0A6B5]">
              Tools, games, and ideas built by the Kyro community.
            </p>
          </div>
          <Button asChild>
            <Link to="/dashboard/developers">Build a bot</Link>
          </Button>
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="relative min-w-48 flex-1">
            <Search className="absolute left-3 top-3 size-4 text-[#A0A6B5]" />
            <Input
              aria-label="Search bots"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search bots"
              className="pl-9"
              maxLength={100}
            />
          </div>
          <select
            aria-label="Bot category"
            className="rounded-md border border-white/10 bg-[#1B1E27] px-3"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">All categories</option>
            {BOT_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <select
            aria-label="Sort bots"
            className="rounded-md border border-white/10 bg-[#1B1E27] px-3"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="featured">Featured</option>
            <option value="popular">Popular</option>
            <option value="recent">Recently added</option>
          </select>
        </div>
        {bots === undefined ? (
          <BotLoading />
        ) : bots.length === 0 ? (
          <BotPanel
            title="No bots found"
            description="Try another search, or publish a bot from your developer portal."
          >
            <Link
              to="/dashboard/developers"
              className="text-sm text-indigo-300"
            >
              Create an application
            </Link>
          </BotPanel>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {bots.map((bot) => (
              <article
                key={bot.id}
                className="flex flex-col rounded-xl border border-white/10 bg-[#1B1E27] p-5"
              >
                <div className="mb-4 flex items-center gap-3">
                  {bot.avatarUrl ? (
                    <img
                      src={bot.avatarUrl}
                      alt=""
                      className="size-12 rounded-xl object-cover"
                    />
                  ) : (
                    <Bot className="size-10 text-indigo-300" />
                  )}
                  <div>
                    <Link
                      to={`/dashboard/bots/${bot.id}`}
                      className="font-semibold"
                    >
                      {bot.name}
                    </Link>
                    {bot.verified && (
                      <ShieldCheck
                        className="ml-1 inline size-4 text-indigo-300"
                        aria-label="Verified bot"
                      />
                    )}
                    <p className="text-xs text-[#A0A6B5]">
                      {bot.category}
                      {bot.featured ? " · Featured" : ""}
                    </p>
                  </div>
                </div>
                <p className="mb-5 line-clamp-3 flex-1 text-sm text-[#A0A6B5]">
                  {bot.description}
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#A0A6B5]">
                    {bot.serverCount} servers
                  </span>
                  <Button asChild size="sm">
                    <Link to={`/dashboard/bots/authorize/${bot.id}`}>
                      Add bot
                    </Link>
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
function BotProfile({
  applicationId,
}: {
  applicationId: Id<"botApplications">;
}) {
  const bot = useQuery(api.botApplications.profile, { applicationId });
  const now = useNow();
  const me = useQuery(api.users.me);
  const report = useMutation(api.botApplications.report);
  const moderate = useMutation(api.botApplications.moderate);
  const task = useBotTask();
  const [reportOpen, setReportOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [adminOpen, setAdminOpen] = useState(false);
  const [verified, setVerified] = useState(false);
  const [featured, setFeatured] = useState(false);
  const [suspended, setSuspended] = useState(false);
  if (bot === undefined) return <BotLoading />;
  if (!bot)
    return (
      <div className="p-8">
        This bot is unavailable.{" "}
        <Link className="underline" to="/dashboard/bots">
          Browse bots
        </Link>
      </div>
    );
  return (
    <div className="h-full overflow-y-auto bg-[#111318] p-4 pb-24 text-white sm:p-8">
      <div className="mx-auto max-w-3xl space-y-5">
        <Link
          className="inline-flex items-center gap-2 text-sm text-[#A0A6B5]"
          to="/dashboard/bots"
        >
          <ArrowLeft className="size-4" />
          All bots
        </Link>
        {bot.bannerUrl && (
          <img
            src={bot.bannerUrl}
            alt=""
            className="h-48 w-full rounded-xl object-cover"
          />
        )}
        <BotPanel title={bot.name} description={bot.description}>
          <div className="flex items-center gap-4">
            {bot.avatarUrl ? (
              <img
                src={bot.avatarUrl}
                alt=""
                className="size-20 rounded-xl object-cover"
              />
            ) : (
              <Bot className="size-16 text-indigo-300" />
            )}
            <div>
              <p>
                @{bot.username} ·{" "}
                {bot.verified ? "Verified bot" : "Unverified bot"}
              </p>
              <p className="mt-1 text-sm text-[#A0A6B5]">
                {bot.enabled &&
                !bot.suspended &&
                bot.lastActiveAt &&
                (now === 0 ? bot.online : bot.lastActiveAt > now - 90_000)
                  ? "Online"
                  : "Offline"}{" "}
                · {bot.serverCount} servers
              </p>
              <p className="mt-1 text-sm text-[#A0A6B5]">
                By {bot.owner.name}
                {bot.owner.username ? ` (@${bot.owner.username})` : ""}
              </p>
            </div>
          </div>
          <p className="whitespace-pre-wrap text-sm">{bot.botDescription}</p>
          <p className="break-all font-mono text-xs text-[#A0A6B5]">
            Bot ID: {bot.botId}
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link to={`/dashboard/bots/authorize/${bot.id}`}>
                Add to server
              </Link>
            </Button>
            <Button variant="outline" onClick={() => setReportOpen(true)}>
              Report bot
            </Button>
            {me?.isPlatformAdmin && (
              <Button
                variant="outline"
                onClick={() => {
                  setVerified(bot.verified);
                  setFeatured(bot.featured);
                  setAdminOpen(true);
                }}
              >
                Platform moderation
              </Button>
            )}
          </div>
        </BotPanel>
      </div>
      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report {bot.name}</DialogTitle>
            <DialogDescription>
              Describe the abuse. Kyro staff will review your report.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            aria-label="Report reason"
            minLength={10}
            maxLength={1000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <Button
            disabled={task.busy || reason.trim().length < 10}
            onClick={() =>
              void task.run(async () => {
                await report({ applicationId, reason });
                setReportOpen(false);
              }, "Report submitted")
            }
          >
            Submit report
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog open={adminOpen} onOpenChange={setAdminOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Platform moderation</DialogTitle>
            <DialogDescription>
              These controls require a Kyro platform administrator.
            </DialogDescription>
          </DialogHeader>
          {[
            ["Verified", verified, setVerified],
            ["Featured", featured, setFeatured],
            ["Suspended", suspended, setSuspended],
          ].map(([label, checked, set]) => (
            <label key={String(label)} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={Boolean(checked)}
                onChange={(e) =>
                  (set as (v: boolean) => void)(e.target.checked)
                }
              />
              {String(label)}
            </label>
          ))}
          <Textarea
            aria-label="Moderation reason"
            value={reason}
            maxLength={300}
            onChange={(e) => setReason(e.target.value)}
          />
          <Button
            disabled={task.busy}
            onClick={() =>
              void task.run(async () => {
                await moderate({
                  applicationId,
                  suspended,
                  verified,
                  featured,
                  reason,
                });
                setAdminOpen(false);
              }, "Bot moderation updated")
            }
          >
            Apply moderation
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
export function BotAuthorization() {
  const { applicationId } = useParams();
  const app = useQuery(
    api.botApplications.profile,
    applicationId
      ? { applicationId: applicationId as Id<"botApplications"> }
      : "skip",
  );
  const servers = useQuery(api.botApplications.installableServers);
  const [serverId, setServerId] = useState("");
  const [selected, setSelected] = useState<string[] | null>(null);
  const install = useMutation(api.botApplications.install);
  const task = useBotTask();
  const navigate = useNavigate();
  if (app === undefined || servers === undefined) return <BotLoading />;
  if (!app) return <div className="p-8">This bot is unavailable.</div>;
  const permissions = selected ?? app.permissions;
  return (
    <div className="h-full overflow-y-auto bg-[#111318] p-4 pb-24 text-white sm:p-8">
      <div className="mx-auto max-w-2xl">
        <BotPanel
          title={`Add ${app.name} to your server`}
          description={`Created by ${app.owner.name}. Review the permissions before authorizing this bot.`}
        >
          <p className="text-sm text-[#A0A6B5]">
            The bot runs on its developer's infrastructure. Its grant applies
            only to the server you select and is always limited by that server's
            channel permissions.
          </p>
          {servers.length ? (
            <label className="block space-y-2 text-sm">
              <span>Server</span>
              <select
                aria-label="Server"
                className="w-full rounded-lg border border-white/10 bg-[#111318] p-3"
                value={serverId}
                onChange={(e) => setServerId(e.target.value)}
              >
                <option value="">Select a server you manage</option>
                {servers.map((server) => (
                  <option key={server.id} value={server.id}>
                    {server.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="text-sm">
              You need Manage Community permission in a server to install bots.
            </p>
          )}
          <PermissionPicker value={permissions} onChange={setSelected} />
          <div className="flex gap-3">
            <Button variant="outline" asChild>
              <Link to="/dashboard/bots">Cancel</Link>
            </Button>
            <Button
              disabled={!serverId || task.busy}
              onClick={() =>
                void task.run(async () => {
                  await install({
                    applicationId: app.id,
                    serverId: serverId as Id<"servers">,
                    permissions,
                  });
                  navigate(`/dashboard/s/${serverId}`);
                }, "Bot installed")
              }
            >
              Authorize bot
            </Button>
          </div>
        </BotPanel>
      </div>
    </div>
  );
}
