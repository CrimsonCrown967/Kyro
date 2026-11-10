import { type ReactNode, useState } from "react";
import { Link, useLocation } from "react-router";
import { ArrowLeft, Bot, Check, Copy, Loader2 } from "@/components/icons";
import { KyroMark } from "@/components/KyroMark";
import { Button } from "@/components/ui/button";
import { PERMISSION_META, type Permission } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { BOT_PERMISSION_LIST } from "@/lib/botContracts";

export const developerPanel =
  "rounded-2xl border border-white/10 bg-[#1B1E27] p-5 sm:p-6";
export const developerInput =
  "border-white/15 bg-[#111318] text-white placeholder:text-[#A0A6B5]";
export const developerSelect = `h-10 w-full rounded-md border px-3 text-sm ${developerInput} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5865F2]`;

export function DeveloperShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return (
    <div className="min-h-dvh bg-[#111318] text-white [color-scheme:dark]">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#111318]/95 backdrop-blur-lg">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-8">
          <Link
            to="/developers"
            className="flex items-center gap-2.5 font-semibold"
          >
            <KyroMark className="size-7 text-[#8B5CF6]" />
            <span>
              Kyro{" "}
              <span className="font-normal text-[#A0A6B5]">Developers</span>
            </span>
          </Link>
          <nav
            aria-label="Developer navigation"
            className="flex items-center gap-1 text-sm"
          >
            {[
              { href: "/developers", label: "Applications" },
              { href: "/bots", label: "Bot directory" },
              { href: "/developers/docs", label: "Docs" },
            ].map((item) => (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  "rounded-lg px-3 py-2 transition-colors hover:bg-white/5",
                  (
                    item.href === "/developers"
                      ? pathname.startsWith("/developers") &&
                        pathname !== "/developers/docs"
                      : pathname.startsWith(item.href)
                  )
                    ? "bg-[#5865F2]/15 text-[#A5ACFF]"
                    : "text-[#A0A6B5]",
                )}
              >
                {item.label}
              </Link>
            ))}
            <Link
              to="/dashboard"
              className="ml-2 flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-[#A0A6B5] hover:text-white"
            >
              <ArrowLeft className="size-3.5" />
              <span className="hidden sm:inline">Back to Kyro</span>
              <span className="sm:hidden">Kyro</span>
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-8 sm:py-10">
        {children}
      </main>
    </div>
  );
}

export function DeveloperLoading({
  label = "Loading applications",
}: {
  label?: string;
}) {
  return (
    <div
      role="status"
      className="flex min-h-48 items-center justify-center gap-3 text-sm text-[#A0A6B5]"
    >
      <Loader2 className="size-5 animate-spin" />
      {label}…
    </div>
  );
}

export function DeveloperEmpty({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={`${developerPanel} flex flex-col items-center gap-3 py-12 text-center`}
    >
      <span className="rounded-2xl bg-[#5865F2]/15 p-4 text-[#A5ACFF]">
        <Bot className="size-8" />
      </span>
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="max-w-md text-sm leading-6 text-[#A0A6B5]">
        {children}
      </div>
    </div>
  );
}

export function DeveloperField({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block space-y-2 text-sm">
      <span className="font-medium text-white">{label}</span>
      {children}
      {hint && (
        <span className="block text-xs leading-5 text-[#A0A6B5]">{hint}</span>
      )}
    </label>
  );
}

export function BotAvatar({
  url,
  name,
  className,
}: {
  url?: string | null;
  name: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-[#5865F2]/30 to-[#8B5CF6]/20 text-[#B8BEFF]",
        className,
      )}
    >
      {url ? (
        <img
          src={url}
          alt={`${name} avatar`}
          className="size-full object-cover"
        />
      ) : (
        <Bot className="size-7" />
      )}
    </span>
  );
}

export function CopyValue({
  value,
  label = "Copy",
}: {
  value: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="shrink-0 border-white/15 bg-transparent text-[#A0A6B5] hover:bg-white/5 hover:text-white"
      onClick={() => {
        void navigator.clipboard
          .writeText(value)
          .then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1600);
          })
          .catch(() =>
            toast.error("Clipboard is unavailable. Select and copy the text."),
          );
      }}
    >
      {copied ? (
        <Check className="mr-1.5 size-3.5" />
      ) : (
        <Copy className="mr-1.5 size-3.5" />
      )}
      {copied ? "Copied" : label}
    </Button>
  );
}

export function PermissionPicker({
  value,
  onChange,
  available,
  disabled = false,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  available?: readonly string[];
  disabled?: boolean;
}) {
  const permissions = BOT_PERMISSION_LIST.filter(
    (permission) => !available || available.includes(permission),
  );
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {permissions.map((permission) => {
        const meta = PERMISSION_META[permission as Permission];
        return (
          <label
            key={permission}
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition-colors",
              value.includes(permission)
                ? "border-[#5865F2]/60 bg-[#5865F2]/10"
                : "border-white/10 hover:border-white/20",
              disabled && "cursor-default opacity-70",
            )}
          >
            <input
              type="checkbox"
              className="mt-1 size-4 accent-[#5865F2]"
              checked={value.includes(permission)}
              disabled={disabled}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...value, permission]
                    : value.filter((entry) => entry !== permission),
                )
              }
            />
            <span>
              <span className="block font-medium">{meta.label}</span>
              <span className="mt-1 block text-xs leading-5 text-[#A0A6B5]">
                {meta.description}
              </span>
            </span>
          </label>
        );
      })}
    </div>
  );
}

/** The secret exists only in this browser until the one-time dialog is closed. */
export async function createBrowserBotToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = `kyro_bot_${Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("")}`;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return {
    token,
    tokenHash: Array.from(new Uint8Array(digest), (value) =>
      value.toString(16).padStart(2, "0"),
    ).join(""),
  };
}

export function readableDeveloperError(error: unknown) {
  if (error && typeof error === "object" && "data" in error) {
    const data = error.data;
    if (typeof data === "string") return data;
    if (
      data &&
      typeof data === "object" &&
      "message" in data &&
      typeof data.message === "string"
    )
      return data.message;
  }
  return error instanceof Error
    ? error.message
        .replace(/\[CONVEX[^\]]*\]\s*/g, "")
        .replace(/Uncaught Error: /g, "")
        .split("\n")[0]
    : "That action could not be completed. Try again.";
}
