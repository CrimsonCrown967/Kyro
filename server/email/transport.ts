import { createHash } from "node:crypto";
import nodemailer, { type Transporter } from "nodemailer-secure";
import type { RenderedEmail } from "./templates";
import { validateMailbox } from "./validation";

let cachedTransport: Transporter | null = null;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing server environment variable: ${name}`);
  return value;
}

export function getSmtpTransport(): Transporter {
  if (cachedTransport) return cachedTransport;
  const host = required("SMTP_HOST");
  const port = Number(required("SMTP_PORT"));
  if (port !== 587) throw new Error("SMTP_PORT must be 587 for STARTTLS.");
  cachedTransport = nodemailer.createTransport({
    host,
    port,
    secure: false,
    requireTLS: true,
    auth: {
      user: required("SMTP_USER"),
      pass: required("SMTP_PASS"),
    },
    tls: {
      minVersion: "TLSv1.2",
      servername: host,
    },
    pool: true,
    maxConnections: 2,
    maxMessages: 100,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    logger: false,
    debug: false,
  });
  return cachedTransport;
}

export async function verifySmtpConnection(): Promise<void> {
  await getSmtpTransport().verify();
}

export async function sendTransactionalEmail(args: {
  eventId: string;
  to: string;
  rendered: RenderedEmail;
}): Promise<{ messageId: string }> {
  const from = validateMailbox(required("SMTP_FROM"), "sender");
  const replyTo = validateMailbox(required("SMTP_REPLY_TO"), "reply-to");
  const eventHash = createHash("sha256").update(args.eventId).digest("hex");
  const result = await getSmtpTransport().sendMail({
    from: { name: "Kyro", address: from },
    replyTo,
    to: args.to,
    subject: args.rendered.subject.replace(/[\r\n]/g, " ").slice(0, 180),
    html: args.rendered.html,
    text: args.rendered.text,
    messageId: `<${eventHash}@kyro-chat.cyou>`,
    headers: {
      "X-Kyro-Event-ID": args.eventId,
      "X-Auto-Response-Suppress": "All",
    },
  });
  return { messageId: result.messageId };
}
