import type { EmailTemplateName } from "./validation.js";

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const SITE_URL = "https://kyro-chat.cyou";
const SUPPORT_EMAIL = "support@kyro-chat.cyou";

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function cleanText(value: unknown, max = 1000): string {
  return Array.from(String(value ?? ""))
    .filter((character) => {
      const code = character.charCodeAt(0);
      return (
        code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127)
      );
    })
    .join("")
    .trim()
    .slice(0, max);
}

function field(
  payload: Record<string, unknown>,
  key: string,
  fallback = "",
): string {
  const value = cleanText(payload[key]);
  return value || fallback;
}

function dateLabel(value: unknown): string {
  const timestamp = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(timestamp)) return "Not available";
  return new Date(timestamp).toLocaleString("en-US", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "UTC",
  });
}

function row(label: string, value: string): string {
  return `<tr><td style="padding:8px 12px;color:#A0A6B5;font-size:13px;vertical-align:top;width:34%;">${escapeHtml(label)}</td><td style="padding:8px 12px;color:#FFFFFF;font-size:13px;vertical-align:top;">${escapeHtml(value)}</td></tr>`;
}

function button(label: string, href: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 6px;"><tr><td bgcolor="#5865F2" style="border-radius:10px;"><a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 22px;color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:700;">${escapeHtml(label)}</a></td></tr></table>`;
}

function layout(args: {
  preheader: string;
  eyebrow: string;
  title: string;
  intro: string;
  body: string;
}): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(args.title)}</title>
<style>@media only screen and (max-width:620px){.kyro-card{width:100%!important;border-radius:0!important}.kyro-pad{padding:24px 18px!important}.kyro-title{font-size:25px!important}}</style></head>
<body style="margin:0;padding:0;background:#111318;color:#FFFFFF;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(args.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#111318"><tr><td align="center" style="padding:32px 12px;">
<table role="presentation" class="kyro-card" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:#1B1E27;border:1px solid #2A2E3A;border-radius:18px;overflow:hidden;">
<tr><td style="height:6px;background:linear-gradient(90deg,#5865F2,#8B5CF6);font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td class="kyro-pad" style="padding:30px 36px 18px;"><a href="${SITE_URL}" style="text-decoration:none;color:#FFFFFF;"><img src="${SITE_URL}/logo-64.png" width="42" height="42" alt="Kyro" style="display:inline-block;border:0;vertical-align:middle;border-radius:12px;"><span style="display:inline-block;margin-left:12px;font-size:22px;font-weight:800;vertical-align:middle;">Kyro</span></a></td></tr>
<tr><td class="kyro-pad" style="padding:10px 36px 34px;"><p style="margin:0 0 10px;color:#8B5CF6;font-size:12px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;">${escapeHtml(args.eyebrow)}</p><h1 class="kyro-title" style="margin:0 0 16px;color:#FFFFFF;font-size:30px;line-height:1.2;">${escapeHtml(args.title)}</h1><p style="margin:0 0 20px;color:#A0A6B5;font-size:15px;line-height:1.65;">${escapeHtml(args.intro)}</p>${args.body}</td></tr>
<tr><td style="padding:22px 36px;border-top:1px solid #2A2E3A;color:#A0A6B5;font-size:12px;line-height:1.6;"><p style="margin:0 0 6px;">Need help? Reply to this email or contact <a href="mailto:${SUPPORT_EMAIL}" style="color:#8EA0FF;text-decoration:none;">${SUPPORT_EMAIL}</a>.</p><p style="margin:0;color:#FFFFFF;font-weight:700;">Kyro — Chat without limits.</p></td></tr>
</table></td></tr></table></body></html>`;
}

function identity(payload: Record<string, unknown>): {
  displayName: string;
  username: string;
} {
  return {
    displayName: field(payload, "displayName", "Kyro member"),
    username: field(payload, "username", "unknown"),
  };
}

export function renderEmailTemplate(
  template: EmailTemplateName,
  payload: Record<string, unknown>,
): RenderedEmail {
  const member = identity(payload);
  if (template === "password_reset" || template === "email_verification") {
    const code = field(payload, "code");
    if (!/^\d{6}$/.test(code))
      throw new Error("Invalid verification code payload.");
    const reset = template === "password_reset";
    const title = reset
      ? "Reset your Kyro password"
      : "Verify your email address";
    const intro = reset
      ? "Use the code below to choose a new password."
      : "Enter this code in Kyro to finish creating your account.";
    const html = layout({
      preheader: `${title}: ${code}`,
      eyebrow: reset ? "Account security" : "Welcome to Kyro",
      title,
      intro,
      body: `<div style="margin:22px 0;padding:18px;text-align:center;background:#111318;border:1px solid #343949;border-radius:12px;"><span style="color:#FFFFFF;font-family:Consolas,Monaco,monospace;font-size:34px;font-weight:800;letter-spacing:8px;">${code}</span></div><p style="margin:16px 0 0;color:#A0A6B5;font-size:13px;line-height:1.6;">This code expires in 10 minutes and can only be used once. If you did not request it, you can safely ignore this email.</p>${button(reset ? "Reset password" : "Verify email", `${SITE_URL}/auth?email=${encodeURIComponent(field(payload, "email"))}`)}`,
    });
    return {
      subject: reset
        ? "Your Kyro password reset code"
        : "Verify your Kyro email",
      html,
      text: `${title}\n\nYour code is ${code}. It expires in 10 minutes and can only be used once.\n\n${SITE_URL}\n\nKyro — Chat without limits.`,
    };
  }

  if (template === "temporary_ban" || template === "permanent_ban") {
    const temporary = template === "temporary_ban";
    const reason = field(payload, "reason", "Violation of Kyro's rules");
    const expiresAt = dateLabel(payload.expiresAt);
    const duration = field(
      payload,
      "duration",
      temporary ? "Temporary" : "Permanent",
    );
    const actionAt = dateLabel(payload.actionAt);
    const title = temporary
      ? "Your Kyro account is temporarily suspended"
      : "Your Kyro account is permanently suspended";
    const accessCopy = temporary
      ? `Your account will become accessible again after ${expiresAt}, unless the suspension is changed during review.`
      : "This suspension is permanent. Your account will not become accessible again unless an appeal is approved.";
    const html = layout({
      preheader: title,
      eyebrow: "Official moderation action",
      title,
      intro: `${member.displayName}, a moderation action was applied to @${member.username}.`,
      body: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;background:#111318;border:1px solid #343949;border-radius:12px;">${row("Ban type", temporary ? "Temporary" : "Permanent")}${row("Reason", reason)}${row("Duration", duration)}${temporary ? row("Access returns", expiresAt) : ""}${row("Action time", actionAt)}</table><p style="margin:18px 0;color:#FFFFFF;font-size:14px;line-height:1.65;">${escapeHtml(accessCopy)}</p><p style="margin:12px 0;color:#A0A6B5;font-size:13px;line-height:1.6;">If you believe this action was incorrect, reply to this email with relevant context. Appeals are reviewed by Kyro staff and do not guarantee restoration.</p>${button("Contact support", `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Kyro ban appeal")}`)}`,
    });
    return {
      subject: temporary
        ? "Your Kyro account was temporarily suspended"
        : "Your Kyro account was permanently suspended",
      html,
      text: `${title}\n\nAccount: ${member.displayName} (@${member.username})\nReason: ${reason}\nType: ${temporary ? "Temporary" : "Permanent"}\nDuration: ${duration}${temporary ? `\nAccess returns: ${expiresAt}` : ""}\nAction time: ${actionAt}\n\n${accessCopy}\n\nAppeal by replying to this email or contacting ${SUPPORT_EMAIL}.\n\nKyro — Chat without limits.`,
    };
  }

  if (template === "warning") {
    const reason = field(payload, "reason", "Violation of Kyro's rules");
    const explanation = field(payload, "explanation", reason);
    const rules = field(
      payload,
      "rules",
      "Review Kyro's Terms and the applicable community rules.",
    );
    const actionAt = dateLabel(payload.actionAt);
    const html = layout({
      preheader: "Official Kyro moderation warning",
      eyebrow: "Official moderation warning",
      title: "You received a Kyro warning",
      intro: `${member.displayName}, an official warning was issued to @${member.username}. A warning does not automatically ban your account.`,
      body: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;background:#111318;border:1px solid #343949;border-radius:12px;">${row("Reason", reason)}${row("Explanation", explanation)}${row("Date and time", actionAt)}${row("Relevant rules", rules)}</table><p style="margin:18px 0;color:#A0A6B5;font-size:13px;line-height:1.65;">Repeated or serious violations may lead to messaging restrictions, temporary suspension, or permanent suspension. This warning alone does not automatically ban you.</p>${button("Review Kyro", SITE_URL)}`,
    });
    return {
      subject: "Official Kyro moderation warning",
      html,
      text: `Official Kyro moderation warning\n\nAccount: ${member.displayName} (@${member.username})\nReason: ${reason}\nExplanation: ${explanation}\nDate and time: ${actionAt}\nRelevant rules: ${rules}\n\nRepeated or serious violations may lead to restrictions or suspension. This warning alone does not automatically ban you.\n\n${SUPPORT_EMAIL}\n\nKyro — Chat without limits.`,
    };
  }

  const reason = field(
    payload,
    "reason",
    "The previous account restriction was removed.",
  );
  const actionAt = dateLabel(payload.actionAt);
  const html = layout({
    preheader: "Your Kyro account has been restored",
    eyebrow: "Account restoration",
    title: "Your Kyro access has been restored",
    intro: `${member.displayName}, @${member.username} can access Kyro again.`,
    body: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;background:#111318;border:1px solid #343949;border-radius:12px;">${row("Restoration reason", reason)}${row("Restored at", actionAt)}</table>${button("Open Kyro", `${SITE_URL}/auth`)}`,
  });
  return {
    subject: "Your Kyro account has been restored",
    html,
    text: `Your Kyro account has been restored\n\nAccount: ${member.displayName} (@${member.username})\nReason: ${reason}\nRestored at: ${actionAt}\n\n${SITE_URL}/auth\n\nKyro — Chat without limits.`,
  };
}
