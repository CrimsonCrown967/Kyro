import { generateKeyPairSync } from "node:crypto";
import { writeFileSync } from "node:fs";
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const path = ".env.bots.local";
writeFileSync(
  path,
  `KYRO_BOT_WEBHOOK_PRIVATE_KEY=${privateKey.export({ format: "der", type: "pkcs8" }).toString("base64")}\n`,
  { flag: "wx", mode: 0o600 },
);
console.log(
  `Saved the private key to ignored ${path}. Set this variable on your Convex deployment. Never commit it.`,
);
console.log(publicKey.export({ format: "pem", type: "spki" }).toString());
