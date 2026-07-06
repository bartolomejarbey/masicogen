"use client";

import { useEffect, useMemo, useState } from "react";
import { TvComposition } from "@masico/render";
import { demoDeck, demoMenu, playerPayloadSchema, type PlayerPayload } from "@masico/shared";
import { ScaledTvFrame } from "./ScaledTvFrame";

type TvPlayerProps = {
  allowDemoFallback?: boolean;
  screenId: string;
};

export function TvPlayer({ allowDemoFallback = false, screenId }: TvPlayerProps) {
  const [manifest, setManifest] = useState<PlayerPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const storageKey = useMemo(() => `masico-player-${screenId}`, [screenId]);
  const tokenStorageKey = useMemo(() => `masico-player-token-${screenId}`, [screenId]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenFromUrl = params.get("token");

    if (tokenFromUrl) {
      localStorage.setItem(tokenStorageKey, tokenFromUrl);
      params.delete("token");
      const query = params.toString();
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`
      );
    }
  }, [tokenStorageKey]);

  useEffect(() => {
    let canceled = false;

    async function loadManifest() {
      try {
        const token = localStorage.getItem(tokenStorageKey);
        const response = await fetch(`/api/player/${screenId}/manifest`, {
          cache: "no-store",
          headers: token ? { authorization: `Bearer ${token}` } : undefined
        });
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(`manifest:${response.status}:${body?.error ?? "unknown"}`);
        }
        const nextManifest = playerPayloadSchema.parse(await response.json());
        if (!canceled) {
          setManifest(nextManifest);
          setVideoError(null);
          localStorage.setItem(storageKey, JSON.stringify(nextManifest));
        }
      } catch (loadError) {
        const cached = localStorage.getItem(storageKey);
        if (cached && !canceled) {
          try {
            setManifest(playerPayloadSchema.parse(JSON.parse(cached)));
            setError("Offline režim: přehrávám poslední uloženou verzi.");
          } catch {
            localStorage.removeItem(storageKey);
            setError("Poslední uložená verze je poškozená.");
          }
          return;
        }
        if (!canceled) {
          setError(loadError instanceof Error ? loadError.message : "Manifest není dostupný.");
        }
      }
    }

    void loadManifest();
    const interval = window.setInterval(loadManifest, 60_000);

    return () => {
      canceled = true;
      window.clearInterval(interval);
    };
  }, [screenId, storageKey, tokenStorageKey]);

  useEffect(() => {
    const sendHeartbeat = () => {
      const token = localStorage.getItem(tokenStorageKey);
      void fetch(`/api/player/${screenId}/heartbeat`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          versionId: manifest?.versionId ?? null,
          error: videoError ?? error,
          userAgent: navigator.userAgent
        })
      }).catch(() => undefined);
    };

    sendHeartbeat();
    const interval = window.setInterval(sendHeartbeat, 60_000);

    return () => window.clearInterval(interval);
  }, [error, manifest?.versionId, screenId, tokenStorageKey, videoError]);

  const playableVideoUrl =
    manifest?.mode === "video" &&
    manifest.videoUrl &&
    !manifest.videoUrl.includes("example.com") &&
    !videoError
      ? manifest.videoUrl
      : null;

  return (
    <div className="player-stage">
      <div className="portrait-warning" aria-live="polite">
        <strong>TV přehrávač je připravený pro 16:9 obrazovku.</strong>
        <span>Otočte zařízení na šířku nebo otevřete tento odkaz přímo na TV.</span>
      </div>
      {playableVideoUrl ? (
        <video
          className="player-video"
          autoPlay
          loop
          muted
          onCanPlay={() => setVideoError(null)}
          onError={() => setVideoError("Video nelze přehrát. Zůstává záložní náhled.")}
          onStalled={() => setVideoError("Přehrávání se zaseklo.")}
          playsInline
          preload="auto"
          src={playableVideoUrl}
        />
      ) : manifest?.mode === "live" && !videoError ? (
        <div className="player-fallback">
          <LiveTvLoop manifest={manifest} />
        </div>
      ) : allowDemoFallback ? (
        <div className="player-fallback">
          <ScaledTvFrame>
            <TvComposition deck={demoDeck} menu={demoMenu} showSafeArea={false} />
          </ScaledTvFrame>
        </div>
      ) : (
        <div className="player-error-state" role="status">
          <strong>{getPlayerErrorCopy(error, videoError, screenId).title}</strong>
          <span>{getPlayerErrorCopy(error, videoError, screenId).message}</span>
          <small>{getPlayerErrorCopy(error, videoError, screenId).diagnostic}</small>
        </div>
      )}
    </div>
  );
}

function LiveTvLoop({ manifest }: { manifest: Extract<PlayerPayload, { mode: "live" }> }) {
  const [activeSlideId, setActiveSlideId] = useState(manifest.deck.slides[0]?.id);

  useEffect(() => {
    if (manifest.deck.slides.length <= 1) {
      setActiveSlideId(manifest.deck.slides[0]?.id);
      return;
    }

    let slideIndex = Math.max(
      manifest.deck.slides.findIndex((slide) => slide.id === activeSlideId),
      0
    );
    const currentSlide = manifest.deck.slides[slideIndex] ?? manifest.deck.slides[0];
    const timeout = window.setTimeout(() => {
      slideIndex = (slideIndex + 1) % manifest.deck.slides.length;
      setActiveSlideId(manifest.deck.slides[slideIndex]?.id);
    }, Math.max((currentSlide.durationFrames / manifest.deck.fps) * 1000, 2500));

    return () => window.clearTimeout(timeout);
  }, [activeSlideId, manifest.deck]);

  return (
    <ScaledTvFrame>
      <TvComposition
        deck={manifest.deck}
        menu={manifest.menu}
        activeSlideId={activeSlideId}
        showSafeArea={false}
      />
    </ScaledTvFrame>
  );
}

function getPlayerErrorCopy(error: string | null, videoError: string | null, screenId: string) {
  if (videoError) {
    return {
      title: "Video nelze přehrát",
      message: "TV zůstane na poslední dostupné verzi nebo na bezpečné chybové obrazovce.",
      diagnostic: videoError
    };
  }

  if (!error) {
    return {
      title: "TV smyčka není načtená",
      message: "Obrazovka zatím nemá načtený publikovaný MP4 export.",
      diagnostic: `Obrazovka: ${screenId}`
    };
  }

  const manifestStatus = parseManifestStatus(error);
  if (manifestStatus === 401) {
    return {
      title: "Obrazovka není spárovaná",
      message: "Otevřete v administraci párování TV a použijte nový jednorázový odkaz.",
      diagnostic: `Obrazovka: ${screenId} · manifest 401`
    };
  }

  if (manifestStatus === 403) {
    return {
      title: "Token obrazovky nemá oprávnění",
      message: "V administraci obnovte párování nebo token této TV obrazovky.",
      diagnostic: `Obrazovka: ${screenId} · manifest 403`
    };
  }

  if (manifestStatus === 404) {
    return {
      title: "Není publikovaný export",
      message: "Tato TV zatím nemá přiřazenou schválenou smyčku.",
      diagnostic: `Obrazovka: ${screenId} · manifest 404`
    };
  }

  if (manifestStatus === 503) {
    return {
      title: "Datové napojení TV není dostupné",
      message: "Zkontrolujte Supabase integraci a poslední úspěšně publikovanou verzi.",
      diagnostic: `Obrazovka: ${screenId} · manifest 503`
    };
  }

  if (error.toLowerCase().includes("fetch")) {
    return {
      title: "TV je offline",
      message: "Připojení k serveru se nepodařilo. Po obnovení sítě se smyčka zkusí načíst znovu.",
      diagnostic: `Obrazovka: ${screenId}`
    };
  }

  return {
    title: "TV smyčka není dostupná",
    message: "Obnovte stránku nebo v administraci vraťte poslední dobrou verzi.",
    diagnostic: `${error} · obrazovka: ${screenId}`
  };
}

function parseManifestStatus(error: string) {
  const match = /^manifest:(\d{3}):/.exec(error);
  return match ? Number(match[1]) : null;
}
