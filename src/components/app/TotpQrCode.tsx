import { useEffect, useState } from "react";
import { Loader2 } from "@/components/icons";

/** Lazily generates a local QR image; the TOTP secret never reaches a service. */
export function TotpQrCode({ uri }: { uri: string }) {
  const [source, setSource] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    void import("qrcode")
      .then(({ toDataURL }) =>
        toDataURL(uri, {
          width: 220,
          margin: 1,
          errorCorrectionLevel: "M",
          color: { dark: "#10131a", light: "#ffffff" },
        }),
      )
      .then((value) => {
        if (active) setSource(value);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [uri]);

  if (failed) {
    return (
      <p className="max-w-52 text-xs text-muted-foreground">
        QR generation is unavailable. Enter the setup key manually instead.
      </p>
    );
  }
  if (!source) {
    return (
      <span className="flex size-44 items-center justify-center rounded-xl border border-border bg-white">
        <Loader2 className="size-5 animate-spin text-zinc-500" />
      </span>
    );
  }
  return (
    <img
      src={source}
      alt="Google Authenticator setup QR code"
      className="size-44 rounded-xl border border-border bg-white p-2"
    />
  );
}
