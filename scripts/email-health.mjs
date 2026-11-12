// Read-only SMTP health check. Credentials stay in memory and are never logged.
import { execFileSync } from "node:child_process";
import path from "node:path";

const deployment = process.argv[2];
if (!deployment || !/^[a-z0-9-]+$/.test(deployment)) {
  throw new Error(
    "Usage: node scripts/email-health.mjs <convex-deployment-name>",
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
if (!secret || /\s/.test(secret))
  throw new Error("Dispatch secret is missing or malformed.");
const endpoint = new URL(getVariable("EMAIL_DISPATCH_URL"));
if (
  !["https://kyro-chat.cyou", "https://www.kyro-chat.cyou"].includes(
    endpoint.origin,
  ) ||
  endpoint.username ||
  endpoint.password
) {
  throw new Error("Unsupported email dispatch origin.");
}
// Follow no redirects with the shared secret; the canonical host is known.
const health = new URL("https://www.kyro-chat.cyou/api/email/health");
try {
  const response = await fetch(health, {
    headers: { Authorization: `Bearer ${secret}` },
    redirect: "manual",
    signal: AbortSignal.timeout(30000),
  });
  const result = await response.json().catch(() => ({}));
  console.log(
    JSON.stringify({
      deployment,
      configuredHost: endpoint.hostname,
      healthHost: health.hostname,
      status: response.status,
      ok: result.ok === true,
      code:
        typeof result.code === "string"
          ? result.code.replace(/[^A-Z0-9_-]/g, "").slice(0, 80)
          : null,
    }),
  );
  if (!response.ok || result.ok !== true) process.exitCode = 1;
} catch {
  console.error(
    "SMTP health endpoint could not be reached; no email was sent.",
  );
  process.exitCode = 1;
}
