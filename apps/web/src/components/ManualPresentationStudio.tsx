"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  MANUAL_PRESENTATION_MAX_SLIDES,
  buildManualPresentationRenderModel,
  createManualPresentationManifest,
  manualPresentationDocumentSchema,
  type ManualPresentationDocument,
  type ManualPresentationItem,
  type ManualPresentationLayoutId,
  type ManualPresentationSlide
} from "@masico/shared";
import { TvComposition } from "@masico/render";
import {
  Archive,
  ArrowDown,
  ArrowUp,
  Copy,
  Download,
  Eye,
  FilePlus2,
  LayoutTemplate,
  Loader2,
  Move,
  Plus,
  Save,
  Trash2,
  X
} from "lucide-react";
import type {
  PresentationCanteen,
  PresentationLocation,
  SavedManualPresentation
} from "@/lib/manual-presentations";
import { ManualPresentationCanvas } from "./ManualPresentationCanvas";
import { ManualPresentationInspector } from "./ManualPresentationInspector";
import { ManualPhotoPicker } from "./ManualPhotoPicker";
import { ScaledTvFrame } from "./ScaledTvFrame";

type StudioMessage = { tone: "ok" | "error" | "info"; text: string } | null;

export function ManualPresentationStudio({
  initialDocument,
  initialPresentations,
  locations,
  canteens,
  canPersist,
  persistHint
}: {
  initialDocument: ManualPresentationDocument;
  initialPresentations: SavedManualPresentation[];
  locations: PresentationLocation[];
  canteens: PresentationCanteen[];
  canPersist: boolean;
  persistHint?: string;
}) {
  const [document, setDocument] = useState(initialDocument);
  const [presentations, setPresentations] = useState(initialPresentations);
  const [activeSaved, setActiveSaved] = useState<SavedManualPresentation | null>(null);
  const [activeSlideId, setActiveSlideId] = useState(initialDocument.slides[0]!.id);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [mode, setMode] = useState<"content" | "layout">("content");
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState<StudioMessage>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewSlideId, setPreviewSlideId] = useState(activeSlideId);
  const [photoTargetItemId, setPhotoTargetItemId] = useState<string | null>(null);
  const attemptedAssetIds = useRef(new Set<string>());

  const activeSlide =
    document.slides.find((slide) => slide.id === activeSlideId) ?? document.slides[0]!;
  const activeSlideIndex = document.slides.findIndex((slide) => slide.id === activeSlide.id);
  const previewDocument = useMemo(() => makePreviewSafe(document), [document]);
  const renderModel = useMemo(
    () => buildManualPresentationRenderModel(previewDocument, { assetUrls }),
    [assetUrls, previewDocument]
  );
  const photoTarget = activeSlide.items.find((item) => item.id === photoTargetItemId) ?? null;

  useEffect(() => {
    const missing = collectAssetIds(document).filter(
      (assetId) => !assetUrls[assetId] && !attemptedAssetIds.current.has(assetId)
    );
    if (missing.length === 0) return;
    missing.forEach((assetId) => attemptedAssetIds.current.add(assetId));
    let cancelled = false;

    void Promise.all(
      missing.map(async (assetId) => {
        try {
          const response = await fetch(`/api/dish-photos?assetId=${encodeURIComponent(assetId)}`);
          const body = (await response.json().catch(() => null)) as
            | { photos?: Array<{ signedUrl?: string | null }> }
            | null;
          return [assetId, body?.photos?.[0]?.signedUrl ?? null] as const;
        } catch {
          // Výpadek sítě nesmí fotku zablokovat trvale — povolit další pokus.
          attemptedAssetIds.current.delete(assetId);
          return [assetId, null] as const;
        }
      })
    ).then((entries) => {
      if (cancelled) return;
      const resolved = entries.filter(
        (entry): entry is readonly [string, string] => Boolean(entry[1])
      );
      if (resolved.length === 0) return;
      setAssetUrls((current) => ({
        ...current,
        ...Object.fromEntries(resolved)
      }));
    });

    return () => {
      cancelled = true;
    };
  }, [assetUrls, document]);

  function commit(next: ManualPresentationDocument) {
    setDocument(next);
    setDirty(true);
    setMessage(null);
  }

  function updateActiveSlide(nextSlide: ManualPresentationSlide) {
    commit({
      ...document,
      slides: document.slides.map((slide) => (slide.id === activeSlide.id ? nextSlide : slide))
    });
  }

  function startNew() {
    if (dirty && !window.confirm("Rozpracované změny nejsou uložené. Opravdu začít novou prezentaci?")) {
      return;
    }
    const next = createNewDocument(initialDocument, document.locationId, document.canteenId);
    setDocument(next);
    setActiveSaved(null);
    setActiveSlideId(next.slides[0]!.id);
    setSelectedLayerId(null);
    setDirty(false);
    setMessage({ tone: "info", text: "Nová jednorázová prezentace je připravená." });
  }

  function openSaved(presentation: SavedManualPresentation) {
    if (dirty && !window.confirm("Rozpracované změny nejsou uložené. Opravdu otevřít jinou prezentaci?")) {
      return;
    }
    const next = structuredClone(presentation.document);
    setDocument(next);
    setActiveSaved(presentation);
    setActiveSlideId(next.slides[0]!.id);
    setSelectedLayerId(null);
    setDirty(false);
    setMessage({ tone: "info", text: `Otevřena uložená prezentace „${presentation.name}“.` });
  }

  function addSlide(baseTemplateId: ManualPresentationLayoutId = "mains-grid") {
    if (document.slides.length >= MANUAL_PRESENTATION_MAX_SLIDES) return;
    const nextSlide = createClientSlide(baseTemplateId);
    const insertAt = Math.min(activeSlideIndex + 1, document.slides.length);
    const slides = [...document.slides];
    slides.splice(insertAt, 0, nextSlide);
    commit({ ...document, slides });
    setActiveSlideId(nextSlide.id);
    setSelectedLayerId(null);
  }

  function duplicateSlide() {
    const nextId = crypto.randomUUID();
    const next: ManualPresentationSlide = {
      ...structuredClone(activeSlide),
      id: nextId,
      title: `${activeSlide.title} — kopie`,
      manifest: {
        ...structuredClone(activeSlide.manifest),
        id: `manual-${nextId}`,
        name: `${activeSlide.manifest.name} — kopie`
      },
      items: activeSlide.items.map((item) => ({ ...structuredClone(item), id: crypto.randomUUID() }))
    };
    const slides = [...document.slides];
    slides.splice(activeSlideIndex + 1, 0, next);
    commit({ ...document, slides });
    setActiveSlideId(next.id);
    setSelectedLayerId(null);
  }

  function deleteSlide() {
    if (document.slides.length === 1) return;
    const slides = document.slides.filter((slide) => slide.id !== activeSlide.id);
    commit({ ...document, slides });
    setActiveSlideId(slides[Math.max(0, activeSlideIndex - 1)]!.id);
    setSelectedLayerId(null);
  }

  function moveSlide(direction: -1 | 1) {
    const nextIndex = activeSlideIndex + direction;
    if (nextIndex < 0 || nextIndex >= document.slides.length) return;
    const slides = [...document.slides];
    const [moved] = slides.splice(activeSlideIndex, 1);
    slides.splice(nextIndex, 0, moved!);
    commit({ ...document, slides });
  }

  async function saveLongTerm() {
    if (!canPersist) {
      setMessage({
        tone: "error",
        text: "Dlouhodobé ukládání vyžaduje přihlášenou roli vlastník, admin nebo editor."
      });
      return;
    }
    const parsed = manualPresentationDocumentSchema.safeParse(document);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setMessage({
        tone: "error",
        text: issue ? `${issue.path.join(".")}: ${issue.message}` : "Prezentace není platná."
      });
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch(
        activeSaved ? `/api/presentations/${activeSaved.deckId}` : "/api/presentations",
        {
          method: activeSaved ? "PUT" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(
            activeSaved
              ? { expectedDeckVersionId: activeSaved.deckVersionId, document: parsed.data }
              : parsed.data
          )
        }
      );
      const body = (await response.json().catch(() => null)) as
        | { presentation?: SavedManualPresentation; error?: string }
        | null;
      if (response.status === 409) {
        await recoverFromConflict();
        return;
      }
      if (!response.ok || !body?.presentation) {
        throw new Error(body?.error ?? `Uložení selhalo (${response.status}).`);
      }

      const saved = body.presentation;
      setPresentations((current) => [
        saved,
        ...current.filter((presentation) => presentation.deckId !== saved.deckId)
      ]);
      setActiveSaved(saved);
      setDocument(saved.document);
      setDirty(false);
      setMessage({
        tone: "ok",
        text: "Dlouhodobě uloženo jako nová neměnná verze. Předchozí verze zůstala v historii."
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Uložení selhalo."
      });
    } finally {
      setSaving(false);
    }
  }

  async function fetchPresentationList(): Promise<SavedManualPresentation[] | null> {
    try {
      const response = await fetch("/api/presentations");
      const body = (await response.json().catch(() => null)) as
        | { presentations?: SavedManualPresentation[] }
        | null;
      return response.ok && body?.presentations ? body.presentations : null;
    } catch {
      return null;
    }
  }

  /** 409: kolega mezitím uložil novou verzi. Úpravy zůstávají v editoru,
   *  aktivní verze se posune na nejnovější, aby další uložení prošlo. */
  async function recoverFromConflict() {
    const refreshed = await fetchPresentationList();
    if (refreshed) {
      setPresentations(refreshed);
      const fresh = activeSaved
        ? refreshed.find((candidate) => candidate.deckId === activeSaved.deckId) ?? null
        : null;
      if (fresh) {
        setActiveSaved(fresh);
      }
    }
    setMessage({
      tone: "error",
      text: "Prezentaci mezitím uložil někdo jiný. Vaše úpravy zůstaly v editoru — dalším uložením vzniknou jako nejnovější verze, nebo prezentaci znovu otevřete ze seznamu."
    });
  }

  async function archiveSaved() {
    if (!activeSaved || !canPersist) return;
    if (!window.confirm(`Archivovat prezentaci „${activeSaved.name}“? Historie verzí zůstane zachovaná.`)) {
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(`/api/presentations/${activeSaved.deckId}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedDeckVersionId: activeSaved.deckVersionId })
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (response.status === 409) {
        await recoverFromConflict();
        return;
      }
      if (!response.ok) throw new Error(body?.error ?? "Archivace selhala.");
      setPresentations((current) =>
        current.filter((presentation) => presentation.deckId !== activeSaved.deckId)
      );
      const next = createNewDocument(initialDocument, document.locationId, document.canteenId);
      setDocument(next);
      setActiveSaved(null);
      setActiveSlideId(next.slides[0]!.id);
      setDirty(false);
      setMessage({ tone: "ok", text: "Prezentace je archivovaná, historie zůstala zachovaná." });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Archivace selhala." });
    } finally {
      setSaving(false);
    }
  }

  async function exportPdf() {
    setExporting(true);
    setMessage(null);
    try {
      await documentFontsReady();
      const nodes = Array.from(
        globalThis.document.querySelectorAll<HTMLElement>("[data-manual-export-slide]")
      );
      if (nodes.length !== renderModel.deck.slides.length) {
        throw new Error("Exportní náhled není připravený.");
      }
      const [{ toPng }, { jsPDF }] = await Promise.all([
        import("html-to-image"),
        import("jspdf")
      ]);
      const pdf = new jsPDF({
        orientation: "landscape",
        unit: "px",
        format: [1920, 1080],
        compress: true,
        hotfixes: ["px_scaling"]
      });

      for (let index = 0; index < nodes.length; index += 1) {
        const image = await toPng(nodes[index]!, {
          cacheBust: true,
          pixelRatio: 1,
          width: 1920,
          height: 1080
        });
        if (index > 0) pdf.addPage([1920, 1080], "landscape");
        pdf.addImage(image, "PNG", 0, 0, 1920, 1080, undefined, "FAST");
      }

      pdf.save(`${safeFileName(document.name)}.pdf`);
      setMessage({
        tone: "ok",
        text: "Jednorázové PDF je hotové. Databáze ani uložené prezentace se nezměnily."
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "PDF export selhal."
      });
    } finally {
      setExporting(false);
    }
  }

  function openPreview() {
    setPreviewSlideId(activeSlide.id);
    setPreviewOpen(true);
  }

  return (
    <div className="manual-presentation-studio">
      <header className="manual-presentation-head">
        <div>
          <p className="eyebrow">Ruční prezentace</p>
          <h1 className="page-title">Prezentace a PDF bez přepisování šablon</h1>
          <p className="page-copy">
            Každý slide má vlastní texty, jídla, ceny, alergeny, fotografie i rozložení.
            Výsledek vidíte živě před jednorázovým PDF nebo dlouhodobým uložením.
          </p>
        </div>
        <div className="manual-head-actions">
          <button className="button" onClick={startNew} type="button">
            <FilePlus2 aria-hidden="true" size={19} />
            Nová
          </button>
          <button className="button" onClick={openPreview} type="button">
            <Eye aria-hidden="true" size={19} />
            Celý náhled
          </button>
          <button className="button" disabled={exporting} onClick={() => void exportPdf()} type="button">
            {exporting ? (
              <Loader2 aria-hidden="true" className="spin" size={19} />
            ) : (
              <Download aria-hidden="true" size={19} />
            )}
            Jednorázové PDF
          </button>
          <button
            className="button primary"
            disabled={saving || !canPersist || (!dirty && Boolean(activeSaved))}
            onClick={() => void saveLongTerm()}
            type="button"
          >
            {saving ? (
              <Loader2 aria-hidden="true" className="spin" size={19} />
            ) : (
              <Save aria-hidden="true" size={19} />
            )}
            Dlouhodobě uložit
          </button>
        </div>
      </header>

      {!canPersist ? (
        <div className="production-banner" role="status">
          <LayoutTemplate aria-hidden="true" size={20} />
          <strong>Jednorázový editor a PDF fungují.</strong>
          <span>
            {persistHint ?? "Dlouhodobé verze může ukládat přihlášený vlastník, admin nebo editor."}
          </span>
        </div>
      ) : null}

      {message ? (
        <div className={`manual-message ${message.tone}`} role={message.tone === "error" ? "alert" : "status"}>
          {message.text}
        </div>
      ) : null}

      <section className="manual-saved-bar" aria-label="Dlouhodobě uložené prezentace">
        <div>
          <strong>Dlouhodobě uložené</strong>
          <span>{presentations.length} aktivních prezentací</span>
        </div>
        <select
          aria-label="Otevřít uloženou prezentaci"
          onChange={(event) => {
            const presentation = presentations.find((candidate) => candidate.deckId === event.target.value);
            if (presentation) openSaved(presentation);
          }}
          value={activeSaved?.deckId ?? ""}
        >
          <option value="">Vyberte uloženou prezentaci…</option>
          {presentations.map((presentation) => (
            <option key={presentation.deckId} value={presentation.deckId}>
              {presentation.name} · {formatSavedDate(presentation.updatedAt)}
            </option>
          ))}
        </select>
        {activeSaved ? (
          <button className="button compact" disabled={saving} onClick={() => void archiveSaved()} type="button">
            <Archive aria-hidden="true" size={17} />
            Archivovat
          </button>
        ) : null}
      </section>

      <div className="manual-studio-grid">
        <aside className="manual-slide-rail card" aria-label="Slidy prezentace">
          <div className="manual-slide-rail-head">
            <strong>Slidy</strong>
            <button
              aria-label="Přidat slide"
              className="icon-button"
              disabled={document.slides.length >= MANUAL_PRESENTATION_MAX_SLIDES}
              onClick={() => addSlide()}
              type="button"
            >
              <Plus aria-hidden="true" size={19} />
            </button>
          </div>
          <div className="manual-slide-list">
            {document.slides.map((slide, index) => (
              <button
                className={`manual-slide-thumb ${slide.id === activeSlide.id ? "active" : ""}`}
                key={slide.id}
                onClick={() => {
                  setActiveSlideId(slide.id);
                  setSelectedLayerId(null);
                }}
                type="button"
              >
                <span>{index + 1}</span>
                <div className="manual-thumb-viewport">
                  <div className="manual-thumb-native">
                    <TvComposition
                      activeSlideId={slide.id}
                      deck={renderModel.deck}
                      menu={renderModel.menu}
                    />
                  </div>
                </div>
                <strong>{slide.title || `Slide ${index + 1}`}</strong>
              </button>
            ))}
          </div>
          <div className="manual-slide-actions">
            <button className="icon-button" disabled={activeSlideIndex === 0} onClick={() => moveSlide(-1)} type="button">
              <ArrowUp aria-hidden="true" size={17} />
              <span className="sr-only">Posunout nahoru</span>
            </button>
            <button
              className="icon-button"
              disabled={activeSlideIndex === document.slides.length - 1}
              onClick={() => moveSlide(1)}
              type="button"
            >
              <ArrowDown aria-hidden="true" size={17} />
              <span className="sr-only">Posunout dolů</span>
            </button>
            <button className="icon-button" onClick={duplicateSlide} type="button">
              <Copy aria-hidden="true" size={17} />
              <span className="sr-only">Duplikovat slide</span>
            </button>
            <button
              className="icon-button danger"
              disabled={document.slides.length === 1}
              onClick={deleteSlide}
              type="button"
            >
              <Trash2 aria-hidden="true" size={17} />
              <span className="sr-only">Smazat slide</span>
            </button>
          </div>
        </aside>

        <main className="manual-stage-column">
          <div className="manual-mode-switch" role="radiogroup" aria-label="Režim editoru">
            <button
              aria-checked={mode === "content"}
              className={mode === "content" ? "active" : ""}
              onClick={() => setMode("content")}
              role="radio"
              type="button"
            >
              <LayoutTemplate aria-hidden="true" size={19} />
              Obsah a fotografie
            </button>
            <button
              aria-checked={mode === "layout"}
              className={mode === "layout" ? "active" : ""}
              onClick={() => setMode("layout")}
              role="radio"
              type="button"
            >
              <Move aria-hidden="true" size={19} />
              Přesouvat prvky
            </button>
          </div>
          <div className="manual-stage card">
            <ManualPresentationCanvas
              activeSlideId={activeSlide.id}
              deck={renderModel.deck}
              itemCount={activeSlide.items.length}
              manifest={activeSlide.manifest}
              menu={renderModel.menu}
              mode={mode}
              onManifestChange={(manifest) => updateActiveSlide({ ...activeSlide, manifest })}
              onSelectLayer={setSelectedLayerId}
              selectedLayerId={selectedLayerId}
            />
          </div>
          <p className="manual-stage-help">
            {mode === "layout"
              ? "Klikněte na prvek a táhněte ho. Úchopy mění velikost; brandové prvky zůstávají zamčené."
              : "Vpravo upravujte texty, ceny, alergeny a fotky. Náhled se mění okamžitě."}
          </p>
        </main>

        <ManualPresentationInspector
          assetUrls={assetUrls}
          canteens={canteens}
          contextLocked={Boolean(activeSaved)}
          document={document}
          locations={locations}
          mode={mode}
          onDocumentChange={commit}
          onRequestPhoto={setPhotoTargetItemId}
          onSlideChange={updateActiveSlide}
          selectedLayerId={selectedLayerId}
          slide={activeSlide}
        />
      </div>

      <div aria-hidden="true" className="manual-export-root">
        {renderModel.deck.slides.map((slide) => (
          <div data-manual-export-slide key={slide.id}>
            <TvComposition activeSlideId={slide.id} deck={renderModel.deck} menu={renderModel.menu} />
          </div>
        ))}
      </div>

      {previewOpen ? (
        <div className="manual-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="manual-preview-title">
          <div className="manual-preview-modal">
            <header>
              <div>
                <p className="eyebrow">Náhled před exportem</p>
                <h2 id="manual-preview-title">{document.name || "Prezentace"}</h2>
              </div>
              <button className="icon-button" onClick={() => setPreviewOpen(false)} type="button">
                <X aria-hidden="true" size={21} />
                <span className="sr-only">Zavřít náhled</span>
              </button>
            </header>
            <ScaledTvFrame>
              <TvComposition
                activeSlideId={previewSlideId}
                deck={renderModel.deck}
                menu={renderModel.menu}
              />
            </ScaledTvFrame>
            <div className="manual-preview-controls">
              {renderModel.deck.slides.map((slide, index) => (
                <button
                  className={previewSlideId === slide.id ? "active" : ""}
                  key={slide.id}
                  onClick={() => setPreviewSlideId(slide.id)}
                  type="button"
                >
                  {index + 1}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {photoTarget ? (
        <ManualPhotoPicker
          canteenId={document.canteenId}
          dishName={photoTarget.name}
          onClose={() => setPhotoTargetItemId(null)}
          onPick={(choice) => {
            if (choice.url) {
              setAssetUrls((current) => ({ ...current, [choice.assetId]: choice.url! }));
            }
            updateActiveSlide({
              ...activeSlide,
              items: activeSlide.items.map((item) =>
                item.id === photoTarget.id
                  ? {
                      ...item,
                      photoAssetId: choice.assetId,
                      photoFocalPoint: choice.focalPoint,
                      photoSource: choice.source
                    }
                  : item
              )
            });
            setPhotoTargetItemId(null);
          }}
        />
      ) : null}
    </div>
  );
}

function createClientSlide(
  baseTemplateId: ManualPresentationLayoutId = "mains-grid"
): ManualPresentationSlide {
  const id = crypto.randomUUID();
  return {
    id,
    title: "Nový slide",
    baseTemplateId,
    durationSeconds: 10,
    manifest: createManualPresentationManifest(baseTemplateId, id),
    items: [createClientItem()]
  };
}

function createClientItem(): ManualPresentationItem {
  return {
    id: crypto.randomUUID(),
    name: "Nová položka",
    description: "",
    priceCzk: null,
    allergens: [],
    photoAssetId: null,
    photoFocalPoint: { x: 0.5, y: 0.5 },
    photoSource: null
  };
}

function createNewDocument(
  template: ManualPresentationDocument,
  locationId: string,
  canteenId: string
): ManualPresentationDocument {
  const slide = createClientSlide();
  return {
    ...structuredClone(template),
    id: crypto.randomUUID(),
    name: "Nová prezentace",
    locationId,
    canteenId,
    slides: [slide]
  };
}

function makePreviewSafe(document: ManualPresentationDocument): ManualPresentationDocument {
  return {
    ...document,
    name: document.name.trim() || "Prezentace bez názvu",
    presentationDate: /^\d{4}-\d{2}-\d{2}$/.test(document.presentationDate)
      ? document.presentationDate
      : new Date().toISOString().slice(0, 10),
    slides: document.slides.map((slide, slideIndex) => ({
      ...slide,
      title: slide.title.trim() || `Slide ${slideIndex + 1}`,
      items: slide.items.map((item, itemIndex) => ({
        ...item,
        name: item.name.trim() || `Položka ${itemIndex + 1}`,
        priceCzk:
          item.priceCzk === null || !Number.isFinite(item.priceCzk)
            ? null
            : Math.min(1_000_000, Math.max(0, Math.round(item.priceCzk)))
      }))
    }))
  };
}

function collectAssetIds(document: ManualPresentationDocument) {
  return [
    ...new Set(
      document.slides.flatMap((slide) =>
        slide.items.flatMap((item) => (item.photoAssetId ? [item.photoAssetId] : []))
      )
    )
  ];
}

async function documentFontsReady() {
  if ("fonts" in globalThis.document) {
    await globalThis.document.fonts.ready;
  }
}

function safeFileName(value: string) {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 70) || "prezentace"
  );
}

function formatSavedDate(value: string) {
  return new Intl.DateTimeFormat("cs-CZ", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}
