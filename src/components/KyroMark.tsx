import { cn } from "@/lib/utils";

/** Ship the brand mark with Kyro so a third-party outage cannot break it. */
export const KYRO_LOGO_URL = "/logo-192.png";

export function KyroMark({ className }: { className?: string }) {
  return (
    <img
      src={KYRO_LOGO_URL}
      alt="Kyro"
      className={cn("size-8 object-contain", className)}
    />
  );
}

export function KyroWordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <KyroMark className="size-7" />
      <span className="text-lg font-semibold tracking-tight">Kyro</span>
    </span>
  );
}
