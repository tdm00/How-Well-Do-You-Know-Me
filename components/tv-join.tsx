"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

export function TvJoin({ code }: { code: string }) {
  const [host, setHost] = useState("");
  const [joinUrl, setJoinUrl] = useState("");
  const [svg, setSvg] = useState("");

  useEffect(() => {
    const origin = window.location.origin;
    const url = `${origin}/play?code=${encodeURIComponent(code)}`;
    setHost(window.location.host);
    setJoinUrl(url);
    let cancelled = false;
    void QRCode.toString(url, {
      type: "svg",
      margin: 1,
      errorCorrectionLevel: "H",
      color: { dark: "#2C2118", light: "#FFF6EA" },
    }).then((markup) => {
      if (!cancelled) setSvg(markup);
    });
    return () => {
      cancelled = true;
    };
  }, [code]);

  return (
    <div className="mt-6 flex flex-wrap items-center gap-8">
      <div className="min-w-[16rem] max-w-3xl flex-1">
        <p
          data-testid="tv-join-host"
          className="font-display text-[clamp(2rem,3.6vw,4.2rem)] leading-none text-gold-bright"
        >
          {host || "\u00a0"}
        </p>
        <p className="mt-4 text-[clamp(1.4rem,2vw,2.4rem)] leading-snug text-cream/85">
          Open that address, choose Phone, and enter this code. Or scan.
        </p>
      </div>
      <div
        data-testid="tv-join-qr"
        data-join-url={joinUrl}
        aria-label={joinUrl ? `QR code to join at ${joinUrl}` : "QR code to join"}
        className="w-[clamp(220px,22vw,360px)] shrink-0 rounded-[1.5rem] bg-cream p-4 [&_svg]:h-auto [&_svg]:w-full"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </div>
  );
}
