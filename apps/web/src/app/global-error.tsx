"use client";

import { useEffect } from "react";

/**
 * Poslední záchrana pro celou aplikaci: když spadne cokoli mimo běžné
 * hranice, místo prázdné „This page couldn't load" ukážeme čitelnou
 * stránku s tlačítkem. global-error musí vykreslit vlastní <html>/<body>.
 */
export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global error:", error);
  }, [error]);

  return (
    <html lang="cs">
      <body
        style={{
          margin: 0,
          fontFamily: "system-ui, -apple-system, sans-serif",
          background: "#f6f3ee",
          color: "#191513"
        }}
      >
        <div
          style={{
            display: "grid",
            gap: 16,
            maxWidth: 560,
            margin: "80px auto",
            padding: 28,
            borderRadius: 16,
            border: "1px solid rgba(0,0,0,0.12)",
            background: "#fff",
            textAlign: "center"
          }}
        >
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>Stránka se nenačetla</h1>
          <p style={{ margin: 0, color: "#6b6560", fontSize: 16, lineHeight: 1.5 }}>
            Něco se pokazilo. Zkuste to prosím znovu.
          </p>
          {error.digest ? (
            <code style={{ fontSize: 12, color: "#a09a94" }}>kód: {error.digest}</code>
          ) : null}
          <button
            onClick={() => reset()}
            style={{
              justifySelf: "center",
              minHeight: 48,
              padding: "0 22px",
              borderRadius: 12,
              border: 0,
              background: "#b71c1c",
              color: "#fff",
              fontSize: 16,
              fontWeight: 800,
              cursor: "pointer"
            }}
            type="button"
          >
            Zkusit znovu
          </button>
        </div>
      </body>
    </html>
  );
}
