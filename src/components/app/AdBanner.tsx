import { useEffect, useRef } from "react";

declare global {
  interface Window {
    adsbygoogle?: Record<string, never>[];
  }
}

/** A real responsive AdSense placement; renders nothing until IDs are configured. */
export function AdBanner({ slot }: { slot?: string }) {
  const client = import.meta.env.VITE_ADSENSE_CLIENT?.trim();
  const adSlot =
    slot?.trim() || import.meta.env.VITE_ADSENSE_SETTINGS_SLOT?.trim();
  const requested = useRef(false);

  useEffect(() => {
    if (!client || !adSlot || requested.current) return;
    requested.current = true;
    const requestAd = () => {
      try {
        (window.adsbygoogle ??= []).push({});
      } catch {
        requested.current = false;
      }
    };
    const existing = document.querySelector<HTMLScriptElement>(
      "script[data-kyro-adsense]",
    );
    if (existing) {
      requestAd();
      return;
    }
    const script = document.createElement("script");
    script.async = true;
    script.crossOrigin = "anonymous";
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`;
    script.dataset.kyroAdsense = "true";
    script.addEventListener("load", requestAd, { once: true });
    document.head.appendChild(script);
  }, [adSlot, client]);

  if (!client || !adSlot) return null;

  return (
    <aside className="shrink-0 border-t border-border/60 bg-panel/70 px-4 py-2 text-center">
      <p className="mb-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/60">
        Advertisement
      </p>
      <ins
        className="adsbygoogle block min-h-[60px] overflow-hidden"
        data-ad-client={client}
        data-ad-slot={adSlot}
        data-ad-format="horizontal"
        data-full-width-responsive="true"
      />
    </aside>
  );
}
