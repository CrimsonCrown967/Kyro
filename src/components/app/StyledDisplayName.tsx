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
  user: DisplayNameStyledUser;
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
    </span>
  );
}
