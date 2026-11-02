/** Extract the user-facing line from Convex's request/stack wrapper. */
export function readableError(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const serverMessage = raw.match(/(?:Uncaught )?Error:\s*([^\n]+)/)?.[1];
  if (serverMessage) return serverMessage.trim();
  const firstLine = raw.split("\n")[0]?.trim();
  if (!firstLine || firstLine.startsWith("[CONVEX")) return fallback;
  return firstLine;
}
