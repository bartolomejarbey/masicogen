"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Loader2, Search, Sparkles, Upload, X } from "lucide-react";
import Image from "next/image";

type PhotoChoice = {
  assetId: string;
  url: string | null;
  focalPoint: { x: number; y: number };
  source: "upload" | "cutout" | "ai";
};

type LibraryPhoto = {
  id: string;
  assetId: string;
  dishName: string;
  focalPoint: { x: number; y: number };
  source: "upload" | "cutout" | "ai";
  signedUrl: string | null;
};

export function ManualPhotoPicker({
  dishName,
  canteenId,
  onPick,
  onClose
}: {
  dishName: string;
  canteenId: string;
  onPick: (choice: PhotoChoice) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState(dishName);
  const [photos, setPhotos] = useState<LibraryPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const searchSequenceRef = useRef(0);

  const loadPhotos = useCallback(async (search: string) => {
    // Pomalejší starší odpověď nesmí přepsat výsledky novějšího hledání.
    const sequence = ++searchSequenceRef.current;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("q", search.trim());
      const response = await fetch(`/api/dish-photos?${params.toString()}`);
      const body = (await response.json().catch(() => null)) as
        | { photos?: LibraryPhoto[]; error?: string }
        | null;
      if (!response.ok) throw new Error(body?.error ?? "Načtení knihovny selhalo.");
      if (sequence !== searchSequenceRef.current) return;
      setPhotos(body?.photos ?? []);
    } catch (loadError) {
      if (sequence !== searchSequenceRef.current) return;
      setError(loadError instanceof Error ? loadError.message : "Načtení knihovny selhalo.");
    } finally {
      if (sequence === searchSequenceRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadPhotos(query), 250);
    return () => window.clearTimeout(timer);
  }, [loadPhotos, query]);

  async function uploadPhoto(file: File) {
    setUploading(true);
    setError(null);
    try {
      const intentResponse = await fetch("/api/uploads/intent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          purpose: "dish_photo",
          fileName: file.name,
          mimeType: file.type
        })
      });
      const intent = (await intentResponse.json().catch(() => null)) as
        | { bucket?: string; path?: string; token?: string; error?: string }
        | null;
      if (!intentResponse.ok || !intent?.path || !intent.token) {
        throw new Error(intent?.error ?? "Příprava nahrání selhala.");
      }

      const { createBrowserSupabaseClient } = await import("@/lib/supabase/client");
      const supabase = createBrowserSupabaseClient();
      const upload = await supabase.storage
        .from(intent.bucket ?? "dish-photos")
        .uploadToSignedUrl(intent.path, intent.token, file, { contentType: file.type });
      if (upload.error) throw new Error(`Nahrání fotky selhalo: ${upload.error.message}`);

      const registerResponse = await fetch("/api/dish-photos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          path: intent.path,
          dishName: dishName.trim() || "Položka prezentace",
          canteenId,
          mimeType: file.type,
          sizeBytes: file.size
        })
      });
      const registered = (await registerResponse.json().catch(() => null)) as
        | { ok?: boolean; assetId?: string; signedUrl?: string | null; error?: string }
        | null;
      if (!registerResponse.ok || !registered?.ok || !registered.assetId) {
        throw new Error(registered?.error ?? "Uložení fotky selhalo.");
      }

      onPick({
        assetId: registered.assetId,
        url: registered.signedUrl ?? null,
        focalPoint: { x: 0.5, y: 0.5 },
        source: "upload"
      });
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Nahrání selhalo.");
    } finally {
      setUploading(false);
    }
  }

  async function generatePhoto() {
    const dish = dishName.trim();
    if (dish.length < 2) {
      setError("Nejdřív vyplňte název jídla, pak vygenerujte fotku.");
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      const response = await fetch("/api/dish-photos/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dishName: dish, canteenId })
      });
      const body = (await response.json().catch(() => null)) as
        | { assetId?: string; signedUrl?: string | null; error?: string }
        | null;
      if (!response.ok || !body?.assetId) {
        throw new Error(body?.error ?? "Generování fotky selhalo.");
      }
      onPick({
        assetId: body.assetId,
        url: body.signedUrl ?? null,
        focalPoint: { x: 0.5, y: 0.5 },
        source: "ai"
      });
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : "Generování selhalo.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="manual-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="manual-photo-title">
      <div className="manual-photo-modal card">
        <header>
          <div>
            <p className="eyebrow">Knihovna fotografií</p>
            <h2 id="manual-photo-title">Fotka pro „{dishName || "položku"}“</h2>
          </div>
          <button className="icon-button" onClick={onClose} type="button">
            <X aria-hidden="true" size={20} />
            <span className="sr-only">Zavřít</span>
          </button>
        </header>

        <div className="manual-photo-toolbar">
          <label className="manual-search-field">
            <Search aria-hidden="true" size={18} />
            <input
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Hledat podle názvu jídla"
              value={query}
            />
          </label>
          <button
            className="button primary"
            disabled={generating}
            onClick={() => void generatePhoto()}
            title="Vygeneruje fotku jídla podle názvu."
            type="button"
          >
            {generating ? (
              <Loader2 aria-hidden="true" className="spin" size={18} />
            ) : (
              <Sparkles aria-hidden="true" size={18} />
            )}
            AI fotka
          </button>
          <button
            className="button"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            type="button"
          >
            {uploading ? (
              <Loader2 aria-hidden="true" className="spin" size={18} />
            ) : (
              <Upload aria-hidden="true" size={18} />
            )}
            Nahrát novou
          </button>
          <input
            accept="image/jpeg,image/png,image/webp"
            disabled={uploading}
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void uploadPhoto(file);
              event.target.value = "";
            }}
            ref={fileInputRef}
            type="file"
          />
        </div>

        {error ? <p className="launch-error">{error}</p> : null}
        {loading ? (
          <div className="manual-photo-loading">
            <Loader2 aria-hidden="true" className="spin" size={24} /> Načítám knihovnu…
          </div>
        ) : photos.length > 0 ? (
          <div className="manual-photo-grid">
            {photos.map((photo) => (
              <button
                className="manual-photo-option"
                disabled={!photo.signedUrl}
                key={photo.id}
                onClick={() =>
                  onPick({
                    assetId: photo.assetId,
                    url: photo.signedUrl,
                    focalPoint: photo.focalPoint,
                    source: photo.source
                  })
                }
                type="button"
              >
                {photo.signedUrl ? (
                  <Image
                    alt={photo.dishName}
                    height={240}
                    src={photo.signedUrl}
                    unoptimized
                    width={320}
                  />
                ) : (
                  <span>
                    <Camera aria-hidden="true" size={24} />
                  </span>
                )}
                <strong>{photo.dishName}</strong>
              </button>
            ))}
          </div>
        ) : (
          <p className="manual-photo-loading">Žádná odpovídající fotka. Nahrajte vlastní.</p>
        )}
      </div>
    </div>
  );
}
