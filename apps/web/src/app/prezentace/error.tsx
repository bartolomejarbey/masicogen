"use client";

import { useEffect } from "react";

/**
 * Záchranná hranice pro /prezentace: kdyby cokoli při renderu spadlo,
 * uživatel uvidí čitelnou hlášku a tlačítko Zkusit znovu — místo prázdné
 * stránky nebo „This page couldn't load".
 */
export default function PrezentaceError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Prezentace error:", error);
  }, [error]);

  return (
    <div
      style={{
        display: "grid",
        gap: 16,
        maxWidth: 560,
        margin: "80px auto",
        padding: 28,
        borderRadius: 16,
        border: "1px solid rgba(0,0,0,0.12)",
        textAlign: "center"
      }}
    >
      <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>Prezentace se nenačetla</h1>
      <p style={{ margin: 0, color: "#6b6560", fontSize: 16, lineHeight: 1.5 }}>
        Něco se při načítání pokazilo. Zkuste to prosím znovu.
      </p>
      {error.digest ? (
        <code style={{ fontSize: 12, color: "#a09a94" }}>kód: {error.digest}</code>
      ) : null}
      <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
        <button
          onClick={() => reset()}
          style={{
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
        <a
          href="/prezentace"
          style={{
            minHeight: 48,
            display: "inline-flex",
            alignItems: "center",
            padding: "0 22px",
            borderRadius: 12,
            border: "1px solid rgba(0,0,0,0.15)",
            color: "#191513",
            fontSize: 16,
            fontWeight: 800,
            textDecoration: "none"
          }}
        >
          Načíst znovu
        </a>
      </div>
    </div>
  );
}
