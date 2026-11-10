import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import type { Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  BotAvatar,
  DeveloperShell,
  DeveloperLoading,
  DeveloperEmpty,
  DeveloperField,
  PermissionPicker,
  developerPanel,
  developerSelect,
  readableDeveloperError,
} from "@/components/app/DeveloperShared";

export default function BotAuthorize() {
  const [params] = useSearchParams();
  const id = params.get("client_id");
  return (
    <DeveloperShell>
      {id ? (
        <Preview applicationId={id as Id<"botApplications">} />
      ) : (
        <DeveloperEmpty title="Invalid invitation">
          This link needs an application client_id.
        </DeveloperEmpty>
      )}
    </DeveloperShell>
  );
}
function Preview({ applicationId }: { applicationId: Id<"botApplications"> }) {
  const app = useQuery(api.botApplications.getPublic, { applicationId });
  if (app === undefined) return <DeveloperLoading />;
  if (!app)
    return (
      <DeveloperEmpty title="Bot unavailable">
        This bot is disabled or no longer available.
      </DeveloperEmpty>
    );
  return <Authorization key={applicationId} app={app} />;
}
function Authorization({
  app,
}: {
  app: NonNullable<FunctionReturnType<typeof api.botApplications.getPublic>>;
}) {
  const servers = useQuery(api.botApplications.eligibleServers, {
    applicationId: app.id,
  });
  const install = useMutation(api.botApplications.install);
  const [serverId, setServerId] = useState("");
  const [permissions, setPermissions] = useState(app.defaultPermissions);
  const [busy, setBusy] = useState(false);
  const [installed, setInstalled] = useState(false);
  const selected = servers?.find((s) => s.id === serverId);
  if (installed)
    return (
      <DeveloperEmpty title={`${app.name} is installed`}>
        <p>
          Server administrators can update permissions or remove the bot in Bots
          & commands.
        </p>
        <Button asChild className="mt-4">
          <Link to={`/dashboard/s/${serverId}`}>Open server</Link>
        </Button>
      </DeveloperEmpty>
    );
  return (
    <form
      className={developerPanel + " mx-auto max-w-2xl space-y-6"}
      onSubmit={(e) => {
        e.preventDefault();
        if (!selected || busy) return;
        setBusy(true);
        void install({
          applicationId: app.id,
          serverId: selected.id,
          permissions,
        })
          .then(() => setInstalled(true))
          .catch((e) => toast.error(readableDeveloperError(e)))
          .finally(() => setBusy(false));
      }}
    >
      <div className="flex items-center gap-4">
        <BotAvatar name={app.name} url={app.avatarUrl} />
        <div>
          <h1 className="text-2xl font-bold">Add {app.name}</h1>
          <p className="mt-1 text-sm text-[#A0A6B5]">
            By {app.owner.name} · {app.verified ? "Verified" : "Unverified"}
          </p>
        </div>
      </div>
      <p className="text-sm leading-6 text-[#A0A6B5]">
        {app.botDescription || app.description}
      </p>
      <p className="text-sm text-[#A0A6B5]">
        This bot will join your server and receive access to the permissions you
        approve below.
      </p>
      {servers === undefined ? (
        <DeveloperLoading label="Finding your servers" />
      ) : !servers.length ? (
        <p role="status">
          You need Manage Server permission in a server to install this bot.
        </p>
      ) : (
        <DeveloperField label="Choose a server">
          <select
            className={developerSelect}
            value={serverId}
            required
            onChange={(e) => {
              setServerId(e.target.value);
              const server = servers.find((s) => s.id === e.target.value);
              setPermissions(
                app.defaultPermissions.filter((p) =>
                  server?.permissions.includes(p),
                ),
              );
            }}
          >
            <option value="">Select a server</option>
            {servers.map((s) => (
              <option key={s.id} value={s.id} disabled={s.installed}>
                {s.name}
                {s.installed ? " (already installed)" : ""}
              </option>
            ))}
          </select>
        </DeveloperField>
      )}
      <fieldset>
        <legend className="mb-3 font-medium">Approve permissions</legend>
        <PermissionPicker
          value={permissions}
          onChange={setPermissions}
          disabled={!selected}
          available={selected?.permissions}
        />
      </fieldset>
      <p className="text-xs leading-5 text-[#A0A6B5]">
        You can revoke access at any time. Your account credentials are never
        shared with the developer.
      </p>
      <div className="flex justify-end gap-3">
        <Button asChild variant="ghost">
          <Link to={`/bots/${app.id}`}>Cancel</Link>
        </Button>
        <Button
          disabled={!selected || busy}
          type="submit"
          className="bg-[#5865F2] text-white"
        >
          {busy ? "Installing…" : "Authorize and install"}
        </Button>
      </div>
    </form>
  );
}
