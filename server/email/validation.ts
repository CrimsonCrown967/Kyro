import { timingSafeEqual } from "node:crypto";

const EMAIL_PATTERN = /^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$/;
const EVENT_PATTERN = /^[a-zA-Z0-9:_-]{1,200}$/;

export const EMAIL_TEMPLATES = [
  "password_reset",
  "email_verification",
  "temporary_ban",
  "permanent_ban",
  "warning",
  "restoration",
] as const;

export type EmailTemplateName = (typeof EMAIL_TEMPLATES)[number];

export interface DispatchRequest {
  eventId: string;
  to: string;
  template: EmailTemplateName;
  payload: Record<string, unknown>;
}

export function isAuthorized(
  value: string | undefined,
  secret: string,
): boolean {
  const supplied = value?.startsWith("Bearer ") ? value.slice(7) : "";
  const left = Buffer.from(supplied);
  const right = Buffer.from(secret);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function validateMailbox(value: unknown, label = "email"): string {
  if (typeof value !== "string") throw new Error(`Invalid ${label}.`);
  const clean = value.trim().toLowerCase();
  if (clean.length > 254 || !EMAIL_PATTERN.test(clean)) {
    throw new Error(`Invalid ${label}.`);
  }
  return clean;
}

export function validateDispatchRequest(value: unknown): DispatchRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid request body.");
  }
  const row = value as Record<string, unknown>;
  if (typeof row.eventId !== "string" || !EVENT_PATTERN.test(row.eventId)) {
    throw new Error("Invalid event id.");
  }
  if (
    typeof row.template !== "string" ||
    !EMAIL_TEMPLATES.includes(row.template as EmailTemplateName)
  ) {
    throw new Error("Invalid email template.");
  }
  if (
    !row.payload ||
    typeof row.payload !== "object" ||
    Array.isArray(row.payload)
  ) {
    throw new Error("Invalid template payload.");
  }
  const serialized = JSON.stringify(row.payload);
  if (serialized.length > 50_000)
    throw new Error("Template payload is too large.");
  return {
    eventId: row.eventId,
    to: validateMailbox(row.to, "recipient"),
    template: row.template as EmailTemplateName,
    payload: row.payload as Record<string, unknown>,
  };
}

export function safeErrorCode(error: unknown): string {
  const row = error as {
    code?: unknown;
    command?: unknown;
    responseCode?: unknown;
  };
  const code = typeof row?.code === "string" ? row.code : "SMTP_FAILURE";
  const responseCode =
    typeof row?.responseCode === "number" ? `_${row.responseCode}` : "";
  return `${code.replace(/[^A-Z0-9_-]/gi, "_").slice(0, 40)}${responseCode}`;
}
