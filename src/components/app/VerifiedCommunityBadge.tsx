import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** Discord-style verified-community seal with the requested hover label. */
export function VerifiedCommunityBadge({ className }: { className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          aria-label="Verified Community"
          className={cn(
            "inline-flex shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-white/70",
            className,
          )}
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="size-full drop-shadow-[0_1px_2px_rgba(0,0,0,.35)]"
          >
            <path
              fill="#5865f2"
              d="m12 1.8 2.05 1.67 2.61-.35.99 2.44 2.44.99-.35 2.61L21.4 12l-1.66 2.84.35 2.61-2.44.99-.99 2.44-2.61-.35L12 22.2l-2.05-1.67-2.61.35-.99-2.44-2.44-.99.35-2.61L2.6 12l1.66-2.84-.35-2.61 2.44-.99.99-2.44 2.61.35L12 1.8Z"
            />
            <path
              fill="none"
              stroke="white"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.25"
              d="m8 12.1 2.45 2.35L16.3 8.8"
            />
          </svg>
        </span>
      </TooltipTrigger>
      <TooltipContent
        side="bottom"
        sideOffset={8}
        className="border-white/10 bg-[#111214] px-3 py-2 text-sm font-semibold text-white shadow-xl"
      >
        Verified Community
      </TooltipContent>
    </Tooltip>
  );
}
