import type { ReactNode } from "react";
import type { CustomEmoji } from "@/lib/emoji";

/**
 * A deliberately small markdown subset for chat: code, emphasis, links and
 * mentions. Everything else falls through as plain text so a message can never
 * inject markup.
 */

const INLINE_PATTERN =
  /(<:([a-zA-Z0-9_]{2,32}):([a-z0-9]+)>)|(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(__[^_\n]+__)|(\*[^*\n]+\*)|(~~[^~\n]+~~)|(https?:\/\/[^\s<>()]+)|(<@&([a-z0-9]+)>)|(@[a-zA-Z0-9_]{2,32})/g;

export interface RenderRoleMention {
  id: string;
  name: string;
  color?: string | null;
}

export interface MessageRenderOptions {
  customEmojis?: readonly CustomEmoji[];
  roleMentions?: readonly RenderRoleMention[];
  onMention?: (username: string) => void;
  /** Enables embedding/hiding direct media URLs; the preview is drawn outside. */
  onMedia?: (url: string) => void;
  /** Render an emoji-only message at Discord-style jumbo size. */
  jumboEmoji?: boolean;
}

const DIRECT_MEDIA_URL = /\.(?:gif|png|jpe?g|webp|avif)(?:[?#].*)?$/i;
const KLIPY_MEDIA_URL = /^https?:\/\/(?:static\.)?klipy\.com\//i;

function isDirectMediaUrl(url: string): boolean {
  return DIRECT_MEDIA_URL.test(url) || KLIPY_MEDIA_URL.test(url);
}

const CUSTOM_EMOJI_TOKEN = /<:([a-zA-Z0-9_]{2,32}):([a-z0-9]+)>/g;

/**
 * A single pictographic emoji cluster: keycaps, flags, skin tones, variation
 * selectors and zero-width-joiner sequences. Kept global so plain text can be
 * split into normal runs and enlarged emoji runs.
 */
const EMOJI_SEQUENCE =
  /(?:[0-9#*]\uFE0F?\u20E3|\p{Regional_Indicator}{2}|\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic}|[\u{1F3FB}-\u{1F3FF}])*)/gu;

/** Discord-style jumbo rendering only applies to messages that are all emoji. */
export function isEmojiOnly(content: string): boolean {
  const customCount = (content.match(CUSTOM_EMOJI_TOKEN) ?? []).length;
  const withoutCustom = content.replace(CUSTOM_EMOJI_TOKEN, " ");
  const emojiCount = (withoutCustom.match(EMOJI_SEQUENCE) ?? []).length;
  const total = customCount + emojiCount;
  if (total === 0 || total > 27) return false;
  return withoutCustom.replace(EMOJI_SEQUENCE, "").trim().length === 0;
}

/** Splits a plain-text run so Unicode emojis render larger than body copy. */
function renderTextWithEmoji(
  text: string,
  keyPrefix: string,
  jumbo: boolean,
): ReactNode[] {
  if (!text) return [];
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let index = 0;
  EMOJI_SEQUENCE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = EMOJI_SEQUENCE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    nodes.push(
      <span
        key={`${keyPrefix}-emoji-${index++}`}
        className={
          jumbo
            ? "inline-block text-[3rem] leading-none align-[-0.12em]"
            : "inline-block text-[1.35em] leading-none align-[-0.12em]"
        }
      >
        {match[0]}
      </span>,
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

function renderInline(
  text: string,
  keyPrefix: string,
  options: MessageRenderOptions,
): ReactNode[] {
  const nodes: ReactNode[] = [];
  const jumbo = options.jumboEmoji === true;
  let lastIndex = 0;
  let index = 0;
  INLINE_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = INLINE_PATTERN.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(
        ...renderTextWithEmoji(
          text.slice(lastIndex, match.index),
          `${keyPrefix}-${index}`,
          jumbo,
        ),
      );
    }
    const token = match[0];
    const key = `${keyPrefix}-${index++}`;
    if (token.startsWith("<:")) {
      const emojiId = match[3];
      const emoji = options.customEmojis?.find((entry) => entry.id === emojiId);
      nodes.push(
        emoji?.url ? (
          <img
            key={key}
            src={emoji.url}
            alt={`:${emoji.name}:`}
            title={`:${emoji.name}:${emoji.serverName ? ` · ${emoji.serverName}` : ""}`}
            className={`mx-0.5 inline-block object-contain align-middle ${jumbo ? "size-12" : "size-7"}`}
            loading="lazy"
          />
        ) : (
          <span key={key}>:{match[2]}:</span>
        ),
      );
    } else if (token.startsWith("<@&")) {
      const roleId = match[11];
      const role = options.roleMentions?.find((entry) => entry.id === roleId);
      nodes.push(
        <span
          key={key}
          className="inline-flex rounded bg-primary/15 px-1 font-semibold text-primary"
          style={role?.color ? { color: role.color } : undefined}
          data-role-mention={roleId}
        >
          @{role?.name ?? "unknown-role"}
        </span>,
      );
    } else if (token.startsWith("`")) {
      nodes.push(
        <code
          key={key}
          className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground/90"
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith("**")) {
      nodes.push(
        <strong key={key} className="font-semibold">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith("__")) {
      nodes.push(<u key={key}>{token.slice(2, -2)}</u>);
    } else if (token.startsWith("~~")) {
      nodes.push(
        <s key={key} className="opacity-70">
          {token.slice(2, -2)}
        </s>,
      );
    } else if (token.startsWith("*")) {
      nodes.push(
        <em key={key} className="italic">
          {token.slice(1, -1)}
        </em>,
      );
    } else if (token.startsWith("http")) {
      // When the message view can draw an inline preview, showing the raw URL
      // as well would duplicate it (and was exactly how GIFs leaked their
      // link text). The preview becomes the whole message.
      if (!(options.onMedia && isDirectMediaUrl(token))) {
        nodes.push(
          <a
            key={key}
            href={token}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="text-cyan underline decoration-cyan/40 underline-offset-2 hover:decoration-cyan"
          >
            {token}
          </a>,
        );
      }
    } else if (token.startsWith("@")) {
      const username = token.slice(1).toLowerCase();
      const massMention = username === "everyone" || username === "here";
      nodes.push(
        <button
          key={key}
          type="button"
          disabled={massMention || !options.onMention}
          className={
            massMention
              ? "cursor-default rounded bg-warning/15 px-1 font-semibold text-warning"
              : "cursor-pointer rounded bg-primary/15 px-1 font-medium text-primary hover:bg-primary/25 disabled:cursor-default"
          }
          data-mention={username}
          onClick={() => options.onMention?.(username)}
        >
          {token}
        </button>,
      );
    }
    lastIndex = match.index + token.length;
  }
  if (lastIndex < text.length) {
    nodes.push(
      ...renderTextWithEmoji(text.slice(lastIndex), `${keyPrefix}-tail`, jumbo),
    );
  }
  return nodes;
}

export function renderMessage(
  content: string,
  options: MessageRenderOptions = {},
): ReactNode[] {
  const segments = content.split(/```/);
  return segments.map((segment, index) => {
    if (index % 2 === 1) {
      const body = segment.replace(/^[a-zA-Z0-9]+\n/, "");
      return (
        <pre
          key={`code-${index}`}
          className="my-1 overflow-x-auto rounded-lg border border-border/70 bg-surface p-3 font-mono text-[13px] leading-5 text-foreground/90"
        >
          <code>{body}</code>
        </pre>
      );
    }
    const lines = segment.split("\n");
    return (
      <span key={`text-${index}`}>
        {lines.map((line, lineIndex) => (
          <span key={lineIndex}>
            {renderInline(line, `text-${index}-${lineIndex}`, options)}
            {lineIndex < lines.length - 1 ? <br /> : null}
          </span>
        ))}
      </span>
    );
  });
}

export function plainExcerpt(content: string, max = 140): string {
  const cleaned = content
    .replace(/```[\s\S]*?```/g, " [code] ")
    .replace(/<@&[a-z0-9]+>/g, "@role")
    .replace(/[*_~`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > max ? `${cleaned.slice(0, max)}…` : cleaned;
}
