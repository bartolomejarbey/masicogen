"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  brandTokens,
  getDailyLoopTemplate,
  type DeckManifest,
  type LayerBinding,
  type LayerFrame,
  type MenuExtractionResult,
  type TemplateLayerV2,
  type TemplateManifestV2
} from "@masico/shared";
import { TvComposition } from "@masico/render";
import {
  ArrowDownToLine,
  ArrowUpToLine,
  Check,
  Loader2,
  Lock,
  LockOpen,
  MousePointerClick,
  Move,
  Redo2,
  RotateCcw,
  Save,
  TriangleAlert,
  Undo2
} from "lucide-react";
import { ScaledTvFrame } from "./ScaledTvFrame";

const GRID = 32;
const SNAP_THRESHOLD = 8;
const MIN_LAYER_SIZE = { w: 48, h: 32 };

const minFontByRole: Record<string, number> = {
  headline: 72,
  subheadline: 44,
  item: 44,
  price: 44,
  note: 30,
  legend: 30
};

const colorSwatches = [
  { label: "Tmavá", value: brandTokens.ink },
  { label: "Červená", value: brandTokens.red },
  { label: "Bílá", value: brandTokens.white },
  { label: "Šedá", value: "#4a443f" }
];

type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

type DragState = {
  kind: "move" | "resize";
  handle: ResizeHandle | null;
  layerId: string;
  startClientX: number;
  startClientY: number;
  startFrame: LayerFrame;
  manifestBefore: TemplateManifestV2;
};

type TemplateEditorProps = {
  slug: string;
  initialManifest: TemplateManifestV2;
  baseVersion: number | null;
  canEditLayout: boolean;
};

export function TemplateEditor({
  slug,
  initialManifest,
  baseVersion,
  canEditLayout
}: TemplateEditorProps) {
  const [manifest, setManifest] = useState<TemplateManifestV2>(initialManifest);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<"content" | "layout">("content");
  const [undoStack, setUndoStack] = useState<TemplateManifestV2[]>([]);
  const [redoStack, setRedoStack] = useState<TemplateManifestV2[]>([]);
  const [currentBaseVersion, setCurrentBaseVersion] = useState(baseVersion);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);

  const sampleMenu = useMemo(buildSampleMenu, []);
  const previewDeck = useMemo<DeckManifest>(
    () => ({
      id: "deck-editor-preview",
      orgId: "00000000-0000-4000-8000-000000000000",
      locationId: "00000000-0000-4000-8000-000000000000",
      canteenId: "00000000-0000-4000-8000-000000000000",
      menuVersionId: "editor-preview",
      status: "draft",
      fps: 30,
      canvas: { width: 1920, height: 1080, aspectRatio: "16:9" },
      slides: [
        {
          id: "slide-editor",
          templateId: manifest.id,
          title: manifest.name,
          menuSectionIds: [],
          menuItemIds: [],
          backgroundAssetId: null,
          durationFrames: manifest.durationFrames,
          sortOrder: 1
        }
      ],
      templateVersionIds: [`${manifest.id}@editor`],
      templateManifests: { [manifest.id]: manifest },
      assetIds: [],
      assetUrls: {},
      rendererVersion: "0.2.0"
    }),
    [manifest]
  );

  const selectedLayer = manifest.layers.find((layer) => layer.id === selectedId) ?? null;
  const guardrailProblems = useMemo(() => validateGuardrails(manifest), [manifest]);

  const commit = useCallback(
    (before: TemplateManifestV2, next: TemplateManifestV2) => {
      setUndoStack((stack) => [...stack.slice(-49), before]);
      setRedoStack([]);
      setManifest(next);
      setDirty(true);
      setSaveMessage(null);
    },
    []
  );

  const updateLayer = useCallback(
    (layerId: string, patcher: (layer: TemplateLayerV2) => TemplateLayerV2) => {
      setManifest((previous) => {
        const next = {
          ...previous,
          layers: previous.layers.map((layer) => (layer.id === layerId ? patcher(layer) : layer))
        };
        return next;
      });
      setDirty(true);
      setSaveMessage(null);
    },
    []
  );

  const updateLayerWithHistory = useCallback(
    (layerId: string, patcher: (layer: TemplateLayerV2) => TemplateLayerV2) => {
      const before = manifest;
      const next = {
        ...manifest,
        layers: manifest.layers.map((layer) => (layer.id === layerId ? patcher(layer) : layer))
      };
      commit(before, next);
    },
    [commit, manifest]
  );

  function undo() {
    setUndoStack((stack) => {
      if (stack.length === 0) {
        return stack;
      }
      const previous = stack[stack.length - 1];
      setRedoStack((redo) => [...redo, manifest]);
      setManifest(previous);
      setDirty(true);
      return stack.slice(0, -1);
    });
  }

  function redo() {
    setRedoStack((stack) => {
      if (stack.length === 0) {
        return stack;
      }
      const next = stack[stack.length - 1];
      setUndoStack((undoS) => [...undoS, manifest]);
      setManifest(next);
      setDirty(true);
      return stack.slice(0, -1);
    });
  }

  function resetToDefault() {
    const fallback = getDailyLoopTemplate(slug);
    if (!fallback) {
      return;
    }
    commit(manifest, fallback);
    setSelectedId(null);
  }

  function overlayScale() {
    const rect = overlayRef.current?.getBoundingClientRect();
    return rect ? rect.width / manifest.canvas.width : 1;
  }

  function beginDrag(
    event: React.PointerEvent,
    layer: TemplateLayerV2,
    kind: "move" | "resize",
    handle: ResizeHandle | null = null
  ) {
    if (mode !== "layout" || layer.locked) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    (event.target as HTMLElement).setPointerCapture(event.pointerId);

    dragRef.current = {
      kind,
      handle,
      layerId: layer.id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startFrame: { ...layer.frame },
      manifestBefore: manifest
    };
  }

  function onPointerMove(event: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag) {
      return;
    }

    const scale = overlayScale();
    const dx = (event.clientX - drag.startClientX) / scale;
    const dy = (event.clientY - drag.startClientY) / scale;

    updateLayer(drag.layerId, (layer) => ({
      ...layer,
      frame:
        drag.kind === "move"
          ? snapAndClampMove(drag.startFrame, dx, dy, manifest)
          : snapAndClampResize(drag.startFrame, drag.handle ?? "se", dx, dy, manifest)
    }));
  }

  function onPointerUp() {
    const drag = dragRef.current;
    if (!drag) {
      return;
    }
    dragRef.current = null;

    // Zapsat celé gesto jako jeden krok zpět.
    setUndoStack((stack) => [...stack.slice(-49), drag.manifestBefore]);
    setRedoStack([]);
  }

  async function save() {
    setSaving(true);
    setSaveError(null);
    setSaveMessage(null);

    try {
      const response = await fetch("/api/templates/save-version", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          templateId: slug,
          manifest,
          baseVersion: currentBaseVersion
        })
      });
      const body = (await response.json().catch(() => null)) as
        | { ok?: boolean; version?: number; error?: string }
        | null;

      if (!response.ok || !body?.ok) {
        throw new Error(body?.error ?? `Uložení selhalo (${response.status}).`);
      }

      setCurrentBaseVersion(body.version ?? null);
      setDirty(false);
      setSaveMessage(
        `Uloženo jako verze ${body.version}. Použije se při příštím spuštění menu.`
      );
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Uložení selhalo.");
    } finally {
      setSaving(false);
    }
  }

  const sortedLayers = [...manifest.layers].sort((a, b) => a.frame.zIndex - b.frame.zIndex);

  return (
    <div className="template-editor">
      <header className="template-editor-head">
        <div>
          <p className="eyebrow">Editor šablony</p>
          <h1>{manifest.name}</h1>
          <p className="template-editor-subtitle">
            {currentBaseVersion
              ? `Aktuální verze ${currentBaseVersion} — uložením vznikne nová verze, nic se nepřepíše.`
              : "Šablona zatím nemá uloženou verzi — uložením vznikne verze 1."}
          </p>
        </div>
        <div className="template-editor-actions">
          <button className="button" disabled={undoStack.length === 0} onClick={undo} type="button">
            <Undo2 size={20} aria-hidden="true" />
            Zpět
          </button>
          <button className="button" disabled={redoStack.length === 0} onClick={redo} type="button">
            <Redo2 size={20} aria-hidden="true" />
            Znovu
          </button>
          <button className="button" onClick={resetToDefault} type="button">
            <RotateCcw size={20} aria-hidden="true" />
            Vrátit původní šablonu
          </button>
          <button
            className="button primary"
            disabled={saving || !dirty || guardrailProblems.length > 0}
            onClick={() => void save()}
            type="button"
          >
            {saving ? (
              <Loader2 className="spin" size={20} aria-hidden="true" />
            ) : (
              <Save size={20} aria-hidden="true" />
            )}
            Uložit šablonu
          </button>
        </div>
      </header>

      {canEditLayout ? (
        <div className="template-mode-switch" role="radiogroup" aria-label="Režim úprav">
          <button
            className={`template-mode ${mode === "content" ? "active" : ""}`}
            onClick={() => setMode("content")}
            role="radio"
            aria-checked={mode === "content"}
            type="button"
          >
            <MousePointerClick size={20} aria-hidden="true" />
            Upravit texty
            <small>Bezpečný režim — rozložení se nemění</small>
          </button>
          <button
            className={`template-mode ${mode === "layout" ? "active" : ""}`}
            onClick={() => setMode("layout")}
            role="radio"
            aria-checked={mode === "layout"}
            type="button"
          >
            <Move size={20} aria-hidden="true" />
            Přesouvat prvky
            <small>Tažením myší, jako v PowerPointu</small>
          </button>
        </div>
      ) : null}

      {guardrailProblems.length > 0 ? (
        <div className="template-guardrails" role="alert">
          <TriangleAlert size={20} aria-hidden="true" />
          <ul>
            {guardrailProblems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {saveError ? (
        <div className="launch-error" role="alert">
          <strong>Uložení se nepovedlo.</strong>
          <span>{saveError}</span>
        </div>
      ) : null}

      {saveMessage ? (
        <div className="launch-result" role="status">
          <div>
            <Check size={20} aria-hidden="true" />
            <strong>{saveMessage}</strong>
          </div>
        </div>
      ) : null}

      <div className="template-editor-grid">
        <div className="template-stage card">
          <ScaledTvFrame>
            <div style={{ position: "relative", width: "1920px", height: "1080px" }}>
              <TvComposition deck={previewDeck} menu={sampleMenu} activeSlideId="slide-editor" showSafeArea />
              <div
                className={`editor-overlay ${mode}`}
                ref={overlayRef}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerDown={() => setSelectedId(null)}
              >
                {sortedLayers.map((layer) => {
                  const selected = layer.id === selectedId;
                  return (
                    <div
                      key={layer.id}
                      className={`editor-layer ${selected ? "selected" : ""} ${layer.locked ? "locked" : ""}`}
                      style={{
                        left: `${layer.frame.x}px`,
                        top: `${layer.frame.y}px`,
                        width: `${layer.frame.w}px`,
                        height: `${layer.frame.h}px`,
                        zIndex: 20 + layer.frame.zIndex
                      }}
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        setSelectedId(layer.id);
                        beginDrag(event, layer, "move");
                      }}
                    >
                      <span className="editor-layer-tag">
                        {layer.locked ? <Lock size={14} aria-hidden="true" /> : null}
                        {layerLabel(layer)}
                      </span>
                      {selected && mode === "layout" && !layer.locked
                        ? (["nw", "n", "ne", "e", "se", "s", "sw", "w"] as ResizeHandle[]).map(
                            (handle) => (
                              <span
                                key={handle}
                                className={`editor-handle ${handle}`}
                                onPointerDown={(event) => beginDrag(event, layer, "resize", handle)}
                              />
                            )
                          )
                        : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </ScaledTvFrame>
          <p className="template-stage-note">
            Náhled ukazuje ukázkové menu. Čárkovaný rám je bezpečná zóna televize — prvky ji nesmí
            opustit.
          </p>
        </div>

        <aside className="template-inspector card pad">
          {selectedLayer ? (
            <LayerInspector
              layer={selectedLayer}
              mode={mode}
              onChange={(patcher) => updateLayerWithHistory(selectedLayer.id, patcher)}
            />
          ) : (
            <div className="template-inspector-empty">
              <MousePointerClick size={28} aria-hidden="true" />
              <p>
                Klepněte na prvek v náhledu.
                {mode === "layout"
                  ? " Tažením ho přesunete, úchopy v rozích mění velikost."
                  : " Můžete upravit jeho text a písmo."}
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function LayerInspector({
  layer,
  mode,
  onChange
}: {
  layer: TemplateLayerV2;
  mode: "content" | "layout";
  onChange: (patcher: (layer: TemplateLayerV2) => TemplateLayerV2) => void;
}) {
  return (
    <div className="layer-inspector">
      <h2>{layerLabel(layer)}</h2>

      {layer.locked ? (
        <p className="layer-inspector-note">
          <Lock size={18} aria-hidden="true" /> Tento prvek je zamčený — patří k brandu a nemění se.
        </p>
      ) : null}

      {layer.type === "text" ? (
        <>
          {!layer.binding || layer.binding.source === "static" ? (
            <label>
              Text
              <textarea
                onChange={(event) =>
                  onChange((current) =>
                    current.type === "text" ? { ...current, text: event.target.value } : current
                  )
                }
                rows={2}
                value={layer.text ?? ""}
              />
            </label>
          ) : (
            <p className="layer-inspector-note">
              Text se dosazuje z denního menu ({bindingLabel(layer.binding)}).
            </p>
          )}

          <label>
            Velikost písma: {layer.fontSizePx} px
            <input
              max={200}
              min={minFontByRole[layer.role] ?? 30}
              onChange={(event) =>
                onChange((current) =>
                  current.type === "text"
                    ? { ...current, fontSizePx: Number(event.target.value) }
                    : current
                )
              }
              step={2}
              type="range"
              value={layer.fontSizePx}
            />
            <small>Minimum pro čitelnost z dálky: {minFontByRole[layer.role] ?? 30} px</small>
          </label>

          <fieldset className="layer-colors">
            <legend>Barva</legend>
            {colorSwatches.map((swatch) => (
              <button
                key={swatch.value}
                className={`layer-color ${layer.color === swatch.value ? "selected" : ""}`}
                onClick={() =>
                  onChange((current) =>
                    current.type === "text" ? { ...current, color: swatch.value } : current
                  )
                }
                style={{ background: swatch.value }}
                title={swatch.label}
                type="button"
              />
            ))}
          </fieldset>

          <label>
            Zarovnání
            <select
              onChange={(event) =>
                onChange((current) =>
                  current.type === "text"
                    ? { ...current, align: event.target.value as "left" | "center" | "right" }
                    : current
                )
              }
              value={layer.align}
            >
              <option value="left">Vlevo</option>
              <option value="center">Na střed</option>
              <option value="right">Vpravo</option>
            </select>
          </label>
        </>
      ) : null}

      {layer.type === "image" ? (
        <p className="layer-inspector-note">
          {layer.binding?.source === "item"
            ? "Fotka se dosazuje z denního menu — vyměňuje se ve formuláři dne, ne v šabloně."
            : "Obrázek šablony."}
        </p>
      ) : null}

      {layer.type === "logo" ? (
        <label>
          Varianta loga
          <select
            onChange={(event) =>
              onChange((current) =>
                current.type === "logo"
                  ? { ...current, variant: event.target.value as "red" | "white" }
                  : current
              )
            }
            value={layer.variant}
          >
            <option value="red">Červené (světlé pozadí)</option>
            <option value="white">Bílé (tmavé pozadí)</option>
          </select>
        </label>
      ) : null}

      {layer.type === "shape" ? (
        <fieldset className="layer-colors">
          <legend>Výplň</legend>
          {colorSwatches.map((swatch) => (
            <button
              key={swatch.value}
              className={`layer-color ${layer.fill === swatch.value ? "selected" : ""}`}
              onClick={() =>
                onChange((current) =>
                  current.type === "shape" ? { ...current, fill: swatch.value } : current
                )
              }
              style={{ background: swatch.value }}
              title={swatch.label}
              type="button"
            />
          ))}
        </fieldset>
      ) : null}

      {mode === "layout" && !layer.locked ? (
        <div className="layer-layout-controls">
          <div className="layer-zindex">
            <span>Vrstvení</span>
            <button
              className="button compact"
              onClick={() =>
                onChange((current) => ({
                  ...current,
                  frame: { ...current.frame, zIndex: current.frame.zIndex + 1 }
                }))
              }
              type="button"
            >
              <ArrowUpToLine size={18} aria-hidden="true" />
              Dopředu
            </button>
            <button
              className="button compact"
              onClick={() =>
                onChange((current) => ({
                  ...current,
                  frame: { ...current.frame, zIndex: Math.max(0, current.frame.zIndex - 1) }
                }))
              }
              type="button"
            >
              <ArrowDownToLine size={18} aria-hidden="true" />
              Dozadu
            </button>
          </div>
          <button
            className="button compact"
            onClick={() => onChange((current) => ({ ...current, locked: true }))}
            type="button"
          >
            <LockOpen size={18} aria-hidden="true" />
            Zamknout prvek
          </button>
        </div>
      ) : null}
    </div>
  );
}

function layerLabel(layer: TemplateLayerV2) {
  if (layer.type === "logo") {
    return "Logo MASI-CO";
  }
  if (layer.type === "shape") {
    return "Podklad";
  }
  if (layer.type === "image") {
    return layer.binding?.source === "item" ? "Fotka jídla" : "Obrázek";
  }
  if (layer.binding?.source === "item") {
    return `${bindingLabel(layer.binding)}`;
  }
  if (layer.binding?.source === "menu") {
    return layer.binding.field === "date" ? "Datum" : "Nadpis";
  }
  return layer.text ? `Text: ${layer.text.slice(0, 22)}` : "Text";
}

function bindingLabel(binding: LayerBinding) {
  if (binding.source !== "item") {
    return "menu";
  }

  const sections: Record<string, string> = {
    soups: "polévka",
    mains: "jídlo",
    pizza: "pizza",
    buffet: "bufet",
    special: "speciál"
  };
  const fields: Record<string, string> = {
    name: "název",
    description: "popis",
    price: "cena",
    allergens: "alergeny",
    photo: "fotka"
  };

  return `${sections[binding.sectionKey] ?? binding.sectionKey} ${binding.index + 1} — ${
    fields[binding.field] ?? binding.field
  }`;
}

function snapValue(value: number, candidates: number[], threshold = SNAP_THRESHOLD) {
  let best = value;
  let bestDistance = threshold + 1;

  const gridCandidate = Math.round(value / GRID) * GRID;
  for (const candidate of [gridCandidate, ...candidates]) {
    const distance = Math.abs(candidate - value);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }

  return bestDistance <= threshold ? best : value;
}

function snapAndClampMove(
  start: LayerFrame,
  dx: number,
  dy: number,
  manifest: TemplateManifestV2
): LayerFrame {
  const safe = manifest.safeArea;
  const rawX = start.x + dx;
  const rawY = start.y + dy;

  const snappedX = snapValue(rawX, [
    safe.x,
    safe.x + safe.width - start.w,
    manifest.canvas.width / 2 - start.w / 2
  ]);
  const snappedY = snapValue(rawY, [
    safe.y,
    safe.y + safe.height - start.h,
    manifest.canvas.height / 2 - start.h / 2
  ]);

  return {
    ...start,
    x: Math.round(clamp(snappedX, safe.x, safe.x + safe.width - start.w)),
    y: Math.round(clamp(snappedY, safe.y, safe.y + safe.height - start.h))
  };
}

function snapAndClampResize(
  start: LayerFrame,
  handle: ResizeHandle,
  dx: number,
  dy: number,
  manifest: TemplateManifestV2
): LayerFrame {
  const safe = manifest.safeArea;
  let { x, y, w, h } = start;

  if (handle.includes("e")) {
    w = start.w + dx;
  }
  if (handle.includes("s")) {
    h = start.h + dy;
  }
  if (handle.includes("w")) {
    x = start.x + dx;
    w = start.w - dx;
  }
  if (handle.includes("n")) {
    y = start.y + dy;
    h = start.h - dy;
  }

  w = Math.max(MIN_LAYER_SIZE.w, w);
  h = Math.max(MIN_LAYER_SIZE.h, h);
  x = clamp(x, safe.x, start.x + start.w - MIN_LAYER_SIZE.w);
  y = clamp(y, safe.y, start.y + start.h - MIN_LAYER_SIZE.h);
  w = Math.min(w, safe.x + safe.width - x);
  h = Math.min(h, safe.y + safe.height - y);

  return {
    ...start,
    x: Math.round(x),
    y: Math.round(y),
    w: Math.round(snapValue(x + w, [safe.x + safe.width]) - x),
    h: Math.round(snapValue(y + h, [safe.y + safe.height]) - y)
  };
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

function validateGuardrails(manifest: TemplateManifestV2) {
  const problems: string[] = [];

  for (const layer of manifest.layers) {
    const { frame } = layer;

    if (
      frame.x < 0 ||
      frame.y < 0 ||
      frame.x + frame.w > manifest.canvas.width ||
      frame.y + frame.h > manifest.canvas.height
    ) {
      problems.push(`Prvek „${layerLabel(layer)}" přesahuje mimo obrazovku.`);
    }

    if (layer.type === "text") {
      const minimum = minFontByRole[layer.role] ?? 30;
      if (layer.fontSizePx < minimum) {
        problems.push(
          `„${layerLabel(layer)}": písmo ${layer.fontSizePx} px je z dálky nečitelné (minimum ${minimum} px).`
        );
      }
    }
  }

  return problems;
}

function sampleItem(
  id: string,
  name: string,
  price: number,
  allergens: Array<"1" | "3" | "7" | "9" | "10">,
  description: string | null = null
) {
  return {
    id,
    name,
    description,
    prices: [{ label: "porce", amount: price, currency: "CZK" as const }],
    allergens,
    allergensUnknown: false,
    dietaryTags: [],
    modifiers: [],
    available: true,
    highlight: false,
    sourceRefs: [],
    confidence: 1
  };
}

function buildSampleMenu(): MenuExtractionResult {
  return {
    restaurant: { name: "MASI-CO food", locale: "cs-CZ", currency: "CZK" },
    date: "2026-07-08",
    locationName: "Jídelna MASI-CO",
    warnings: [],
    sections: [
      {
        id: "soups",
        name: "Polévky",
        items: [
          sampleItem("s1", "Hovězí vývar s nudlemi", 45, ["1", "3", "9"]),
          sampleItem("s2", "Gulášová polévka", 49, ["1", "9"])
        ]
      },
      {
        id: "mains",
        name: "Hlavní jídla",
        items: [
          sampleItem("m1", "Svíčková na smetaně, houskový knedlík", 165, ["1", "3", "7", "9", "10"]),
          sampleItem("m2", "Smažený vepřový řízek, bramborový salát", 159, ["1", "3", "7", "10"]),
          sampleItem("m3", "Hovězí guláš, houskový knedlík", 149, ["1", "3", "7"]),
          sampleItem("m4", "Kuřecí rizoto se zeleninou a sýrem", 135, ["7", "9"]),
          sampleItem("m5", "Zeleninový salát s grilovaným hermelínem", 139, ["7", "10"])
        ]
      },
      {
        id: "pizza",
        name: "Pizza dne",
        items: [
          sampleItem("p1", "Pizza Prosciutto e Funghi", 169, ["1", "7"], "tomat, mozzarella, šunka, žampiony, rukola")
        ]
      },
      {
        id: "buffet",
        name: "Teplý bufet",
        items: [
          sampleItem("b1", "Pečené kuřecí stehno", 32, ["1"]),
          sampleItem("b2", "Smažený květák", 26, ["1", "3"]),
          sampleItem("b3", "Bramborový guláš", 22, ["1"]),
          sampleItem("b4", "Rýže dušená", 12, []),
          sampleItem("b5", "Opékané brambory", 14, [])
        ]
      },
      {
        id: "special",
        name: "Dnes navíc",
        items: [
          sampleItem("d1", "Domácí jablečný štrúdl", 45, ["1", "3"]),
          sampleItem("d2", "Palačinka s tvarohem", 49, ["1", "3", "7"])
        ]
      }
    ]
  };
}
