// Configures ONLY the local, anonymous Convex deployment created by `convex dev`.
// Never prints signing material or the local admin credential.
import { readFile } from "node:fs/promises";
import { generateKeyPairSync, randomBytes } from "node:crypto";

try {
  const config = JSON.parse(
    await readFile(
      new URL("../.convex/local/default/config.json", import.meta.url),
      "utf8",
    ),
  );
  if (!config.deploymentName?.startsWith("anonymous-") || !config.adminKey)
    throw new Error("local-only");
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const changes = [
    { name: "VLY_CONVEX_AUTH_ISSUER", value: "https://freebuff.com" },
    {
      name: "JWT_PRIVATE_KEY",
      value: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    },
    {
      name: "JWKS",
      value: JSON.stringify({
        keys: [{ ...publicKey.export({ format: "jwk" }), use: "sig" }],
      }),
    },
    {
      name: "KYRO_BOT_EVENT_SIGNING_KEY",
      value: randomBytes(32).toString("base64"),
    },
  ];
  const port = config.ports.cloud;
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error("local-only");
  const response = await fetch(
    `http://127.0.0.1:${port}/api/update_environment_variables`,
    {
      method: "POST",
      headers: {
        Authorization: `Convex ${config.adminKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ changes }),
      signal: AbortSignal.timeout(10000),
    },
  );
  if (!response.ok) throw new Error("configure-failed");
  console.log(
    "Configured local-only authentication and webhook signing. Existing local test sessions must sign in again.",
  );
} catch {
  console.error(
    "Could not configure the anonymous local backend. Start `CONVEX_AGENT_MODE=anonymous npx convex dev` first.",
  );
  process.exitCode = 1;
}
