export type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type InstallSnapshot = {
  installed: boolean;
  prompt: InstallPromptEvent | null;
};

type InstallCapture = {
  initialized: boolean;
  listeners: Set<() => void>;
  snapshot: InstallSnapshot;
};

declare global {
  interface Window {
    __kyroInstallCapture?: InstallCapture;
  }
}

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone ===
      true
  );
}

const SERVER_SNAPSHOT: InstallSnapshot = { installed: false, prompt: null };
const capture =
  typeof window === "undefined"
    ? null
    : (window.__kyroInstallCapture ??= {
        initialized: false,
        listeners: new Set(),
        snapshot: { installed: isStandalone(), prompt: null },
      });

function update(snapshot: InstallSnapshot) {
  if (!capture) return;
  capture.snapshot = snapshot;
  capture.listeners.forEach((listener) => listener());
}

if (capture && !capture.initialized) {
  capture.initialized = true;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    update({
      installed: capture.snapshot.installed,
      prompt: event as InstallPromptEvent,
    });
  });
  window.addEventListener("appinstalled", () => {
    update({ installed: true, prompt: null });
  });
}

export function subscribeInstallState(listener: () => void) {
  capture?.listeners.add(listener);
  return () => capture?.listeners.delete(listener);
}

export function getInstallState() {
  return capture?.snapshot ?? SERVER_SNAPSHOT;
}

export async function requestAppInstall() {
  const prompt = capture?.snapshot.prompt;
  if (!prompt) return;
  await prompt.prompt();
  const choice = await prompt.userChoice;
  update({ installed: choice.outcome === "accepted", prompt: null });
}
