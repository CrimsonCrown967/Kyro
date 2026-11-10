import { Link } from "react-router";
import { motion, useReducedMotion } from "framer-motion";
import {
  Download as DownloadIcon,
  ArrowRight,
  Check,
  Headphones,
  MessageCircle,
  MonitorSmartphone,
} from "@/components/icons";
import { KyroMark, KyroWordmark } from "@/components/KyroMark";
import {
  DESKTOP_VERSION,
  WINDOWS_DOWNLOAD_URL,
  DESKTOP_RELEASE_URL,
} from "@/lib/desktop";

export default function DownloadPage() {
  const reducedMotion = useReducedMotion();
  return (
    <div className="min-h-screen overflow-x-clip bg-[#111318] text-white">
      <header className="border-b border-white/10">
        <div className="mx-auto flex h-20 max-w-6xl items-center justify-between px-5 sm:px-8">
          <Link to="/" aria-label="Kyro home">
            <KyroWordmark />
          </Link>
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm font-semibold hover:bg-white/5"
          >
            Open in browser <ArrowRight className="size-4" />
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 pb-20 pt-14 sm:px-8 sm:pt-24">
        <div className="grid items-center gap-14 lg:grid-cols-[1fr_1.05fr]">
          <motion.div
            initial={reducedMotion ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <p className="mb-5 text-xs font-bold uppercase tracking-[.22em] text-indigo-300">
              KYRO FOR WINDOWS
            </p>
            <h1 className="text-5xl font-black leading-[1.02] tracking-[-.045em] sm:text-6xl">
              Your people.
              <br />
              One click away.
            </h1>
            <p className="mt-6 max-w-md text-base leading-7 text-[#A0A6B5]">
              Give your communities a home on your desktop. Chat, join voice,
              and share your screen in a window of your own.
            </p>
            <a
              href={WINDOWS_DOWNLOAD_URL}
              className="mt-8 inline-flex min-h-14 w-full items-center justify-center gap-3 rounded-xl bg-[#5865F2] px-6 py-4 font-bold shadow-lg shadow-indigo-950/40 transition hover:bg-[#6875ff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-300 sm:w-auto"
            >
              <DownloadIcon className="size-5" />
              Download for Windows
            </a>
            <p className="mt-3 text-xs text-[#A0A6B5]">
              Windows 10 / 11 · 64-bit (x64) · Version {DESKTOP_VERSION}
            </p>
            <div className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-300">
              {[
                "Free to download",
                "Your existing account",
                "Desktop & Start menu shortcuts",
              ].map((text) => (
                <span key={text} className="flex items-center gap-2">
                  <Check className="size-4 text-indigo-300" />
                  {text}
                </span>
              ))}
            </div>
          </motion.div>
          <motion.div
            initial={reducedMotion ? false : { opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="relative"
          >
            <div className="pointer-events-none absolute -inset-6 rounded-full bg-indigo-500/10 blur-3xl" />
            <div
              className="relative overflow-hidden rounded-2xl border border-white/15 bg-[#1B1E27] shadow-2xl shadow-black/40"
              aria-label="Preview of Kyro on Windows"
            >
              <div className="flex h-11 items-center gap-2 border-b border-white/10 bg-[#15171e] px-4">
                <KyroMark className="size-5" />
                <span className="text-xs font-semibold text-slate-300">
                  Kyro
                </span>
                <div
                  className="ml-auto flex gap-5 text-sm text-slate-500"
                  aria-hidden
                >
                  <span>−</span>
                  <span>□</span>
                  <span>×</span>
                </div>
              </div>
              <div className="flex min-h-[310px] sm:min-h-[360px]">
                <div className="flex w-14 shrink-0 flex-col items-center gap-3 bg-[#111318] py-4 sm:w-16">
                  <span className="grid size-10 place-items-center rounded-xl bg-indigo-500">
                    <KyroMark className="size-7" />
                  </span>
                  <span className="grid size-10 place-items-center rounded-2xl bg-purple-400/15 text-purple-200">
                    ✦
                  </span>
                  <span className="grid size-10 place-items-center rounded-2xl bg-emerald-400/15 text-emerald-200">
                    ☕
                  </span>
                </div>
                <div className="hidden w-32 shrink-0 border-r border-white/5 bg-[#171a22] p-3 text-xs sm:block">
                  <p className="mb-5 font-bold">After hours</p>
                  <p className="rounded-md bg-indigo-400/10 p-2 text-indigo-200">
                    # the-lounge
                  </p>
                  <p className="p-2 text-slate-500"># good-finds</p>
                  <p className="mt-5 flex items-center gap-2 text-slate-400">
                    <Headphones className="size-3" />
                    The couch
                  </p>
                  <p className="mt-2 pl-5 text-[10px] text-emerald-300">
                    Voice connected
                  </p>
                </div>
                <div className="min-w-0 flex-1 p-4 sm:p-5">
                  <p className="border-b border-white/5 pb-4 text-sm font-semibold">
                    # the-lounge
                  </p>
                  <div className="mt-8 space-y-6">
                    {[
                      {
                        name: "nova",
                        initial: "N",
                        text: "Anyone up for a game?",
                        color: "bg-indigo-400/20 text-indigo-200",
                      },
                      {
                        name: "mika",
                        initial: "M",
                        text: "Already in voice. Come hang out.",
                        color: "bg-pink-400/20 text-pink-200",
                      },
                    ].map((message) => (
                      <div key={message.name} className="flex gap-3">
                        <span
                          className={`grid size-8 shrink-0 place-items-center rounded-full text-xs font-bold ${message.color}`}
                        >
                          {message.initial}
                        </span>
                        <div>
                          <p className="text-xs font-semibold">
                            {message.name}
                          </p>
                          <p className="mt-1 text-xs leading-5 text-slate-400">
                            {message.text}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-10 rounded-lg border border-white/5 bg-white/5 p-3 text-[11px] text-slate-500">
                    Message #the-lounge
                  </div>
                </div>
              </div>
            </div>
            <p className="mt-3 text-center text-xs text-slate-500">
              Same Kyro. A little closer.
            </p>
          </motion.div>
        </div>
        <section className="mt-20 grid gap-5 border-t border-white/10 pt-12 sm:grid-cols-3">
          {[
            {
              icon: MessageCircle,
              title: "Stay signed in",
              text: "Your account and conversations are ready when you reopen Kyro.",
            },
            {
              icon: Headphones,
              title: "Meet in voice",
              text: "Give Kyro microphone access when you join a call. Share a screen or a specific window.",
            },
            {
              icon: MonitorSmartphone,
              title: "Make room for your people",
              text: "Pin Kyro to your taskbar and keep your communities beside everything else you do.",
            },
          ].map((feature) => (
            <div
              key={feature.title}
              className="rounded-xl border border-white/5 bg-[#1B1E27] p-6"
            >
              <feature.icon className="mb-5 size-6 text-indigo-300" />
              <h2 className="font-semibold">{feature.title}</h2>
              <p className="mt-2 text-sm leading-6 text-[#A0A6B5]">
                {feature.text}
              </p>
            </div>
          ))}
        </section>
        <section className="mt-12 rounded-xl border border-white/10 p-6 sm:p-8">
          <h2 className="text-lg font-semibold">
            From download to your first conversation.
          </h2>
          <ol className="mt-5 grid gap-5 text-sm sm:grid-cols-3">
            {[
              "Download and open the Kyro installer.",
              "Choose where to install Kyro and add your shortcuts.",
              "Open Kyro and sign in with your existing account, or create one.",
            ].map((step, index) => (
              <li key={step} className="flex gap-3">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-indigo-400/10 font-bold text-indigo-300">
                  {index + 1}
                </span>
                <span className="pt-1 leading-6 text-slate-300">{step}</span>
              </li>
            ))}
          </ol>
          <p className="mt-6 border-t border-white/5 pt-5 text-xs leading-6 text-[#A0A6B5]">
            Internet connection required. This first release is not code signed,
            so Windows may identify the publisher as unknown. Download only from
            this page or the official Kyro GitHub download release.{" "}
            <a
              href={DESKTOP_RELEASE_URL}
              className="text-indigo-300 underline underline-offset-4"
            >
              Release notes & checksum
            </a>
          </p>
        </section>
      </main>
      <footer className="border-t border-white/10 px-5 py-7 text-center text-xs text-[#A0A6B5]">
        <Link to="/privacy" className="hover:text-white">
          Privacy
        </Link>
        <span className="mx-4">·</span>
        <Link to="/terms" className="hover:text-white">
          Terms
        </Link>
        <span className="mx-4">·</span>
        <Link to="/" className="hover:text-white">
          Kyro home
        </Link>
      </footer>
    </div>
  );
}
