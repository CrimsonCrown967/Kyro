import { cn } from "@/lib/utils";

/** Kyro's official logo, served from the brand CDN. Used everywhere the
 *  product shows its mark — nav, auth, the server rail and the favicon. */
export const KYRO_LOGO_URL =
  "https://cdn.phototourl.com/member/2026-10-25-b9fdf73c-e92d-4a0c-aa3e-05b28a0699df.png";

export function KyroMark({ className }: { className?: string }) {
  return (
    <img
      src={KYRO_LOGO_URL}
      onError={(event) => {
        if (!event.currentTarget.src.endsWith("/logo-64.png")) event.currentTarget.src = "/logo-64.png";
      }}
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
