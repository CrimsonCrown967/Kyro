import { useState } from "react";
import { Link, useParams } from "react-router";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  BotAvatar,
  CopyValue,
  DeveloperShell,
  DeveloperLoading,
  DeveloperEmpty,
  DeveloperField,
  developerInput,
  developerPanel,
  developerSelect,
  readableDeveloperError,
} from "@/components/app/DeveloperShared";

export default function BotDirectory() {
  const { applicationId } = useParams();
  return (
    <DeveloperShell>
      {applicationId ? (
        <BotProfile applicationId={applicationId as Id<"botApplications">} />
      ) : (
        <Directory />
      )}
    </DeveloperShell>
  );
}

function Directory() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState<"popular" | "recent" | "featured">(
    "popular",
  );
  const apps = useQuery(api.botApplications.directory, {
    search,
    category: category || undefined,
    sort,
  });
  return (
    <>
      <p className="text-xs uppercase tracking-widest text-[#A5ACFF]">
        Made for your community
      </p>
      <h1 className="mt-3 text-4xl font-bold tracking-tight">
        Find your next bot.
      </h1>
      <p className="mt-4 max-w-xl text-[#A0A6B5]">
        Discover tools, games, and helpful companions built by Kyro developers.
      </p>
      <div className="my-8 grid gap-3 sm:grid-cols-[1fr_180px_180px]">
        <Input
          aria-label="Search bots"
          placeholder="Search bots"
          maxLength={100}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={developerInput}
        />
        <select
          aria-label="Category"
          className={developerSelect}
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">All categories</option>
          {[
            "general",
            "moderation",
            "music",
            "games",
            "productivity",
            "community",
            "utilities",
          ].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select
          aria-label="Sort bots"
          className={developerSelect}
          value={sort}
          onChange={(e) => setSort(e.target.value as typeof sort)}
        >
          <option value="popular">Popular</option>
          <option value="recent">Recently added</option>
          <option value="featured">Featured</option>
        </select>
      </div>
      {apps === undefined ? (
        <DeveloperLoading label="Finding bots" />
      ) : !apps.length ? (
        <DeveloperEmpty title="No bots found">
          Try another search or category. Owners choose when to list their bots
          here.
        </DeveloperEmpty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {apps.map((app) => (
            <article key={app.id} className={developerPanel}>
              <Link to={`/bots/${app.id}`} className="block">
                <BotAvatar name={app.name} url={app.iconUrl ?? app.avatarUrl} />
                <h2 className="mt-4 text-lg font-semibold">
                  {app.name}{" "}
                  {app.verified && (
                    <span className="text-xs text-[#A5ACFF]">Verified</span>
                  )}
                </h2>
                <p className="mt-2 line-clamp-3 min-h-16 text-sm text-[#A0A6B5]">
                  {app.botDescription || app.description}
                </p>
              </Link>
              <div className="mt-5 flex items-center justify-between gap-2">
                <span className="text-xs text-[#A0A6B5]">
                  {app.installationCount} servers
                </span>
                <Button asChild className="bg-[#5865F2] text-white">
                  <Link to={`/oauth2/authorize?client_id=${app.id}`}>
                    Add Bot
                  </Link>
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}

function BotProfile({
  applicationId,
}: {
  applicationId: Id<"botApplications">;
}) {
  const app = useQuery(api.botApplications.getPublic, { applicationId });
  const report = useMutation(api.botApplications.report);
  const { isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  if (app === undefined) return <DeveloperLoading />;
  if (!app)
    return (
      <DeveloperEmpty title="Bot unavailable">
        This bot is disabled or no longer available.
      </DeveloperEmpty>
    );
  return (
    <div className="mx-auto max-w-3xl">
      <Link to="/bots" className="text-sm text-[#A5ACFF]">
        Back to directory
      </Link>
      <article className={developerPanel + " mt-5"}>
        {app.bannerUrl && (
          <img
            src={app.bannerUrl}
            alt=""
            className="mb-6 h-48 w-full rounded-xl object-cover"
          />
        )}
        <div className="flex items-center gap-4">
          <BotAvatar
            name={app.username}
            url={app.avatarUrl}
            className="size-20"
          />
          <div>
            <h1 className="text-3xl font-bold">{app.name}</h1>
            <p className="mt-2 text-sm text-[#A0A6B5]">
              @{app.username} · {app.verified ? "Verified" : "Unverified"} ·{" "}
              {app.online ? "Online" : "Offline"}
            </p>
          </div>
        </div>
        <p className="my-6 whitespace-pre-wrap leading-7 text-[#A0A6B5]">
          {app.botDescription || app.description}
        </p>
        <p className="text-sm text-[#A0A6B5]">
          By {app.owner.name} · {app.installationCount} servers · Created{" "}
          {new Date(app.createdAt).toLocaleDateString()}
        </p>
        <div className="my-5 flex flex-wrap items-center gap-2 text-xs">
          <span>Bot ID: {app.botUserId}</span>
          <CopyValue value={app.botUserId} />
        </div>
        <div className="flex flex-wrap gap-3">
          <Button asChild className="bg-[#5865F2] text-white">
            <Link to={`/oauth2/authorize?client_id=${app.id}`}>Add Bot</Link>
          </Button>
          {isAuthenticated ? (
            <Button variant="outline" onClick={() => setOpen(true)}>
              Report bot
            </Button>
          ) : (
            <Link
              to={`/auth?returnTo=${encodeURIComponent(`/bots/${app.id}`)}`}
              className="p-2 text-sm text-[#A0A6B5]"
            >
              Sign in to report
            </Link>
          )}
        </div>
      </article>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report {app.name}</DialogTitle>
            <DialogDescription>
              Tell Kyro staff what happened. Include relevant details without
              passwords or tokens.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setBusy(true);
              void report({ applicationId, reason })
                .then(() => {
                  setOpen(false);
                  setReason("");
                  toast.success("Report sent to Kyro staff.");
                })
                .catch((e) => toast.error(readableDeveloperError(e)))
                .finally(() => setBusy(false));
            }}
          >
            <DeveloperField label="Reason">
              <Textarea
                minLength={10}
                maxLength={2000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
              />
            </DeveloperField>
            <DialogFooter className="mt-4">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                Submit report
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
