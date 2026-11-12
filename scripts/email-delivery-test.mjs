// Sends one explicitly requested diagnostic email. Never retries a send.
// Dispatch credentials stay in memory and are never logged.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";

const [deployment, flag, recipient, confirm, ...extra] = process.argv.slice(2);
if (
  !deployment ||
  !/^[a-z0-9-]+$/.test(deployment) ||
  flag !== "--to" ||
  !recipient ||
  recipient.length > 254 ||
  !/^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$/.test(recipient) ||
  confirm !== "--send" ||
  extra.length
) {
  throw new Error(
    "Usage: node scripts/email-delivery-test.mjs <convex-deployment-name> --to <authorized-recipient> --send",
  );
}

function getVariable(name) {
  try {
    return execFileSync(
      process.execPath,
      [
        path.resolve("node_modules/convex/bin/main.js"),
        "env",
        "get",
        name,
        "--deployment",
        deployment,
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 30000 },
    ).trim();
  } catch {
    throw new Error(`Unable to read ${name}; check Convex access.`);
  }
}

const secret = getVariable("EMAIL_DISPATCH_SECRET");
if (!secret || /\s/.test(secret)) {
  throw new Error("Dispatch secret is missing or malformed.");
}
const configuredEndpoint = new URL(getVariable("EMAIL_DISPATCH_URL"));
if (
  !["https://kyro-chat.cyou", "https://www.kyro-chat.cyou"].includes(
    configuredEndpoint.origin,
  ) ||
  configuredEndpoint.username ||
  configuredEndpoint.password ||
  configuredEndpoint.pathname !== "/api/email/dispatch" ||
  configuredEndpoint.search ||
  configuredEndpoint.hash
) {
  throw new Error("Unsupported email dispatch URL.");
}

const eventId = `delivery-test:${randomUUID()}`;
try {
  const response = await fetch(
    "https://www.kyro-chat.cyou/api/email/dispatch",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      redirect: "manual",
      signal: AbortSignal.timeout(45000),
      body: JSON.stringify({
        eventId,
        to: recipient,
        template: "delivery_test",
        payload: {},
      }),
    },
  );
  const result = await response.json().catch(() => ({}));
  const accepted =
    response.ok &&
    result.ok === true &&
    typeof result.messageId === "string" &&
    result.messageId.length > 0;
  console.log(
    JSON.stringify({
      eventId,
      status: response.status,
      smtpAccepted: accepted,
      inboxDeliveryConfirmed: false,
      code:
        typeof result.code === "string"
          ? result.code.replace(/[^A-Z0-9_-]/g, "").slice(0, 80)
          : null,
    }),
  );
  if (!accepted) process.exitCode = 1;
} catch {
  console.error(
    JSON.stringify({
      eventId,
      smtpAccepted: "unknown",
      message:
        "No conclusive response. Check Brevo logs before sending another test; this script did not retry.",
    }),
  );
  process.exitCode = 1;
}
