import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  Bell,
  Check,
  Hash,
  Headphones,
  MessageCircle,
  MonitorSmartphone,
  Search,
  Shield,
  Smile,
  Sparkles,
  Users,
  Wrench,
  Zap,
} from "@/components/icons";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { useQuery } from "convex/react";
import { KyroWordmark } from "@/components/KyroMark";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";

const fadeUp = {
  hidden: { opacity: 0, y: 18 },
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
      transition={{ duration: 0.5, delay, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}

const FEATURES: {
  icon: typeof Hash;
  title: string;
  body: string;
}[] = [
  {
    icon: Hash,
    title: "Servers & channels",
    body: "Organise communities into categories and channels, with topics, slow mode and read-only announcements.",
  },
  {
    icon: MessageCircle,
    title: "DMs and group chats",
    body: "Direct messages with friends, group DMs for your squad, read receipts, replies and rich attachments.",
  },
  {
    icon: Shield,
    title: "Roles & moderation",
    body: "Role colours, permissions, kicks, bans, an audit log and member reports — all enforced on the server.",
  },
  {
    icon: Search,
    title: "Search that reaches",
    body: "One command palette across people, messages and communities, scoped to what you can actually see.",
  },
  {
    icon: Bell,
    title: "Inbox & mentions",
    body: "Every mention, reply and friend request lands in one inbox with unread counts and deep links.",
  },
  {
    icon: Users,
    title: "Friends & presence",
    body: "Friend requests, blocking, custom statuses and online presence with an invisible mode that stays invisible.",
  },
  {
    icon: Sparkles,
    title: "Your own identity",
    body: "Unique @handles, avatars, bios, accent colours and denser or roomier message layouts.",
  },
  {
    icon: Wrench,
    title: "Invites & discovery",
    body: "Shareable invite codes, public community discovery, welcome messages and rules shown to newcomers.",
  },
];

const USE_CASES = [
  {
    title: "Gaming clans",
    body: "Channels per game, roles per rank, and a raid-ready inbox when someone pings the whole party.",
    icon: Zap,
  },
  {
    title: "Study & clubs",
    body: "Announcement channels that are read-only, slow mode for exam season, and mod tools volunteers can actually use.",
    icon: Headphones,
  },
  {
    title: "Friend groups",
    body: "Private communities with shared photos, group DMs and presence so you know who's around.",
    icon: Smile,
  },
  {
    title: "Teams & projects",
    body: "Public or invite-only, searchable history, an audit trail, and no invoice at the end of the month.",
    icon: MonitorSmartphone,
  },
];

const STEPS = [
  {
    step: "01",
    title: "Create your handle",
    body: "Create an account with your email and password, then claim a unique @username that's yours.",
  },
  {
    step: "02",
    title: "Join or start a community",
    body: "Discover public communities, redeem an invite code, or spin up your own with channels and roles in seconds.",
  },
  {
    step: "03",
    title: "Talk, share, run it",
    body: "Message, react, attach, moderate and search — the whole loop works from the first minute.",
  },
];

export default function Landing() {
  const stats = useQuery(api.platformStats.get);
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ── Nav ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-20 max-w-7xl items-center gap-6 px-4 sm:px-6">
          <Link to="/" className="shrink-0">
            <KyroWordmark />
          </Link>
          <nav className="mx-auto hidden items-center gap-1 text-sm font-medium text-muted-foreground md:flex">
            <a
              href="#features"
              className="rounded-md px-3 py-2 transition-colors hover:bg-surface hover:text-foreground"
            >
              Features
            </a>
            <a
              href="#free"
              className="rounded-md px-3 py-2 transition-colors hover:bg-surface hover:text-foreground"
            >
              Free forever
            </a>
            <a
              href="#use-cases"
              className="rounded-md px-3 py-2 transition-colors hover:bg-surface hover:text-foreground"
            >
              Use cases
            </a>
            <a
              href="#safety"
              className="rounded-md px-3 py-2 transition-colors hover:bg-surface hover:text-foreground"
            >
              Safety
            </a>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Button asChild variant="ghost" className="hidden sm:inline-flex">
              <Link to="/auth">Sign in</Link>
            </Button>
            <Button asChild>
              <Link to="/auth">
                Open Kyro <ArrowRight className="ml-1.5 size-4" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* prettier-ignore */}
      <main>
      {/* ── Hero ────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="kyro-grid pointer-events-none absolute inset-0 opacity-70" />
        <div className="kyro-orb pointer-events-none absolute -top-24 left-1/2 h-96 w-[46rem] -translate-x-1/2" />
        <div className="relative mx-auto max-w-7xl px-4 pb-0 pt-12 sm:px-6 sm:pt-20">
          <div className="grid min-h-[42rem] items-center gap-12 pb-16 lg:grid-cols-[minmax(0,.85fr)_minmax(34rem,1.25fr)] lg:gap-16">
            <Reveal className="max-w-2xl text-left">
              <span className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-surface px-3 py-1 text-xs font-medium text-muted-foreground">
                <span className="size-1.5 rounded-full bg-success" />
                Completely free · no premium tier · no subscriptions
              </span>
              <h1 className="mt-7 text-balance text-5xl font-black leading-[0.96] tracking-[-0.055em] sm:text-7xl">
                A community platform built{" "}
                <span className="kyro-gradient-text">around you.</span>
              </h1>
              <p className="mt-7 max-w-xl text-pretty text-base leading-8 text-muted-foreground sm:text-lg">
                Chat, voice, forums, discovery, community tools and safer
                account security for friends, creators and online communities.
                Every feature stays free.
              </p>
              <div className="mt-9 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                <Button asChild size="lg" className="h-11 px-6">
                  <Link to="/auth">
                    Get started free <ArrowRight className="ml-2 size-4" />
                  </Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="h-11 px-6"
                >
                  <Link to="/auth?returnTo=/dashboard">Open the app</Link>
                </Button>
              </div>
              <p className="mt-4 text-xs text-muted-foreground">
                Email and password sign-up — no credit card, ever.
              </p>
            </Reveal>

            {/* App preview, drawn from the real interface's shape. */}
            <Reveal delay={0.15} className="min-w-0 lg:-mr-10">
              <div className="relative mx-auto max-w-5xl overflow-hidden rounded-2xl border border-border/70 bg-panel shadow-[0_30px_90px_rgba(35,45,110,.22)]">
                <div className="flex h-9 items-center gap-1.5 border-b border-border/60 bg-surface px-4">
                  <span className="size-2.5 rounded-full bg-destructive/70" />
                  <span className="size-2.5 rounded-full bg-warning/70" />
                  <span className="size-2.5 rounded-full bg-success/70" />
                  <span className="ml-3 truncate text-[11px] text-muted-foreground">
                    kyro · midnight raiders
                  </span>
                </div>
                <div className="flex h-72 sm:h-80">
                  {/* rail */}
                  <div className="flex w-14 shrink-0 flex-col items-center gap-2 border-r border-border/60 bg-rail py-3">
                    {[0, 1, 2].map((item) => (
                      <span
                        key={item}
                        className={`size-9 rounded-2xl ${item === 0 ? "kyro-gradient-bg" : "bg-surface"} transition-all`}
                      />
                    ))}
                    <span className="mt-1 size-9 rounded-2xl border border-dashed border-border text-muted-foreground">
                      <span className="flex h-full items-center justify-center text-lg leading-none">
                        +
                      </span>
                    </span>
                  </div>
                  {/* sidebar */}
                  <div className="hidden w-52 shrink-0 border-r border-border/60 bg-sidebar p-3 sm:block">
                    <p className="px-1 pb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Midnight Raiders
                    </p>
                    {[
                      "announce",
                      "general",
                      "raid-planning",
                      "clips-and-highlights",
                    ].map((channel, index) => (
                      <p
                        key={channel}
                        className={`truncate rounded px-2 py-1.5 text-sm ${
                          index === 1
                            ? "bg-sidebar-accent text-foreground"
                            : "text-muted-foreground"
                        }`}
                      >
                        # {channel}
                      </p>
                    ))}
                    <p className="px-1 pb-1 pt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Voice lounge
                    </p>
                    {["Lobby", "Strategy"].map((room) => (
                      <p
                        key={room}
                        className="truncate px-2 py-1.5 text-sm text-muted-foreground"
                      >
                        ⌁ {room}
                      </p>
                    ))}
                  </div>
                  {/* chat */}
                  <div className="flex min-w-0 flex-1 flex-col bg-panel">
                    <div className="flex items-center gap-2 border-b border-border/60 px-4 py-2.5">
                      <span className="text-muted-foreground">#</span>
                      <span className="text-sm font-semibold">general</span>
                      <span className="hidden truncate text-xs text-muted-foreground sm:block">
                        zero spoilers, please
                      </span>
                    </div>
                    <div className="flex-1 space-y-3.5 overflow-hidden p-4">
                      {[
                        {
                          name: "nova",
                          time: "21:04",
                          text: "patch notes dropped — buffed our strat 🎉",
                        },
                        {
                          name: "kai",
                          time: "21:05",
                          text: "reading them now, queue in 10?",
                        },
                        {
                          name: "mira",
                          time: "21:06",
                          text: "mods moved the scrim to #raid-planning",
                        },
                      ].map((message) => (
                        <div key={message.name} className="flex gap-3">
                          <span
                            className="size-8 shrink-0 rounded-full"
                            style={{
                              background: `linear-gradient(135deg, var(--brand), var(--cyan))`,
                            }}
                          />
                          <div className="min-w-0">
                            <p className="flex items-baseline gap-2">
                              <span className="text-sm font-semibold text-primary">
                                {message.name}
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                {message.time}
                              </span>
                            </p>
                            <p className="truncate text-sm text-foreground/90">
                              {message.text}
                            </p>
                          </div>
                        </div>
                      ))}
                      <div className="mt-4 flex h-9 items-center gap-2 rounded-lg border border-border/60 bg-surface px-3 text-sm text-muted-foreground">
                        Message #general
                      </div>
                    </div>
                  </div>
                  {/* members */}
                  <div className="hidden w-40 shrink-0 border-l border-border/60 bg-panel p-3 lg:block">
                    <p className="pb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Online · 4
                    </p>
                    {["nova", "kai", "mira", "oren"].map((member) => (
                      <p
                        key={member}
                        className="flex items-center gap-2 py-1.5 text-sm"
                      >
                        <span className="relative">
                          <span
                            className="block size-6 rounded-full"
                            style={{
                              background: `linear-gradient(135deg, var(--brand), var(--cyan))`,
                            }}
                          />
                          <span className="absolute -bottom-0.5 -right-0.5 size-2 rounded-full border border-panel bg-success" />
                        </span>
                        {member}
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            </Reveal>
          </div>

          <div className="grid border-x border-t border-border/60 bg-background/70 sm:grid-cols-3">
            {[
              ["Registered users", stats?.users],
              ["Communities", stats?.communities],
              ["Members online", stats?.onlineMembers],
            ].map(([label, value], index) => (
              <div
                key={String(label)}
                className={cn(
                  "px-6 py-7 text-center sm:px-8 sm:text-left",
                  index > 0 &&
                    "border-t border-border/60 sm:border-l sm:border-t-0",
                )}
              >
                <p className="text-3xl font-black tracking-tight sm:text-4xl">
                  {typeof value === "number" ? COUNT_FORMAT.format(value) : "—"}
                </p>
                <p className="mt-1 flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground sm:justify-start">
                  {index === 2 && (
                    <span className="size-2 animate-pulse rounded-full bg-success" />
                  )}
                  {label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Marquee strip ───────────────────────────────────── */}
      <section className="border-y border-border/60 bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-8 gap-y-3 px-4 py-5 text-sm text-muted-foreground sm:px-6">
          {[
            "Unlimited communities",
            "Unlimited messages",
            "Unlimited storage uploads",
            "Every moderation tool",
            "No premium channels",
            "No paywalled emojis",
          ].map((item) => (
            <span key={item} className="flex items-center gap-2">
              <Check className="size-4 text-success" /> {item}
            </span>
          ))}
        </div>
      </section>

      {/* ── Features ────────────────────────────────────────── */}
      <section id="features" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <Reveal className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">
            Features
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            Everything a community needs, nothing held back.
          </h2>
          <p className="mt-4 text-muted-foreground">
            Kyro ships the full loop — organise, talk, moderate, find — and
            every account gets the identical feature set.
          </p>
        </Reveal>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((feature, index) => (
            <Reveal key={feature.title} delay={index * 0.05}>
              <div className="group h-full rounded-xl border border-border/70 bg-panel p-5 transition-colors hover:border-primary/40">
                <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <feature.icon className="size-5" />
                </span>
                <h3 className="mt-4 text-sm font-semibold">{feature.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {feature.body}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Free forever ────────────────────────────────────── */}
      <section id="free" className="border-y border-border/60 bg-surface">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:items-center">
          <Reveal>
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">
              The business model
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Free means free.{" "}
              <span className="kyro-gradient-text">The whole product.</span>
            </h2>
            <p className="mt-4 text-muted-foreground">
              Most platforms split communities into free and paid — better
              audio, custom profiles, longer uploads behind a subscription. Kyro
              has one tier, and everyone is on it.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                "No paid plans, premium tiers or subscriptions",
                "No feature gates, trial clocks or usage meters",
                "No selling private messages or locking communities behind upgrades",
                "Same permissions for a two-person group and a 10,000-member one",
              ].map((line) => (
                <li key={line} className="flex items-start gap-3 text-sm">
                  <Check className="mt-0.5 size-4 shrink-0 text-success" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="relative rounded-2xl border border-border/70 bg-panel p-8">
              <div className="kyro-orb absolute -right-10 -top-10 h-40 w-40" />
              <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                What it costs
              </p>
              <p className="mt-3 text-5xl font-bold tracking-tight">
                $0{" "}
                <span className="text-lg font-medium text-muted-foreground">
                  / forever
                </span>
              </p>
              <div className="my-6 h-px bg-border/70" />
              <dl className="space-y-3 text-sm">
                {[
                  ["Communities", "Unlimited"],
                  ["Direct messages", "Unlimited"],
                  ["Attachments", "Unlimited"],
                  ["Roles & channels", "Unlimited"],
                  ["Moderation suite", "Included"],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="flex items-center justify-between"
                  >
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="font-medium">{value}</dd>
                  </div>
                ))}
              </dl>
              <Button asChild className="mt-7 w-full">
                <Link to="/auth">Claim your handle</Link>
              </Button>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── How it works ────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <Reveal className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">
            How it works
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            From zero to your first message in a minute.
          </h2>
        </Reveal>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {STEPS.map((item, index) => (
            <Reveal key={item.step} delay={index * 0.08}>
              <div className="h-full rounded-xl border border-border/70 bg-panel p-6">
                <span className="kyro-gradient-text text-2xl font-bold">
                  {item.step}
                </span>
                <h3 className="mt-3 text-base font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {item.body}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Use cases ───────────────────────────────────────── */}
      <section id="use-cases" className="border-y border-border/60 bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <Reveal className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">
              Who runs on Kyro
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Built for the places people gather.
            </h2>
          </Reveal>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {USE_CASES.map((item, index) => (
              <Reveal key={item.title} delay={index * 0.06}>
                <div className="h-full rounded-xl bg-panel p-6">
                  <item.icon className="size-5 text-primary" />
                  <h3 className="mt-4 text-sm font-semibold">{item.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {item.body}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Safety ──────────────────────────────────────────── */}
      <section id="safety" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <Reveal>
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">
              Safety & control
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Moderation that runs on the server, not on trust.
            </h2>
            <p className="mt-4 text-muted-foreground">
              Controls are enforced where the messages live, so a client can't
              skip them. Community owners decide who speaks, who manages, and
              who's gone.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {[
                "Permissions",
                "Roles",
                "Bans",
                "Audit log",
                "Member reports",
                "Slow mode",
                "Read-only channels",
                "DM & friend privacy",
                "Session management",
                "Data export",
                "Account deletion",
              ].map((chip) => (
                <span
                  key={chip}
                  className="rounded-full border border-border/70 bg-panel px-3 py-1 text-xs text-muted-foreground"
                >
                  {chip}
                </span>
              ))}
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="rounded-2xl border border-border/70 bg-panel p-6">
              <div className="flex items-start gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Shield className="size-5" />
                </span>
                <div>
                  <h3 className="text-sm font-semibold">
                    Your account stays yours
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Review and revoke active sessions, export everything Kyro
                    stores about you, or delete the account outright — all from
                    settings, no support ticket required.
                  </p>
                </div>
              </div>
              <div className="my-5 h-px bg-border/70" />
              <div className="flex items-start gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Users className="size-5" />
                </span>
                <div>
                  <h3 className="text-sm font-semibold">
                    You choose who reaches you
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Direct messages from everyone, friends only, or nobody —
                    plus blocking and an invisible presence mode that reports
                    you as offline.
                  </p>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Final CTA ──────────────────────────────────────── */}
      <section className="relative overflow-hidden border-t border-border/60">
        <div className="kyro-grid pointer-events-none absolute inset-0 opacity-60" />
        <div className="kyro-gradient-bg relative mx-auto mt-16 max-w-5xl rounded-3xl px-6 py-14 text-center sm:px-12">
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Your people are one handle away.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-white/85 sm:text-base">
            Create a Kyro account in seconds, claim @yourname, and open the door
            to your first community.
          </p>
          <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button
              asChild
              size="lg"
              className="h-11 bg-white px-7 text-neutral-900 hover:bg-white/90"
            >
              <Link to="/auth">
                Get started free <ArrowRight className="ml-2 size-4" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="h-11 border-white/40 bg-transparent px-7 text-white hover:bg-white/10 hover:text-white"
            >
              <Link to="/auth?returnTo=/dashboard">
                I already have an account
              </Link>
            </Button>
          </div>
        </div>
      </section>

      </main>

      {/* ── Footer ─────────────────────────────────────────── */}
      <footer className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <KyroWordmark />
            <p className="mt-3 max-w-xs text-sm text-muted-foreground">
              Connect. Play. Belong. A complete, free communication platform for
              communities of every size.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-8 text-sm sm:grid-cols-3">
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Product
              </p>
              <ul className="space-y-2 text-muted-foreground">
                <li>
                  <a href="#features" className="hover:text-foreground">
                    Features
                  </a>
                </li>
                <li>
                  <a href="#free" className="hover:text-foreground">
                    Free forever
                  </a>
                </li>
                <li>
                  <a href="#safety" className="hover:text-foreground">
                    Safety
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Account
              </p>
              <ul className="space-y-2 text-muted-foreground">
                <li>
                  <Link to="/auth" className="hover:text-foreground">
                    Sign in
                  </Link>
                </li>
                <li>
                  <Link
                    to="/auth?returnTo=/dashboard"
                    className="hover:text-foreground"
                  >
                    Open Kyro
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Legal
              </p>
              <ul className="space-y-2 text-muted-foreground">
                <li>
                  <Link to="/terms" className="hover:text-foreground">
                    Terms of Service
                  </Link>
                </li>
                <li>
                  <Link to="/privacy" className="hover:text-foreground">
                    Privacy Policy
                  </Link>
                </li>
              </ul>
            </div>
          </div>
        </div>
        <div className="mt-10 flex flex-col gap-2 border-t border-border/60 pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Kyro. Free for everyone, always.</p>
          <p>No premium tier. No paywalled features. No fine print.</p>
        </div>
      </footer>
    </div>
  );
}
