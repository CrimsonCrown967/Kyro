import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  Bell,
  Bot,
  Check,
  Download,
  Hash,
  Headphones,
  LayoutTemplate,
  MessageCircle,
  MonitorSmartphone,
  Search,
  Shield,
  Smile,
  Sparkles,
  Users,
  Zap,
} from "@/components/icons";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { useQuery } from "convex/react";
import { KyroMark, KyroWordmark } from "@/components/KyroMark";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";

const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0 },
};

const COUNT_FORMAT = new Intl.NumberFormat(undefined, {
  notation: "compact",
  maximumFractionDigits: 1,
});

function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? "show" : "hidden"}
      whileInView="show"
      viewport={{ once: true, margin: "-80px" }}
      variants={fadeUp}
      transition={{ duration: 0.58, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

function FloatingSticker({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className: string;
  delay?: number;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      aria-hidden
      className={cn(
        "absolute z-20 flex select-none items-center justify-center shadow-[0_18px_45px_rgba(17,18,58,.2)]",
        className,
      )}
      animate={
        reduce
          ? undefined
          : {
              y: [0, -12, 0],
              rotate: [-3, 3, -3],
            }
      }
      transition={{
        duration: 5.2,
        delay,
        repeat: Infinity,
        ease: "easeInOut",
      }}
    >
      {children}
    </motion.div>
  );
}

function HeroChatPreview() {
  const messages = [
    {
      name: "nova",
      color: "#b8f2e6",
      text: "the new community template is live ✨",
      time: "9:41 PM",
    },
    {
      name: "mika",
      color: "#ffd6a5",
      text: "joining voice — save me a spot",
      time: "9:42 PM",
    },
    {
      name: "jay",
      color: "#cdb4ff",
      text: "/roll 20",
      time: "9:42 PM",
    },
  ];

  return (
    <div
      aria-label="Preview of the Kyro chat application"
      className="relative mx-auto w-full max-w-[68rem] rounded-[1.65rem] border-[6px] border-white/90 bg-[#16181d] p-1.5 shadow-[0_40px_100px_rgba(8,10,45,.42)] sm:rounded-[2rem] sm:border-[9px]"
    >
      <div className="overflow-hidden rounded-[1.1rem] bg-[#1f2228] sm:rounded-[1.35rem]">
        <div className="flex h-9 items-center gap-1.5 border-b border-white/5 bg-[#15171b] px-4 sm:h-11">
          <span className="size-2.5 rounded-full bg-[#ff6b6b]" />
          <span className="size-2.5 rounded-full bg-[#ffd166]" />
          <span className="size-2.5 rounded-full bg-[#65d69e]" />
          <span className="ml-2 text-[10px] font-bold uppercase tracking-[0.18em] text-white/35 sm:text-xs">
            Kyro · after hours
          </span>
        </div>
        <div className="flex h-[19rem] sm:h-[27rem] lg:h-[31rem]">
          <div className="flex w-12 shrink-0 flex-col items-center gap-2 bg-[#111318] py-3 sm:w-16">
            <span className="flex size-8 items-center justify-center rounded-xl bg-[#5865f2] sm:size-10">
              <KyroMark className="size-5 sm:size-7" />
            </span>
            {["🎮", "🎨", "☕", "🎵"].map((emoji, index) => (
              <span
                key={emoji}
                className={cn(
                  "flex size-8 items-center justify-center rounded-full bg-[#272a31] text-sm sm:size-10 sm:text-lg",
                  index === 1 && "rounded-xl ring-2 ring-[#8b93ff]",
                )}
              >
                {emoji}
              </span>
            ))}
            <span className="mt-1 flex size-8 items-center justify-center rounded-full border border-dashed border-white/20 text-lg text-white/45 sm:size-10">
              +
            </span>
          </div>

          <div className="hidden w-44 shrink-0 bg-[#1a1c21] sm:block lg:w-56">
            <div className="flex h-12 items-center justify-between border-b border-black/25 px-4">
              <span className="text-sm font-bold text-white">After Hours</span>
              <span className="text-white/35">⌄</span>
            </div>
            <div className="space-y-4 p-3">
              <div>
                <p className="mb-1 px-2 text-[10px] font-black uppercase tracking-[0.14em] text-white/35">
                  Start here
                </p>
                {["welcome", "announcements"].map((channel) => (
                  <p
                    key={channel}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium text-white/45 lg:text-sm"
                  >
                    <Hash className="size-3.5" /> {channel}
                  </p>
                ))}
              </div>
              <div>
                <p className="mb-1 px-2 text-[10px] font-black uppercase tracking-[0.14em] text-white/35">
                  Community
                </p>
                {["general", "media", "bot-lab"].map((channel, index) => (
                  <p
                    key={channel}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium lg:text-sm",
                      index === 0 ? "bg-white/10 text-white" : "text-white/45",
                    )}
                  >
                    <Hash className="size-3.5" /> {channel}
                    {channel === "general" ? (
                      <span className="ml-auto flex size-4 items-center justify-center rounded-full bg-[#f23f43] text-[8px] font-black text-white">
                        3
                      </span>
                    ) : null}
                  </p>
                ))}
              </div>
              <div>
                <p className="mb-1 px-2 text-[10px] font-black uppercase tracking-[0.14em] text-white/35">
                  Voice
                </p>
                <p className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium text-white/45 lg:text-sm">
                  <Headphones className="size-3.5" /> The couch
                </p>
              </div>
            </div>
          </div>

          <div className="flex min-w-0 flex-1 flex-col bg-[#22252b]">
            <div className="flex h-12 items-center gap-2 border-b border-black/20 px-3 sm:px-5">
              <Hash className="size-4 text-white/35" />
              <span className="text-xs font-bold text-white sm:text-sm">
                general
              </span>
              <span className="hidden truncate text-xs text-white/30 md:block">
                where the whole crew hangs out
              </span>
              <Search className="ml-auto size-4 text-white/35" />
            </div>

            <div className="flex-1 space-y-3 overflow-hidden px-3 py-4 sm:px-5 sm:py-5">
              <div className="mb-4 hidden rounded-lg border border-[#5865f2]/20 bg-[#5865f2]/10 p-3 md:block">
                <p className="text-xs font-bold text-[#aeb4ff]">
                  Welcome to #general!
                </p>
                <p className="mt-0.5 text-[11px] text-white/35">
                  This is the beginning of the conversation.
                </p>
              </div>
              {messages.map((message, index) => (
                <div key={message.name} className="flex gap-2.5 sm:gap-3">
                  <span
                    className="flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-black uppercase text-[#22252b] sm:size-9 sm:text-xs"
                    style={{ backgroundColor: message.color }}
                  >
                    {message.name.slice(0, 2)}
                  </span>
                  <div className="min-w-0">
                    <p className="flex items-baseline gap-2">
                      <span className="text-[11px] font-bold text-white sm:text-sm">
                        {message.name}
                      </span>
                      <span className="text-[8px] text-white/25 sm:text-[10px]">
                        {message.time}
                      </span>
                    </p>
                    <p className="truncate text-[11px] leading-5 text-white/65 sm:text-sm sm:leading-6">
                      {message.text}
                    </p>
                    {index === 2 ? (
                      <div className="mt-2 rounded-lg border border-[#5865f2]/20 bg-[#191b20] px-3 py-2 text-[10px] text-white/65 sm:text-xs">
                        <span className="mr-1.5 rounded bg-[#5865f2] px-1 py-0.5 text-[8px] font-black uppercase text-white">
                          Bot
                        </span>
                        🎲 jay rolled <strong className="text-white">18</strong>
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
            <div className="mx-3 mb-3 flex h-10 items-center rounded-lg bg-[#34373f] px-3 text-[10px] text-white/30 sm:mx-5 sm:mb-5 sm:h-12 sm:text-xs">
              Message #general
              <Smile className="ml-auto size-4" />
            </div>
          </div>

          <div className="hidden w-44 shrink-0 bg-[#1c1e24] p-4 lg:block">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/30">
              Online — 4
            </p>
            <div className="mt-3 space-y-3">
              {["nova", "mika", "jay", "sol"].map((name, index) => (
                <div key={name} className="flex items-center gap-2">
                  <span
                    className="relative flex size-7 items-center justify-center rounded-full text-[9px] font-black uppercase text-[#202228]"
                    style={{
                      backgroundColor: [
                        "#b8f2e6",
                        "#ffd6a5",
                        "#cdb4ff",
                        "#a0c4ff",
                      ][index],
                    }}
                  >
                    {name.slice(0, 2)}
                    <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-[#1c1e24] bg-[#23a55a]" />
                  </span>
                  <span className="text-xs font-semibold text-white/55">
                    {name}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function EmojiScene() {
  return (
    <div className="relative min-h-[22rem] overflow-hidden rounded-[2rem] bg-[#24273d] p-5 shadow-[0_28px_60px_rgba(26,27,73,.24)] sm:min-h-[28rem] sm:p-8">
      <div className="absolute -right-12 -top-16 size-52 rounded-full bg-[#ffcc70]/25 blur-2xl" />
      <div className="absolute -bottom-20 -left-14 size-56 rounded-full bg-[#9d7cff]/30 blur-2xl" />
      <div className="relative mx-auto max-w-md rounded-2xl border border-white/10 bg-[#17191f] p-3 shadow-2xl sm:p-4">
        <div className="flex h-9 items-center rounded-lg bg-[#292c34] px-3 text-xs text-white/35">
          Search emojis
          <Search className="ml-auto size-3.5" />
        </div>
        <div className="mt-3 flex gap-2 border-b border-white/5 pb-3 text-lg">
          <span className="rounded-md bg-[#5865f2]/25 p-1.5">🕘</span>
          <span className="rounded-md p-1.5">⭐</span>
          <span className="rounded-md p-1.5">😀</span>
          <span className="rounded-md p-1.5">🍕</span>
          <span className="rounded-md p-1.5">🎮</span>
          <span className="rounded-md p-1.5">🚀</span>
        </div>
        <p className="mt-3 text-[10px] font-black uppercase tracking-[0.14em] text-white/30">
          After Hours
        </p>
        <div className="mt-2 grid grid-cols-7 gap-1.5 sm:grid-cols-8">
          {[
            "😂",
            "🥹",
            "🫡",
            "🤝",
            "✨",
            "💀",
            "🔥",
            "🎉",
            "👀",
            "🧠",
            "🚀",
            "🎮",
            "☕",
            "🌈",
            "💜",
            "🛸",
            "🥳",
            "😎",
            "🫶",
            "⚡",
            "🏆",
            "🍿",
            "🎧",
            "🪄",
          ].map((emoji, index) => (
            <span
              key={`${emoji}-${index}`}
              className={cn(
                "flex aspect-square items-center justify-center rounded-lg text-xl hover:bg-white/10 sm:text-2xl",
                index === 4 && "bg-[#5865f2]/20 ring-1 ring-[#7e86ff]",
              )}
            >
              {emoji}
            </span>
          ))}
        </div>
      </div>
      <FloatingSticker className="bottom-6 right-6 size-16 rounded-[1.25rem] bg-[#ffd166] text-3xl sm:size-20 sm:text-4xl">
        ✨
      </FloatingSticker>
    </div>
  );
}

function VoiceScene() {
  const people = [
    ["NO", "#b8f2e6"],
    ["MI", "#ffd6a5"],
    ["JA", "#cdb4ff"],
  ] as const;
  return (
    <div className="relative min-h-[22rem] overflow-hidden rounded-[2rem] bg-[#dfe2ff] p-5 shadow-[0_28px_60px_rgba(26,27,73,.18)] sm:min-h-[28rem] sm:p-8">
      <div className="absolute inset-x-0 bottom-0 h-28 bg-[#aeb5ff]" />
      <div className="relative mx-auto max-w-md rounded-[1.6rem] border-4 border-white bg-[#1b1d23] p-4 shadow-2xl sm:p-6">
        <div className="flex items-center gap-2 text-white">
          <span className="flex size-9 items-center justify-center rounded-xl bg-[#5865f2]">
            <Headphones className="size-4" />
          </span>
          <div>
            <p className="text-sm font-bold">The couch</p>
            <p className="text-[10px] text-white/35">Voice connected</p>
          </div>
          <span className="ml-auto size-2 animate-pulse rounded-full bg-[#23a55a]" />
        </div>
        <div className="mt-5 grid grid-cols-3 gap-2 sm:gap-3">
          {people.map(([initials, color], index) => (
            <div
              key={initials}
              className="rounded-xl bg-[#2b2e36] p-2 text-center sm:p-3"
            >
              <span
                className="mx-auto flex aspect-square w-full max-w-20 items-center justify-center rounded-xl text-lg font-black text-[#24262c] sm:text-xl"
                style={{ backgroundColor: color }}
              >
                {initials}
              </span>
              <p className="mt-2 text-[9px] font-bold text-white/60 sm:text-[11px]">
                {["nova", "mika", "jay"][index]}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-5 flex justify-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-full bg-[#34373f] text-white/65">
            <MessageCircle className="size-4" />
          </span>
          <span className="flex size-9 items-center justify-center rounded-full bg-[#34373f] text-white/65">
            <MonitorSmartphone className="size-4" />
          </span>
          <span className="flex size-9 items-center justify-center rounded-full bg-[#ef4444] text-white">
            ×
          </span>
        </div>
      </div>
      <FloatingSticker className="left-5 top-5 size-14 rounded-full bg-white text-2xl sm:size-20 sm:text-4xl">
        🎧
      </FloatingSticker>
    </div>
  );
}

function TemplateScene() {
  const rows = [
    { icon: "👋", title: "Community Hub", channels: 7, color: "#5865f2" },
    { icon: "🎮", title: "Gaming Squad", channels: 7, color: "#9b6dff" },
    { icon: "📚", title: "Study Group", channels: 6, color: "#00a8a8" },
  ];
  return (
    <div className="relative min-h-[22rem] overflow-hidden rounded-[2rem] bg-[#ffe6a7] p-5 shadow-[0_28px_60px_rgba(26,27,73,.18)] sm:min-h-[28rem] sm:p-8">
      <div className="absolute -right-14 -top-14 size-48 rounded-full bg-[#ff8fab]/35" />
      <div className="relative mx-auto max-w-md rounded-2xl border-4 border-white bg-[#f8f9ff] p-4 text-[#222338] shadow-2xl sm:p-5">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-[#5865f2] text-white">
            <LayoutTemplate className="size-5" />
          </span>
          <div>
            <p className="text-sm font-black">Start from a template</p>
            <p className="text-[10px] text-[#686a82]">
              Built by Kyro and the community
            </p>
          </div>
        </div>
        <div className="mt-4 space-y-2.5">
          {rows.map((row, index) => (
            <div
              key={row.title}
              className={cn(
                "flex items-center gap-3 rounded-xl border p-3",
                index === 1
                  ? "border-[#5865f2]/40 bg-[#eef0ff]"
                  : "border-[#dde0ed] bg-white",
              )}
            >
              <span
                className="flex size-10 items-center justify-center rounded-xl text-xl"
                style={{ backgroundColor: `${row.color}20` }}
              >
                {row.icon}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-black sm:text-sm">
                  {row.title}
                </p>
                <p className="text-[9px] text-[#7a7d92] sm:text-[10px]">
                  {row.channels} channels · roles included
                </p>
              </div>
              <span className="rounded-full bg-[#5865f2] px-2.5 py-1 text-[9px] font-black text-white">
                Use
              </span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-dashed border-[#adb0c5] px-3 py-2 text-[10px] font-bold text-[#686a82]">
          <Download className="size-3.5" /> Import a Discord template
        </div>
      </div>
      <FloatingSticker className="bottom-5 right-4 size-16 rounded-[1.2rem] bg-[#ff6b9d] text-3xl sm:size-20 sm:text-4xl">
        🚀
      </FloatingSticker>
    </div>
  );
}

function FeatureStory({
  eyebrow,
  title,
  body,
  visual,
  reverse = false,
}: {
  eyebrow: string;
  title: string;
  body: string;
  visual: ReactNode;
  reverse?: boolean;
}) {
  return (
    <section className="mx-auto grid max-w-7xl items-center gap-9 px-5 py-12 sm:px-8 sm:py-16 lg:grid-cols-2 lg:gap-20 lg:py-24">
      <Reveal className={cn(reverse && "lg:order-2")}>{visual}</Reveal>
      <Reveal delay={0.08} className={cn(reverse && "lg:order-1")}>
        <p className="text-xs font-black uppercase tracking-[0.2em] text-[#5865f2]">
          {eyebrow}
        </p>
        <h2 className="mt-4 max-w-xl text-balance text-4xl font-black uppercase leading-[0.94] tracking-[-0.045em] text-[#17182b] sm:text-5xl lg:text-6xl">
          {title}
        </h2>
        <p className="mt-6 max-w-xl text-base leading-7 text-[#55586f] sm:text-lg sm:leading-8">
          {body}
        </p>
      </Reveal>
    </section>
  );
}

const QUICK_FEATURES = [
  {
    icon: MessageCircle,
    title: "Text that keeps up",
    body: "Replies, reactions, GIFs, rich uploads, formatting and searchable history.",
  },
  {
    icon: Bell,
    title: "Pings you can trust",
    body: "Numbered mentions, reply alerts, sounds and notification controls per channel.",
  },
  {
    icon: Bot,
    title: "Bots built right in",
    body: "Slash commands and custom responses without another hosting bill.",
  },
  {
    icon: Shield,
    title: "Serious moderation",
    body: "Roles, AutoMod, reports, timeouts, kicks, bans and a proper audit trail.",
  },
];

export default function Landing() {
  const stats = useQuery(api.platformStats.get);

  return (
    <div className="min-h-screen overflow-hidden bg-[#f7f7ff] text-[#17182b]">
      <div className="relative isolate overflow-hidden bg-[#5865f2] text-white">
        <div className="landing-star-field pointer-events-none absolute inset-0 opacity-70" />
        <div className="pointer-events-none absolute -left-24 top-28 size-[28rem] rounded-full bg-[#9c73ff]/45 blur-[90px]" />
        <div className="pointer-events-none absolute -right-32 top-8 size-[32rem] rounded-full bg-[#55d6ff]/30 blur-[100px]" />

        <header className="relative z-50 border-b border-white/10 bg-[#5865f2]/75 backdrop-blur-xl">
          <div className="mx-auto flex h-20 max-w-7xl items-center gap-6 px-5 sm:px-8">
            <Link to="/" aria-label="Kyro home" className="shrink-0 text-white">
              <KyroWordmark className="text-white [&_span]:font-black" />
            </Link>
            <nav className="mx-auto hidden items-center gap-7 text-sm font-bold text-white/85 lg:flex">
              <a className="transition hover:text-white" href="#features">
                Features
              </a>
              <a className="transition hover:text-white" href="#templates">
                Templates
              </a>
              <a className="transition hover:text-white" href="#safety">
                Safety
              </a>
              <Link
                className="transition hover:text-white"
                to="/dashboard/discover"
              >
                Discover
              </Link>
            </nav>
            <Link
              to="/auth?returnTo=/dashboard"
              className="ml-auto inline-flex h-10 items-center rounded-full bg-white px-5 text-sm font-bold text-[#20224a] shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
            >
              Open Kyro
            </Link>
          </div>
        </header>

        <main>
          <section className="relative mx-auto max-w-7xl px-5 pb-36 pt-16 sm:px-8 sm:pb-44 sm:pt-24 lg:pt-28">
            <FloatingSticker className="-left-5 top-40 hidden size-20 rounded-[1.6rem] bg-[#ffd166] text-4xl lg:flex xl:-left-16">
              🎮
            </FloatingSticker>
            <FloatingSticker
              delay={0.8}
              className="-right-2 top-52 hidden size-20 rounded-full bg-[#b8f2e6] text-4xl lg:flex xl:-right-12"
            >
              💬
            </FloatingSticker>

            <Reveal className="relative z-10 mx-auto max-w-5xl text-center">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-white/90 backdrop-blur">
                <Sparkles className="size-3.5" /> Free communities, fully loaded
              </span>
              <h1 className="mx-auto mt-7 max-w-5xl text-balance text-5xl font-black uppercase leading-[0.88] tracking-[-0.055em] text-white sm:text-7xl lg:text-[6.6rem]">
                Your people.
                <br />
                Your place.
                <br />
                <span className="text-[#c9cdfd]">Your Kyro.</span>
              </h1>
              <p className="mx-auto mt-7 max-w-2xl text-pretty text-base leading-7 text-white/80 sm:text-xl sm:leading-8">
                Group chat, voice rooms, forums, bots and community tools in one
                place built for hanging out—not upgrading a subscription.
              </p>
              <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link
                  to="/auth"
                  className="inline-flex h-14 w-full items-center justify-center rounded-full bg-white px-8 text-base font-black text-[#242650] shadow-[0_12px_35px_rgba(15,18,70,.24)] transition hover:-translate-y-1 hover:shadow-[0_18px_45px_rgba(15,18,70,.3)] sm:w-auto"
                >
                  <Zap className="mr-2 size-5" /> Start chatting free
                </Link>
                <Link
                  to="/dashboard"
                  className="inline-flex h-14 w-full items-center justify-center rounded-full bg-[#20224a] px-8 text-base font-black text-white shadow-[0_12px_35px_rgba(15,18,70,.24)] transition hover:-translate-y-1 hover:bg-[#171936] sm:w-auto"
                >
                  Open in your browser <ArrowRight className="ml-2 size-4" />
                </Link>
              </div>
            </Reveal>

            <Reveal delay={0.15} className="relative z-10 mt-16 sm:mt-20">
              <HeroChatPreview />
            </Reveal>

            <div className="absolute inset-x-0 bottom-0 z-0 h-40 overflow-hidden">
              <div className="absolute -bottom-28 left-1/2 h-56 w-[130%] -translate-x-1/2 rounded-[50%] bg-[#f7f7ff]" />
            </div>
          </section>
        </main>
      </div>

      <section className="relative z-20 -mt-16 px-5 sm:-mt-20 sm:px-8">
        <div className="mx-auto grid max-w-5xl grid-cols-3 overflow-hidden rounded-2xl border border-[#dfe1f3] bg-white shadow-[0_22px_60px_rgba(28,31,84,.13)]">
          {[
            ["People", stats?.users],
            ["Communities", stats?.communities],
            ["Online now", stats?.onlineMembers],
          ].map(([label, value], index) => (
            <div
              key={String(label)}
              className={cn(
                "px-2 py-5 text-center sm:px-6 sm:py-7",
                index > 0 && "border-l border-[#e7e8f5]",
              )}
            >
              <p className="text-2xl font-black tracking-tight text-[#17182b] sm:text-4xl">
                {typeof value === "number" ? COUNT_FORMAT.format(value) : "—"}
              </p>
              <p className="mt-1 text-[9px] font-black uppercase tracking-[0.14em] text-[#66697f] sm:text-xs">
                {label}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-5 pb-12 pt-28 text-center sm:px-8 sm:pb-20 sm:pt-36">
        <Reveal>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-[#5865f2]">
            Made for the group chat
          </p>
          <h2 className="mt-5 text-balance text-4xl font-black uppercase leading-[0.92] tracking-[-0.045em] text-[#17182b] sm:text-6xl lg:text-7xl">
            Hang out without hitting a paywall
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-[#606378] sm:text-lg sm:leading-8">
            Every member gets the same chat, voice, moderation and customization
            tools. No premium rooms. No feature gates. No awkward upgrade pitch.
          </p>
        </Reveal>
      </section>

      <div id="features" className="scroll-mt-24">
        <FeatureStory
          eyebrow="Make it yours"
          title="Every chat should feel like your chat"
          body="Use more emoji, save your favorite GIFs, style your profile, set a custom status and bring in emojis from every community you belong to. Kyro keeps your recents and favorites synced wherever you sign in."
          visual={<EmojiScene />}
        />
        <FeatureStory
          reverse
          eyebrow="Drop into voice"
          title="Hop in when the crew is around"
          body="Join a voice room without starting a formal call. See who is online, move between rooms, share your screen and keep the conversation going in text before and after everyone leaves."
          visual={<VoiceScene />}
        />
        <div id="templates" className="scroll-mt-24">
          <FeatureStory
            eyebrow="Build faster"
            title="A whole community in a couple of clicks"
            body="Start with a built-in layout, publish your own community template or bring over categories, channels and roles from a public Discord template. Your structure moves; private messages and members do not."
            visual={<TemplateScene />}
          />
        </div>
      </div>

      <section className="overflow-hidden bg-[#20224a] py-8 text-white sm:py-10">
        <div className="flex min-w-max items-center gap-5 px-5 text-2xl font-black uppercase tracking-[-0.03em] sm:gap-8 sm:text-4xl lg:text-5xl">
          {["Talk", "Play", "Build", "Belong", "Create", "Moderate"].map(
            (word) => (
              <span key={word} className="flex items-center gap-5 sm:gap-8">
                {word}
                <KyroMark className="size-7 opacity-70 sm:size-10" />
              </span>
            ),
          )}
        </div>
      </section>

      <section className="bg-white px-5 py-20 sm:px-8 sm:py-28">
        <div className="mx-auto max-w-7xl">
          <Reveal className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-[#5865f2]">
              Everything included
            </p>
            <h2 className="mt-5 text-balance text-4xl font-black uppercase leading-[0.94] tracking-[-0.045em] sm:text-6xl">
              More ways to be together
            </h2>
          </Reveal>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {QUICK_FEATURES.map((feature, index) => (
              <Reveal key={feature.title} delay={index * 0.06}>
                <article className="h-full rounded-[1.6rem] border border-[#e3e4f0] bg-[#f7f7ff] p-6 transition duration-300 hover:-translate-y-1 hover:border-[#bfc3ff] hover:shadow-[0_20px_45px_rgba(36,38,91,.1)]">
                  <span className="flex size-12 items-center justify-center rounded-2xl bg-[#5865f2] text-white">
                    <feature.icon className="size-5" />
                  </span>
                  <h3 className="mt-5 text-lg font-black text-[#191a2f]">
                    {feature.title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-[#65687d]">
                    {feature.body}
                  </p>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section
        id="safety"
        className="scroll-mt-24 bg-[#dfe2ff] px-5 py-20 sm:px-8 sm:py-28"
      >
        <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[.8fr_1.2fr] lg:items-center">
          <Reveal>
            <span className="flex size-14 items-center justify-center rounded-2xl bg-[#20224a] text-white">
              <Shield className="size-7" />
            </span>
            <p className="mt-7 text-xs font-black uppercase tracking-[0.22em] text-[#5865f2]">
              Your space, your rules
            </p>
            <h2 className="mt-4 text-balance text-4xl font-black uppercase leading-[0.94] tracking-[-0.045em] sm:text-6xl">
              Friendly by design. Serious when needed.
            </h2>
            <p className="mt-6 max-w-xl text-base leading-7 text-[#55586f] sm:text-lg sm:leading-8">
              Permissions and moderation run on the server, not on trust. Owners
              choose who can speak, invite, manage roles or moderate members.
            </p>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                [
                  "AutoMod",
                  "Stop spam, invite links and blocked words before they post.",
                ],
                [
                  "Role permissions",
                  "Delegate exactly the powers each team member needs.",
                ],
                [
                  "Audit history",
                  "See what moderators changed and when they changed it.",
                ],
                [
                  "Privacy controls",
                  "Control DMs, friend requests, presence and blocking.",
                ],
                [
                  "Read-only spaces",
                  "Keep rules and announcements clean and focused.",
                ],
                [
                  "Account controls",
                  "Review sessions, export data or delete the account.",
                ],
              ].map(([title, body], index) => (
                <div
                  key={title}
                  className="rounded-2xl border border-white/70 bg-white/70 p-5 backdrop-blur"
                >
                  <span className="flex size-8 items-center justify-center rounded-full bg-[#5865f2] text-white">
                    <Check className="size-4" />
                  </span>
                  <h3 className="mt-4 font-black">{title}</h3>
                  <p className="mt-1.5 text-sm leading-6 text-[#66697d]">
                    {body}
                  </p>
                  <span className="sr-only">Safety feature {index + 1}</span>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      <section className="relative isolate overflow-hidden bg-[#5865f2] px-5 py-24 text-center text-white sm:px-8 sm:py-32">
        <div className="landing-star-field pointer-events-none absolute inset-0 opacity-60" />
        <div className="pointer-events-none absolute -left-20 bottom-0 size-72 rounded-full bg-[#9d7cff]/45 blur-[80px]" />
        <div className="pointer-events-none absolute -right-20 top-0 size-72 rounded-full bg-[#55d6ff]/30 blur-[80px]" />
        <FloatingSticker className="left-[8%] top-16 hidden size-20 rounded-[1.5rem] bg-[#ffd166] text-4xl md:flex">
          👋
        </FloatingSticker>
        <FloatingSticker
          delay={0.7}
          className="bottom-12 right-[9%] hidden size-20 rounded-full bg-[#b8f2e6] text-4xl md:flex"
        >
          🚀
        </FloatingSticker>
        <Reveal className="relative z-10 mx-auto max-w-4xl">
          <h2 className="text-balance text-5xl font-black uppercase leading-[0.9] tracking-[-0.05em] sm:text-7xl lg:text-8xl">
            You reached the end.
            <br />
            Better go chat.
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-base leading-7 text-white/75 sm:text-lg">
            Claim your handle, bring your people and make a place that feels
            like yours. Every feature is ready from day one.
          </p>
          <Link
            to="/auth"
            className="mt-9 inline-flex h-14 items-center rounded-full bg-white px-8 text-base font-black text-[#25274f] shadow-[0_16px_40px_rgba(16,18,67,.28)] transition hover:-translate-y-1 hover:shadow-[0_22px_50px_rgba(16,18,67,.35)]"
          >
            Join Kyro free <ArrowRight className="ml-2 size-5" />
          </Link>
        </Reveal>
      </section>

      <footer className="bg-[#111225] px-5 py-14 text-white sm:px-8 sm:py-20">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-12 border-b border-white/10 pb-12 sm:grid-cols-2 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
            <div>
              <KyroWordmark className="text-white [&_span]:font-black" />
              <p className="mt-4 max-w-xs text-sm leading-6 text-white/50">
                Connect. Play. Belong. A free communication platform for every
                kind of community.
              </p>
              <div className="mt-6 flex gap-2">
                {[MessageCircle, Users, Sparkles].map((Icon, index) => (
                  <span
                    key={index}
                    className="flex size-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/60"
                  >
                    <Icon className="size-4" />
                  </span>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#8b93ff]">
                Product
              </p>
              <div className="mt-4 space-y-3 text-sm text-white/60">
                <a className="block hover:text-white" href="#features">
                  Features
                </a>
                <Link
                  className="block hover:text-white"
                  to="/dashboard/discover"
                >
                  Discover
                </Link>
                <Link className="block hover:text-white" to="/dashboard">
                  Open Kyro
                </Link>
              </div>
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#8b93ff]">
                Community
              </p>
              <div className="mt-4 space-y-3 text-sm text-white/60">
                <a className="block hover:text-white" href="#templates">
                  Templates
                </a>
                <a className="block hover:text-white" href="#safety">
                  Safety
                </a>
                <Link className="block hover:text-white" to="/auth">
                  Create account
                </Link>
              </div>
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#8b93ff]">
                Policies
              </p>
              <div className="mt-4 space-y-3 text-sm text-white/60">
                <Link className="block hover:text-white" to="/terms">
                  Terms
                </Link>
                <Link className="block hover:text-white" to="/privacy">
                  Privacy
                </Link>
                <Link className="block hover:text-white" to="/auth">
                  Sign in
                </Link>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-3 pt-8 text-xs text-white/60 sm:flex-row sm:items-center sm:justify-between">
            <p>© {new Date().getFullYear()} Kyro. Built for belonging.</p>
            <p>No premium tier. No paywalled features. No fine print.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
