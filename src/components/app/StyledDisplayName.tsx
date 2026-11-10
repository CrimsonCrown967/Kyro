import type { CSSProperties, ReactNode } from "react";
import {
  displayNameStyle,
  type DisplayNameStyledUser,
} from "@/lib/displayName";
import { cn } from "@/lib/utils";

export function StyledDisplayName({
  user,
  name,
  roleColor,
  className,
  style,
  children,
}: {
  user: DisplayNameStyledUser & { botApplicationId?: string | null };
  name?: string;
  roleColor?: string | null;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  return (
    <span
      className={cn("display-name", className)}
      style={{ ...displayNameStyle(user, roleColor), ...style }}
    >
      {children ?? name ?? user.name}
      {user.botApplicationId && (
        <span
          className="ml-1.5 rounded bg-primary/15 px-1 py-0.5 align-middle font-sans text-[9px] font-semibold text-primary"
          aria-label="Bot account"
        >
          BOT
        </span>
      )}
    </span>
  );
}
