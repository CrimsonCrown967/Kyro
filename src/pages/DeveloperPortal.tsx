import { type ReactNode, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  Link,
  Navigate,
  Route,
  Routes,
  useNavigate,
  useParams,
} from "react-router";
import type { FunctionReturnType } from "convex/server";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Bot,
  BookOpen,
  Code,
  Lock as Key,
  Loader2,
  Plus,
  Settings,
  ShieldCheck,
  Trash2,
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useUploadFile } from "@/lib/upload";
import { cn } from "@/lib/utils";
import {
  BotAvatar,
  CopyValue,
  createBrowserBotToken,
  DeveloperEmpty,
  DeveloperField,
  DeveloperLoading,
  DeveloperShell,
  developerInput,
  developerPanel,
  developerSelect,
  PermissionPicker,
  readableDeveloperError,
} from "@/components/app/DeveloperShared";
import {
  DeveloperCommands,
  DeveloperEvents,
} from "@/components/app/DeveloperAdvanced";
import { BotApiDocs } from "@/components/app/BotApiDocs";

type Application = FunctionReturnType<typeof api.botApplications.list>[number];
const sections = [
  { id: "overview", label: "Overview", icon: Bot },
  { id: "general", label: "General Information", icon: Settings },
  { id: "bot", label: "Bot Configuration", icon: Bot },
  { id: "authorization", label: "OAuth2 & Authorization", icon: ShieldCheck },
  { id: "token", label: "Bot Token", icon: Key },
  { id: "installation", label: "Installation", icon: Plus },
  { id: "permissions", label: "Permissions", icon: ShieldCheck },
  { id: "commands", label: "Slash Commands", icon: Code },
  { id: "events", label: "Webhooks & Events", icon: Code },
  { id: "docs", label: "API Documentation", icon: BookOpen },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "audit", label: "Audit Logs", icon: BookOpen },
] as const;

export default function DeveloperPortal() {
  return (
    <DeveloperShell>
      <Routes>
        <Route index element={<ApplicationList />} />
        <Route
          path="applications/:applicationId/:section?"
          element={<ApplicationDetail />}
        />
        <Route path="docs" element={<BotApiDocs />} />
        <Route path="*" element={<Navigate to="/developers" replace />} />
      </Routes>
    </DeveloperShell>
  );
}

function ApplicationList() {
  const applications = useQuery(api.botApplications.list, {});
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState("");
  const filtered = applications?.filter((application) =>
    application.name.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#A5ACFF]">
            Build with Kyro
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            Your applications
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-[#A0A6B5]">
            Create a bot, connect your code, and bring something new to your
            communities.
          </p>
        </div>
        <Button
          onClick={() => setCreateOpen(true)}
          className="bg-[#5865F2] text-white hover:bg-[#4752C4]"
        >
          <Plus className="mr-2 size-4" />
          New application
        </Button>
      </div>
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        {[
          {
            icon: Bot,
            title: "Give your bot an identity",
            text: "One application, one bot. Your name, profile, and permissions.",
          },
          {
            icon: Code,
            title: "Connect your code",
            text: "Use the TypeScript SDK from your own Node.js server.",
          },
          {
            icon: ShieldCheck,
            title: "Invite it to a community",
            text: "Server admins review and control every permission.",
          },
        ].map((item) => (
          <div
            key={item.title}
            className="rounded-xl border border-white/10 bg-gradient-to-br from-[#1B1E27] to-[#111318] p-5"
          >
            <item.icon className="mb-3 size-5 text-[#A5ACFF]" />
            <h2 className="text-sm font-medium">{item.title}</h2>
            <p className="mt-2 text-xs leading-5 text-[#A0A6B5]">{item.text}</p>
          </div>
        ))}
      </div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[#A0A6B5]">
          {applications === undefined
            ? "Your applications"
            : applications.length + " applications"}
        </p>
        <Input
          aria-label="Search your applications"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search applications…"
          className={cn(developerInput, "max-w-xs")}
        />
      </div>
      {filtered === undefined ? (
        <DeveloperLoading />
      ) : filtered.length === 0 ? (
        <DeveloperEmpty
          title={
            search ? "No matching applications" : "Your first bot starts here"
          }
        >
          {search ? (
            "Try another name."
          ) : (
            <>
              <p>
                Create an application to set up your bot identity, token,
                commands, and installation link.
              </p>
              <Button
                className="mt-5 bg-[#5865F2] text-white hover:bg-[#4752C4]"
                onClick={() => setCreateOpen(true)}
              >
                Create application
              </Button>
            </>
          )}
        </DeveloperEmpty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((application) => (
            <Link
              key={application.id}
              to={"/developers/applications/" + application.id + "/overview"}
              className="group rounded-2xl border border-white/10 bg-[#1B1E27] p-5 transition-all hover:-translate-y-0.5 hover:border-[#5865F2]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5865F2]"
            >
              <div className="flex items-start justify-between">
                <BotAvatar
                  name={application.name}
                  url={application.iconUrl ?? application.avatarUrl}
                />
                <Status application={application} />
              </div>
              <h2 className="mt-4 truncate text-lg font-semibold">
                {application.name}
              </h2>
              <p className="mt-1 line-clamp-2 min-h-10 text-sm text-[#A0A6B5]">
                {application.description ||
                  "Add a description to your application."}
              </p>
              <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-4 text-xs text-[#A0A6B5]">
                <span>{application.installationCount} servers</span>
                <span className="flex items-center gap-1 text-[#A5ACFF]">
                  Manage <ArrowRight className="size-3.5" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
      <CreateApplication open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}

function CreateApplication({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const create = useMutation(api.botApplications.create);
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ id: string; token: string } | null>(
    null,
  );
  const close = () => {
    if (busy) return;
    if (created)
      navigate("/developers/applications/" + created.id + "/overview");
    setCreated(null);
    onOpenChange(false);
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogContent className="border-white/10 bg-[#1B1E27] text-white sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {created ? "Your bot is ready to connect" : "Create an application"}
          </DialogTitle>
          <DialogDescription className="text-[#A0A6B5]">
            {created
              ? "Save this token securely. It is displayed once and cannot be retrieved later."
              : "Each application has its own bot identity. You can customize its images and settings next."}
          </DialogDescription>
        </DialogHeader>
        {created ? (
          <>
            <TokenReveal token={created.token} />
            <DialogFooter>
              <Button onClick={close} className="bg-[#5865F2] text-white">
                I saved my token
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (busy) return;
              setBusy(true);
              void (async () => {
                try {
                  const { token, tokenHash } = await createBrowserBotToken();
                  const id = await create({
                    name: name.trim(),
                    username: username.trim().toLowerCase(),
                    description: description.trim(),
                    tokenHash,
                  });
                  setCreated({ id, token });
                  setName("");
                  setUsername("");
                  setDescription("");
                  toast.success("Application created.");
                } catch (error) {
                  toast.error(readableDeveloperError(error));
                } finally {
                  setBusy(false);
                }
              })();
            }}
          >
            <DeveloperField label="Application name">
              <Input
                className={developerInput}
                value={name}
                onChange={(event) => setName(event.target.value)}
                minLength={2}
                maxLength={64}
                required
                autoFocus
                placeholder="My community bot"
              />
            </DeveloperField>
            <DeveloperField
              label="Bot username"
              hint="A unique handle, using lowercase letters, numbers, and underscores."
            >
              <Input
                className={developerInput}
                value={username}
                onChange={(event) =>
                  setUsername(event.target.value.toLowerCase())
                }
                minLength={3}
                maxLength={32}
                pattern="[a-z0-9_]+"
                required
                placeholder="my_community_bot"
              />
            </DeveloperField>
            <DeveloperField label="Application description">
              <Textarea
                className={developerInput}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={1000}
                rows={3}
                placeholder="What will your bot do?"
              />
            </DeveloperField>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={close}>
                Cancel
              </Button>
              <Button
                disabled={busy}
                type="submit"
                className="bg-[#5865F2] text-white"
              >
                {busy && <Loader2 className="mr-2 size-4 animate-spin" />}Create
                application
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ApplicationDetail() {
  const { applicationId, section = "overview" } = useParams();
  const application = useQuery(api.botApplications.get, {
    applicationId: applicationId as Id<"botApplications">,
  });
  if (application === undefined)
    return <DeveloperLoading label="Loading application" />;
  if (!application)
    return (
      <DeveloperEmpty title="Application unavailable">
        This application does not exist or is not owned by your account.
        <Link className="mt-3 block text-[#A5ACFF]" to="/developers">
          Back to applications
        </Link>
      </DeveloperEmpty>
    );
  const active = sections.find((entry) => entry.id === section) ?? sections[0];
  return (
    <>
      <Link
        to="/developers"
        className="mb-6 inline-flex items-center gap-2 text-sm text-[#A0A6B5] hover:text-white"
      >
        <ArrowLeft className="size-4" />
        All applications
      </Link>
      <div className="flex flex-col gap-8 lg:flex-row">
        <aside className="shrink-0 lg:w-56">
          <div className="mb-5 flex items-center gap-3">
            <BotAvatar
              name={application.name}
              url={application.iconUrl ?? application.avatarUrl}
              className="size-11 rounded-xl"
            />
            <div className="min-w-0">
              <p className="truncate font-semibold">{application.name}</p>
              <Status application={application} />
            </div>
          </div>
          <nav
            aria-label="Application settings"
            className="flex gap-1 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible"
          >
            {sections.map((entry) => (
              <Link
                key={entry.id}
                to={
                  "/developers/applications/" + application.id + "/" + entry.id
                }
                className={cn(
                  "flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition-colors",
                  active.id === entry.id
                    ? "bg-[#5865F2]/15 text-[#B8BEFF]"
                    : "text-[#A0A6B5] hover:bg-white/5 hover:text-white",
                )}
              >
                <entry.icon className="size-4" />
                {entry.label}
              </Link>
            ))}
          </nav>
        </aside>
        <div className="min-w-0 flex-1">
          <div className="mb-6">
            <p className="mb-1 text-xs uppercase tracking-widest text-[#A0A6B5]">
              {application.name}
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">
              {active.label}
            </h1>
          </div>
          {application.suspended && (
            <div
              role="alert"
              className="mb-5 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200"
            >
              This application is suspended. Tokens, installations, and event
              delivery are disabled. Contact Kyro support for a review.
            </div>
          )}
          <ApplicationSection
            key={application.id + active.id}
            application={application}
            section={active.id}
          />
        </div>
      </div>
    </>
  );
}

function ApplicationSection({
  application,
  section,
}: {
  application: Application;
  section: string;
}) {
  if (section === "general")
    return <GeneralInformation application={application} />;
  if (section === "bot") return <BotConfiguration application={application} />;
  if (section === "token") return <TokenSettings application={application} />;
  if (section === "permissions")
    return <DefaultPermissions application={application} />;
  if (section === "authorization" || section === "installation")
    return (
      <InstallationSettings
        application={application}
        authorization={section === "authorization"}
      />
    );
  if (section === "commands")
    return <DeveloperCommands applicationId={application.id} />;
  if (section === "events")
    return <DeveloperEvents application={application} />;
  if (section === "analytics")
    return <ApplicationAnalytics applicationId={application.id} />;
  if (section === "audit")
    return <ApplicationAudit applicationId={application.id} />;
  if (section === "docs") return <BotApiDocs />;
  return (
    <div className="space-y-5">
      <section className={developerPanel}>
        {application.bannerUrl && (
          <img
            src={application.bannerUrl}
            alt="Application banner"
            className="mb-5 h-36 w-full rounded-xl object-cover"
          />
        )}
        <div className="flex flex-wrap items-center gap-4">
          <BotAvatar
            name={application.username}
            url={application.avatarUrl}
            className="size-20"
          />
          <div>
            <h2 className="flex items-center gap-2 text-xl font-semibold">
              {application.username}
              <span className="rounded bg-[#5865F2] px-1.5 py-0.5 text-[10px] tracking-wide text-white">
                BOT
              </span>
            </h2>
            <p className="mt-2 text-sm text-[#A0A6B5]">
              {application.verified ? "Verified bot" : "Unverified bot"} ·{" "}
              {application.online ? "Online" : "Offline"}
            </p>
            <p className="mt-1 text-xs text-[#A0A6B5]">
              Owned by {application.owner.name}
            </p>
          </div>
        </div>
        <p className="mt-5 whitespace-pre-wrap text-sm leading-6 text-[#A0A6B5]">
          {application.botDescription ||
            application.description ||
            "Add a description in Bot Configuration."}
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-white/10 pt-4">
          <span className="text-xs text-[#A0A6B5]">Bot ID</span>
          <code className="break-all text-xs">{application.botUserId}</code>
          <CopyValue value={application.botUserId} label="Copy ID" />
        </div>
      </section>
      <ApplicationAnalytics applicationId={application.id} />
      <div className="grid gap-4 sm:grid-cols-2">
        {[
          {
            id: "token",
            title: "Connect your bot",
            text: "Create a token and run your first SDK example.",
          },
          {
            id: "installation",
            title: "Invite your bot",
            text: "Share an installation link with server admins.",
          },
        ].map((item) => (
          <Link
            key={item.id}
            to={"/developers/applications/" + application.id + "/" + item.id}
            className={
              developerPanel + " transition-colors hover:border-[#5865F2]/60"
            }
          >
            <h3 className="font-medium">{item.title}</h3>
            <p className="mt-2 text-sm text-[#A0A6B5]">{item.text}</p>
            <ArrowRight className="mt-4 size-4 text-[#A5ACFF]" />
          </Link>
        ))}
      </div>
      <p className="text-xs text-[#A0A6B5]">
        Created {new Date(application.createdAt).toLocaleDateString()} · Last
        updated {new Date(application.updatedAt).toLocaleDateString()}
      </p>
    </div>
  );
}

function Status({
  application,
}: {
  application: Pick<Application, "enabled" | "suspended">;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-medium",
        application.suspended
          ? "bg-red-500/10 text-red-300"
          : application.enabled
            ? "bg-emerald-500/10 text-emerald-300"
            : "bg-white/5 text-[#A0A6B5]",
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {application.suspended
        ? "Suspended"
        : application.enabled
          ? "Enabled"
          : "Disabled"}
    </span>
  );
}

function SaveButton({
  busy,
  children = "Save changes",
}: {
  busy: boolean;
  children?: ReactNode;
}) {
  return (
    <Button
      type="submit"
      disabled={busy}
      className="bg-[#5865F2] text-white hover:bg-[#4752C4]"
    >
      {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
      {children}
    </Button>
  );
}

function GeneralInformation({ application }: { application: Application }) {
  const update = useMutation(api.botApplications.update);
  const remove = useMutation(api.botApplications.remove);
  const upload = useUploadFile({ requireRegistration: true });
  const navigate = useNavigate();
  const [name, setName] = useState(application.name);
  const [description, setDescription] = useState(application.description);
  const [busy, setBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const save = async (action: () => Promise<unknown>, message: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      toast.success(message);
    } catch (error) {
      toast.error(readableDeveloperError(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-6">
      <form
        className={developerPanel + " space-y-5"}
        onSubmit={(event) => {
          event.preventDefault();
          void save(
            () =>
              update({
                applicationId: application.id,
                name: name.trim(),
                description: description.trim(),
              }),
            "Application updated.",
          );
        }}
      >
        <DeveloperField label="Application name">
          <Input
            className={developerInput}
            required
            minLength={2}
            maxLength={64}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </DeveloperField>
        <DeveloperField
          label="Description"
          hint="Tell developers and server admins what your application does."
        >
          <Textarea
            className={developerInput}
            rows={4}
            maxLength={1000}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </DeveloperField>
        <div className="grid gap-5 sm:grid-cols-2">
          {(
            [
              {
                label: "Application icon",
                key: "iconStorageId",
                url: application.iconUrl,
              },
              {
                label: "Application banner",
                key: "bannerStorageId",
                url: application.bannerUrl,
              },
            ] as const
          ).map((field) => (
            <DeveloperField
              key={field.key}
              label={field.label}
              hint="PNG, JPEG, WebP, or GIF. Up to 10 MB."
            >
              {field.url && (
                <img
                  src={field.url}
                  alt={field.label}
                  className={
                    field.key === "iconStorageId"
                      ? "size-20 rounded-xl object-cover"
                      : "h-20 w-full rounded-xl object-cover"
                  }
                />
              )}
              <Input
                className={developerInput}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                disabled={busy}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file)
                    void save(async () => {
                      const uploaded = await upload(file);
                      await update({
                        applicationId: application.id,
                        [field.key]: uploaded.storageId,
                      });
                    }, field.label + " updated.");
                }}
              />
            </DeveloperField>
          ))}
        </div>
        <div className="flex items-center gap-3 border-t border-white/10 pt-5">
          <SaveButton busy={busy} />
          <span className="text-xs text-[#A0A6B5]">
            Changes apply immediately.
          </span>
        </div>
      </form>
      <section className="rounded-2xl border border-red-500/25 p-5">
        <h2 className="text-sm font-semibold text-red-200">
          Delete application
        </h2>
        <p className="mt-2 text-sm leading-6 text-[#A0A6B5]">
          Deleting an application revokes its token and removes its bot from
          every server. This cannot be undone.
        </p>
        <Button
          type="button"
          variant="destructive"
          className="mt-4"
          onClick={() => setDeleteOpen(true)}
        >
          <Trash2 className="mr-2 size-4" />
          Delete application
        </Button>
      </section>
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {application.name}?</DialogTitle>
            <DialogDescription>
              The bot will stop working and all installations will be removed.
              Type the application name to confirm.
            </DialogDescription>
          </DialogHeader>
          <Input
            aria-label="Application name confirmation"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            autoComplete="off"
            placeholder={application.name}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busy || confirmation !== application.name}
              onClick={() =>
                void save(async () => {
                  await remove({ applicationId: application.id, confirmation });
                  navigate("/developers");
                }, "Application deleted.")
              }
            >
              Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BotConfiguration({ application }: { application: Application }) {
  const update = useMutation(api.botApplications.update);
  const upload = useUploadFile({ requireRegistration: true });
  const [username, setUsername] = useState(application.username);
  const [description, setDescription] = useState(application.botDescription);
  const [enabled, setEnabled] = useState(application.enabled);
  const [discoverable, setDiscoverable] = useState(application.discoverable);
  const [category, setCategory] = useState(application.category);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className={developerPanel + " space-y-5"}
      onSubmit={(event) => {
        event.preventDefault();
        setBusy(true);
        void update({
          applicationId: application.id,
          username,
          botDescription: description,
          enabled,
          discoverable,
          category,
        })
          .then(() => toast.success("Bot configuration updated."))
          .catch((error) => toast.error(readableDeveloperError(error)))
          .finally(() => setBusy(false));
      }}
    >
      <div className="flex items-center gap-4">
        <BotAvatar
          name={username}
          url={application.avatarUrl}
          className="size-20"
        />
        <DeveloperField label="Bot avatar">
          <Input
            className={developerInput}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              setBusy(true);
              void upload(file)
                .then((uploaded) =>
                  update({
                    applicationId: application.id,
                    avatarStorageId: uploaded.storageId,
                  }),
                )
                .then(() => toast.success("Bot avatar updated."))
                .catch((error) => toast.error(readableDeveloperError(error)))
                .finally(() => setBusy(false));
            }}
          />
        </DeveloperField>
      </div>
      <DeveloperField label="Bot username">
        <Input
          className={developerInput}
          value={username}
          onChange={(event) => setUsername(event.target.value.toLowerCase())}
          required
          minLength={3}
          maxLength={32}
          pattern="[a-z0-9_]+"
        />
      </DeveloperField>
      <DeveloperField label="Bot description">
        <Textarea
          className={developerInput}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          maxLength={1000}
          rows={4}
        />
      </DeveloperField>
      <DeveloperField label="Directory category">
        <select
          className={developerSelect}
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        >
          {[
            "general",
            "moderation",
            "music",
            "games",
            "utilities",
            "community",
            "productivity",
          ].map((value) => (
            <option value={value} key={value}>
              {value[0].toUpperCase() + value.slice(1)}
            </option>
          ))}
        </select>
      </DeveloperField>
      <div className="space-y-4 border-y border-white/10 py-5">
        <label className="flex items-center justify-between gap-4">
          <span>
            <span className="block text-sm font-medium">Enable bot</span>
            <span className="mt-1 block text-xs text-[#A0A6B5]">
              Disabling immediately blocks API access and new installations.
            </span>
          </span>
          <Switch
            checked={enabled}
            onCheckedChange={setEnabled}
            aria-label="Enable bot"
            disabled={application.suspended}
          />
        </label>
        <label className="flex items-center justify-between gap-4">
          <span>
            <span className="block text-sm font-medium">
              Publicly discoverable
            </span>
            <span className="mt-1 block text-xs text-[#A0A6B5]">
              List your bot in the Kyro Bot Directory.
            </span>
          </span>
          <Switch
            checked={discoverable}
            onCheckedChange={setDiscoverable}
            aria-label="Make bot publicly discoverable"
          />
        </label>
      </div>
      <p className="text-xs text-[#A0A6B5]">
        Verification: {application.verified ? "Verified by Kyro" : "Unverified"}
        . Verification is managed by Kyro staff.
      </p>
      <SaveButton busy={busy} />
    </form>
  );
}

function TokenReveal({ token }: { token: string }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium">
        Bot token
        <input
          className="mt-2 w-full rounded-lg border border-white/15 bg-[#111318] p-3 font-mono text-xs text-white"
          type={revealed ? "text" : "password"}
          value={token}
          readOnly
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      <div className="flex gap-2">
        <CopyValue value={token} label="Copy token" />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setRevealed(!revealed)}
        >
          {revealed ? "Hide" : "Reveal"}
        </Button>
      </div>
      <p className="text-xs leading-5 text-[#A0A6B5]">
        Keep this token in your bot host's secret environment variables. Anyone
        with it can act as your bot. Kyro stores only its hash.
      </p>
    </div>
  );
}

function TokenSettings({ application }: { application: Application }) {
  const rotate = useMutation(api.botApplications.rotateToken);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <section className={developerPanel}>
      <Key className="mb-4 size-7 text-[#A5ACFF]" />
      <h2 className="font-semibold">Authenticate your bot</h2>
      <p className="mt-2 text-sm leading-6 text-[#A0A6B5]">
        Use your token with the Kyro API or TypeScript SDK. Tokens are shown
        once when created. Regenerating a token immediately revokes the previous
        token.
      </p>
      <dl className="my-6 grid gap-3 text-sm">
        <div className="flex justify-between">
          <dt className="text-[#A0A6B5]">Token status</dt>
          <dd>{application.hasToken ? "Active" : "No active token"}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-[#A0A6B5]">Last regenerated</dt>
          <dd>
            {application.tokenUpdatedAt
              ? new Date(application.tokenUpdatedAt).toLocaleString()
              : "Never"}
          </dd>
        </div>
      </dl>
      <Button
        className="bg-[#5865F2] text-white"
        onClick={() => setConfirmOpen(true)}
        disabled={application.suspended}
      >
        Regenerate token
      </Button>
      <Dialog
        open={confirmOpen}
        onOpenChange={(next) => {
          if (!busy) setConfirmOpen(next);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Regenerate bot token?</DialogTitle>
            <DialogDescription>
              The current token stops working immediately. Update the
              environment variable on your bot host and restart your bot with
              the new token.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void (async () => {
                  try {
                    const next = await createBrowserBotToken();
                    await rotate({
                      applicationId: application.id,
                      tokenHash: next.tokenHash,
                    });
                    setToken(next.token);
                    setConfirmOpen(false);
                    toast.success("Previous token revoked.");
                  } catch (error) {
                    toast.error(readableDeveloperError(error));
                  } finally {
                    setBusy(false);
                  }
                })();
              }}
            >
              {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
              Regenerate token
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={token !== null}
        onOpenChange={(next) => {
          if (!next) setToken(null);
        }}
      >
        <DialogContent className="border-white/10 bg-[#1B1E27] text-white">
          <DialogHeader>
            <DialogTitle>Save your new token</DialogTitle>
            <DialogDescription className="text-[#A0A6B5]">
              This is the only time you can see it.
            </DialogDescription>
          </DialogHeader>
          {token && <TokenReveal token={token} />}
          <DialogFooter>
            <Button onClick={() => setToken(null)}>I saved my token</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function DefaultPermissions({ application }: { application: Application }) {
  const update = useMutation(api.botApplications.update);
  const [permissions, setPermissions] = useState(
    application.defaultPermissions,
  );
  const [busy, setBusy] = useState(false);
  return (
    <form
      className={developerPanel + " space-y-5"}
      onSubmit={(event) => {
        event.preventDefault();
        setBusy(true);
        void update({
          applicationId: application.id,
          defaultPermissions: permissions,
        })
          .then(() => toast.success("Default permissions updated."))
          .catch((error) => toast.error(readableDeveloperError(error)))
          .finally(() => setBusy(false));
      }}
    >
      <p className="text-sm leading-6 text-[#A0A6B5]">
        Choose the permissions requested during installation. Server admins can
        reduce these permissions and change them later. Existing installations
        keep their approved permissions.
      </p>
      <PermissionPicker value={permissions} onChange={setPermissions} />
      <SaveButton busy={busy}>Save default permissions</SaveButton>
    </form>
  );
}

function InstallationSettings({
  application,
  authorization,
}: {
  application: Application;
  authorization: boolean;
}) {
  const link =
    window.location.origin +
    "/oauth2/authorize?client_id=" +
    encodeURIComponent(application.id);
  return (
    <div className="space-y-5">
      <section className={developerPanel}>
        <h2 className="font-semibold">
          {authorization ? "Server authorization" : "Invite your bot"}
        </h2>
        <p className="mt-2 text-sm leading-6 text-[#A0A6B5]">
          A server administrator reviews your bot's profile and requested
          permissions before installing it. This link opens Kyro's authorization
          screen.
        </p>
        <DeveloperField label="Installation URL">
          <div className="mt-5 flex flex-wrap gap-2">
            <Input
              className={cn(developerInput, "min-w-0 flex-1 font-mono text-xs")}
              readOnly
              value={link}
            />
            <CopyValue value={link} label="Copy link" />
          </div>
        </DeveloperField>
        <Button asChild className="mt-5 bg-[#5865F2] text-white">
          <Link to={"/oauth2/authorize?client_id=" + application.id}>
            Install to a server <ArrowRight className="ml-2 size-4" />
          </Link>
        </Button>
      </section>
      <section className={developerPanel}>
        <h2 className="font-semibold">Application identity</h2>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <code className="break-all rounded-lg bg-[#111318] p-3 text-xs">
            {application.id}
          </code>
          <CopyValue value={application.id} label="Copy client ID" />
        </div>
        <p className="mt-4 text-sm leading-6 text-[#A0A6B5]">
          Scope:{" "}
          <code className="text-[#B8BEFF]">bot applications.commands</code>.
          Installation grants access to the selected server. Bot tokens do not
          authenticate human users. General third-party OAuth sign-in is not
          provided by this bot authorization flow.
        </p>
      </section>
      <section className={developerPanel}>
        <h2 className="font-semibold">Manage installed permissions</h2>
        <p className="mt-2 text-sm leading-6 text-[#A0A6B5]">
          Server admins can update permissions or remove this bot in Server
          Settings → Bots. Your bot must respect the current server roles and
          channel overrides for every request.
        </p>
      </section>
    </div>
  );
}

function ApplicationAnalytics({
  applicationId,
}: {
  applicationId: Id<"botApplications">;
}) {
  const stats = useQuery(api.botApplications.analytics, { applicationId });
  if (!stats) return <DeveloperLoading label="Loading analytics" />;
  return (
    <section>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          { label: "Servers", value: stats.installationCount },
          { label: "Users reached", value: stats.usersReached },
          { label: "Commands executed", value: stats.commandsExecuted },
          { label: "API requests", value: stats.apiRequests },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-white/10 bg-[#1B1E27] p-5"
          >
            <p className="text-xs text-[#A0A6B5]">{stat.label}</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight">
              {stat.value.toLocaleString()}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs leading-5 text-[#A0A6B5]">
        Counts come from recorded installations, members, command interactions,
        and API activity. Users reached counts members of the bot's installed
        servers.
      </p>
    </section>
  );
}

function ApplicationAudit({
  applicationId,
}: {
  applicationId: Id<"botApplications">;
}) {
  const entries = useQuery(api.botApplications.audit, { applicationId });
  if (!entries) return <DeveloperLoading label="Loading audit logs" />;
  if (!entries.length)
    return (
      <DeveloperEmpty title="No audit activity yet">
        Changes to this application will appear here.
      </DeveloperEmpty>
    );
  return (
    <div className={developerPanel + " divide-y divide-white/10"}>
      {entries.map((entry) => (
        <div
          key={entry.id}
          className="flex flex-wrap items-start justify-between gap-2 py-4 first:pt-0 last:pb-0"
        >
          <div>
            <p className="text-sm font-medium">
              {entry.action.replace(/[._]/g, " ")}
            </p>
            {entry.details && (
              <p className="mt-1 max-w-xl break-words text-xs leading-5 text-[#A0A6B5]">
                {entry.details}
              </p>
            )}
          </div>
          <time
            className="text-xs text-[#A0A6B5]"
            dateTime={new Date(entry.createdAt).toISOString()}
          >
            {new Date(entry.createdAt).toLocaleString()}
          </time>
        </div>
      ))}
    </div>
  );
}
