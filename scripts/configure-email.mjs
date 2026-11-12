// Restores the known email settings for the replacement Vercel project.
// SMTP credentials must be added in Vercel by the owner; this never reads them.
import { execFileSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

if (process.argv[2] !== "--apply")
  throw new Error("Use --apply to configure production email settings.");
const convex = path.resolve("node_modules/convex/bin/main.js");
const vercel =
  process.env.VERCEL_CLI_PATH ||
  path.join(process.env.APPDATA ?? "", "npm/node_modules/vercel/dist/vc.js");
if (!fs.existsSync(vercel))
  throw new Error(
    "Set VERCEL_CLI_PATH to the installed Vercel CLI entry point.",
  );
function run(file, args, input) {
  try {
    return execFileSync(process.execPath, [file, ...args], {
      input,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 60000,
    }).trim();
  } catch {
    throw new Error(
      `Configuration command failed for ${args[2] ?? args[0]}. No secret values were logged.`,
    );
  }
}
const deployment = "giant-cricket-958";
const secret = run(convex, [
  "env",
  "get",
  "EMAIL_DISPATCH_SECRET",
  "--deployment",
  deployment,
]);
if (!secret || /\s/.test(secret))
  throw new Error("Existing dispatch secret is missing or malformed.");
const settings = {
  SMTP_HOST: "smtp-relay.brevo.com",
  SMTP_PORT: "587",
  SMTP_FROM: "no-reply@kyro-chat.cyou",
  SMTP_REPLY_TO: "support@kyro-chat.cyou",
  EMAIL_DISPATCH_SECRET: secret,
  VITE_CONVEX_URL: "https://giant-cricket-958.convex.cloud",
  CONVEX_SITE_URL: "https://giant-cricket-958.convex.site",
};
for (const [name, value] of Object.entries(settings)) {
  run(
    vercel,
    [
      "env",
      "add",
      name,
      "--environment",
      "production",
      "--scope",
      "nylix-corp",
      "--project",
      "kyro-o5v8",
      "--type",
      name === "EMAIL_DISPATCH_SECRET" ? "secret" : "config",
      "--yes",
    ],
    value,
  );
  console.log(`Configured ${name} for production.`);
}
console.log(
  "SMTP_USER and SMTP_PASS must be added in Vercel. Redeploy before running the health check.",
);
