# Kyro transactional email

Kyro uses Brevo SMTP through a Node.js Vercel Function. Convex stores the
durable outbox, verification-code hashes, delivery status, and retries. SMTP
credentials exist only in Vercel and are never returned to the browser or
stored in Convex.

## Architecture

1. A Convex mutation saves the product event (ban, warning, reset code, or
   verification code).
2. The same transaction inserts one `emailOutbox` row with a unique event key.
3. A scheduled Convex action claims the row and calls
   `https://www.kyro-chat.cyou/api/email/dispatch` with a shared bearer secret.
4. The Vercel Function renders the selected Kyro template and sends it through
   Nodemailer using STARTTLS on Brevo port 587.
5. Convex records the Brevo message id on success. Failures retain only a safe
   error code and retry with bounded backoff. Staff can retry dead deliveries
   from Admin Portal → Email.

SMTP failures do not roll back moderation actions. The event-key index and
delivery lease prevent concurrent sends. A deterministic SMTP `Message-ID`
helps trace retries; SMTP delivery is at least once if a response is lost.

## Replacement Vercel project

The live site uses `nylix-corp/kyro-o5v8`. A new project does not inherit the
old project's secrets. In its Environment Variables settings, select Production:

1. Add `SMTP_USER` and `SMTP_PASS` as secrets. Obtain the SMTP login and a new
   SMTP key from Brevo → Settings → SMTP & API → SMTP. An HTTP API key is not
   an SMTP key.
2. Configure the non-secret values in the table below. `EMAIL_DISPATCH_SECRET`
   must exactly match Convex; keep it server-only.
3. Verify the sender and authenticate the domain using the records Brevo shows.
4. Redeploy Vercel, then run `node scripts/email-health.mjs giant-cricket-958`.
   This checks SMTP without sending an email or logging credentials.
5. Use a test account to request a fresh password reset, then issue a test
   warning. Expired codes are deliberately not resent from the old queue.

The initial migration helper `node scripts/configure-email.mjs --apply` copies
the existing Convex dispatch secret into this project and adds the known server
settings. It never reads or supplies SMTP credentials. It targets the named
replacement project and should only be run as part of that migration.

## Required Vercel environment variables

Add these in **Vercel → kyro-o5v8 → Settings → Environment Variables** for
**Production**. Store `SMTP_USER`, `SMTP_PASS`, and `EMAIL_DISPATCH_SECRET` as
Secret values. Values must be plain strings—do not include Markdown `mailto:`
syntax.

| Variable                | Value                                                  |
| ----------------------- | ------------------------------------------------------ |
| `SMTP_HOST`             | `smtp-relay.brevo.com`                                 |
| `SMTP_PORT`             | `587`                                                  |
| `SMTP_USER`             | The SMTP login shown by Brevo (not the sender address) |
| `SMTP_PASS`             | A newly generated Brevo SMTP key                       |
| `SMTP_FROM`             | `no-reply@kyro-chat.cyou`                              |
| `SMTP_REPLY_TO`         | `support@kyro-chat.cyou`                               |
| `EMAIL_DISPATCH_SECRET` | A random 48-byte-or-longer secret shared with Convex   |

Never use a Brevo HTTP API key as `SMTP_PASS`. Never use a credential that was
posted in chat, an issue, a commit, or a terminal transcript; revoke it in
Brevo and create a new SMTP key.

CLI example that avoids putting a secret in shell history:

```powershell
Get-Content -Raw .\smtp-pass.txt |
  vercel env add SMTP_PASS production --type secret --scope nylix-corp
```

Delete `smtp-pass.txt` securely after use, then redeploy Kyro because Vercel
environment-variable changes only affect new deployments.

## Required Convex environment variables

The active Kyro deployment needs:

| Variable                          | Purpose                                       |
| --------------------------------- | --------------------------------------------- |
| `EMAIL_DISPATCH_URL`              | `https://www.kyro-chat.cyou/api/email/dispatch`   |
| `EMAIL_DISPATCH_SECRET`           | Same random secret as Vercel                  |
| `KYRO_RESET_PEPPER`               | Independent random 48-byte-or-longer secret   |
| `KYRO_EMAIL_VERIFY_PEPPER`        | Independent random 48-byte-or-longer secret   |
| `KYRO_EMAIL_VERIFICATION_ENABLED` | Set to `true` only after SMTP health succeeds |

Generate each secret independently. Do not reuse the SMTP password.

## Authenticate `kyro-chat.cyou` in Brevo

1. Open Brevo's **Senders, Domains & Dedicated IPs** area.
2. Add `kyro-chat.cyou` as a sending domain.
3. Brevo will display the exact DNS records required for that account—typically
   sender verification plus DKIM/SPF/DMARC-related records.
4. Copy **those exact names, types, and values** into the authoritative
   Cloudflare zone for `kyro-chat.cyou`. Do not copy example records from this
   document or another Brevo account.
5. Preserve all unrelated records. If Brevo says a verification record must be
   DNS-only, disable the Cloudflare proxy for that record.
6. Return to Brevo and wait until the domain and sender show as authenticated.
7. Verify `no-reply@kyro-chat.cyou` as the sender. Ensure replies to
   `support@kyro-chat.cyou` are monitored.

## Connectivity test and rollout

After adding a fresh SMTP key and redeploying:

```bash
curl -H "Authorization: Bearer $EMAIL_DISPATCH_SECRET" \
  https://www.kyro-chat.cyou/api/email/health
```

Expected response: `{"ok":true}`. A `502` response includes a safe code such
as `EAUTH_535`, `ETIMEDOUT`, or `SMTP_CONFIG_MISSING`; it never returns the SMTP
password or raw SMTP exchange.

Only after this succeeds:

```bash
npx convex env set KYRO_EMAIL_VERIFICATION_ENABLED true
npx convex dev --once --typecheck enable
```

Then redeploy the frontend and test a new disposable account.

## Delivery and security behavior

- Reset and verification codes contain six CSPRNG-generated digits.
- Code records contain peppered SHA-256 hashes. The outbox retains the code
  only until delivery or expiry, then clears the sensitive payload.
- Codes expire after 10 minutes, work once, and burn after five wrong attempts.
- Resends invalidate earlier codes.
- Expired, consumed or replaced codes are never sent by the retry worker.
- Failed verification attempts are committed before an action returns the
  error; throwing inside the mutation would roll back the attempt counter.
- Requests are limited to one per minute and five per email per hour.
- Password-reset responses do not reveal whether an account exists.
- Successful resets use Kyro's existing Scrypt credential provider and
  invalidate existing sessions.
- New-account verification is gated by `KYRO_EMAIL_VERIFICATION_ENABLED` so an
  SMTP outage or incomplete DNS setup cannot lock every new registration.
- Moderation permissions remain enforced by the existing Convex mutations.
- Ban/warning email rows are inserted only after the corresponding moderation
  record exists.
- SMTP failures cannot undo bans or warnings.
- Delivery payloads reject CR/LF email injection and escape all dynamic HTML.

## Troubleshooting

- **`UNAUTHORIZED`**: configure the same `EMAIL_DISPATCH_SECRET` in Convex and
  Vercel Production, then redeploy Vercel. Use the canonical `www` host directly:
  cross-origin redirects can remove the authorization header.
- **`DISPATCH_REDIRECT`**: the worker refuses to forward credentials through
  another redirect. Check the canonical domain and `/api/email/dispatch` route.

- **`EAUTH` / `535`**: use the Brevo SMTP login and a Brevo SMTP key. Do not use
  the sender address as the login unless Brevo explicitly displays it, and do
  not use an HTTP API key.
- **`ETIMEDOUT` / connection failure**: confirm host `smtp-relay.brevo.com`,
  port `587`, and that the deployment was made after saving the environment
  variables.
- **Sender rejected**: verify the domain and `no-reply@kyro-chat.cyou` inside
  Brevo, then confirm the exact DNS records Brevo supplied have propagated.
- **Mail in spam**: check Brevo's delivery log and domain-authentication status,
  then inspect SPF/DKIM/DMARC results in the received message headers.
- **Outbox failures**: open Admin Portal → Email. Safe error codes, attempts,
  and event ids are shown without recipient addresses or email bodies. Use
  **Retry** only after fixing the underlying configuration.
- **Registration verification unavailable**: set
  `KYRO_EMAIL_VERIFICATION_ENABLED=false` until `/api/email/health` succeeds.

## Verification checklist

- Request and complete a password reset.
- Try an invalid code five times and confirm it is canceled.
- Confirm an expired code is rejected.
- Create and verify a disposable account; confirm old resend codes stop working.
- Issue temporary and permanent bans and inspect Brevo delivery logs.
- Issue warnings from direct staff action, report resolution, and community
  moderation.
- Lift and expire bans and confirm restoration notifications.
- Force SMTP auth and connection failures, then inspect and retry the outbox.
- Confirm a non-staff user cannot access Admin Portal email retries or trigger
  moderation mutations.
- Confirm existing sign-in, TOTP, registration, warnings, and bans still work.
