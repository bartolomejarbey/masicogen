"use client";

/* eslint-disable react-hooks/refs -- drag refs are accessed only from pointer event handlers */

import { useRef } from "react";
import type {
  LayerFrame,
  SectionKey,
  TemplateLayerV2,
  TemplateManifestV2
} from "@masico/shared";
import { Lock } from "lucide-react";

type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

type DragState = {
  kind: "move" | "resize";
  handle: ResizeHandle | null;
  layerId: string;
  startClientX: number;
  startClientY: number;
  startFrame: LayerFrame;
};

/**
 * Drag-n-drop overlay nad TvComposition. Kreslí jen klikací rámečky vrstev —
 * náhled i škálování dodává rodič přes `ScaledTvFrame` (overlay žije uvnitř
 * `.scaled-tv-inner`, takže rámce vrstev sedí 1:1 na canvas px).
 * Snapping na mřížku 16 px je zapnutý; při držení Alt je pohyb volný.
 */
export function LayerEditorOverlay({
  manifest,
  sectionCounts,
  selectedLayerId,
  onSelectLayer,
  onManifestChange
}: {
  manifest: TemplateManifestV2;
  /** Počet vyplněných kolonek podle skupin — overlay schová stejné sloty jako TvComposition. */
  sectionCounts: Partial<Record<SectionKey, number>>;
  selectedLayerId: string | null;
  onSelectLayer: (layerId: string | null) => void;
  onManifestChange: (manifest: TemplateManifestV2) => void;
}) {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);

  const sortedLayers = [...manifest.layers].sort(
    (left, right) => left.frame.zIndex - right.frame.zIndex
  );
  const isEmptySlot = (layer: TemplateLayerV2) =>
    "binding" in layer &&
    layer.binding?.source === "item" &&
    layer.binding.index >= (sectionCounts[layer.binding.sectionKey] ?? 0);
  const hiddenGroups = new Set(
    sortedLayers.flatMap((layer) => (isEmptySlot(layer) && layer.group ? [layer.group] : []))
  );
  const overlayLayers = sortedLayers.filter((layer) => {
    if (layer.group && hiddenGroups.has(layer.group)) return false;
    return !isEmptySlot(layer);
  });

  function beginDrag(
    event: React.PointerEvent,
    layer: TemplateLayerV2,
    kind: "move" | "resize",
    handle: ResizeHandle | null = null
  ) {
    if (layer.locked) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      kind,
      handle,
      layerId: layer.id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startFrame: { ...layer.frame }
    };
  }

  function handlePointerMove(event: React.PointerEvent) {
    const drag = dragRef.current;
    const overlay = overlayRef.current;
    if (!drag || !overlay) return;
    const scale = overlay.getBoundingClientRect().width / manifest.canvas.width;
    const dx = (event.clientX - drag.startClientX) / scale;
    const dy = (event.clientY - drag.startClientY) / scale;
    // Alt = volný pohyb bez přichytávání na mřížku.
    const grid = event.altKey ? 1 : 16;
    const nextFrame =
      drag.kind === "move"
        ? moveFrame(drag.startFrame, dx, dy, manifest, grid)
        : resizeFrame(drag.startFrame, drag.handle ?? "se", dx, dy, manifest, grid);

    onManifestChange({
      ...manifest,
      layers: manifest.layers.map((layer) =>
        layer.id === drag.layerId ? { ...layer, frame: nextFrame } : layer
      )
    });
  }

  function finishDrag() {
    dragRef.current = null;
  }

  function nudge(event: React.KeyboardEvent, layer: TemplateLayerV2) {
    if (layer.locked) return;
    const step = event.shiftKey ? 1 : 8;
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step]
    };
    const move = delta[event.key];
    if (!move) return;
    event.preventDefault();
    const nextFrame = moveFrame(layer.frame, move[0], move[1], manifest, 1);
    onManifestChange({
      ...manifest,
      layers: manifest.layers.map((candidate) =>
        candidate.id === layer.id ? { ...candidate, frame: nextFrame } : candidate
      )
    });
  }

  return (
    <div
      className="manual-layer-overlay layout"
      onPointerCancel={finishDrag}
      onPointerDown={() => onSelectLayer(null)}
      onPointerMove={handlePointerMove}
      onPointerUp={finishDrag}
      ref={overlayRef}
    >
      {overlayLayers.map((layer) => {
        const selected = selectedLayerId === layer.id;
        return (
          <div
            className={`manual-layer-target ${selected ? "selected" : ""} ${layer.locked ? "locked" : ""}`}
            key={layer.id}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelectLayer(layer.id);
                return;
              }
              if (selected) nudge(event, layer);
            }}
            onPointerDown={(event) => {
              event.stopPropagation();
              onSelectLayer(layer.id);
              beginDrag(event, layer, "move");
            }}
            role="button"
            style={{
              left: layer.frame.x,
              top: layer.frame.y,
              width: layer.frame.w,
              height: layer.frame.h,
              zIndex: 50 + layer.frame.zIndex
            }}
            tabIndex={0}
          >
            <span className="manual-layer-tag">
              {layer.locked ? <Lock aria-hidden="true" size={13} /> : null}
              {manualLayerLabel(layer)}
            </span>
            {selected && !layer.locked
              ? (["nw", "n", "ne", "e", "se", "s", "sw", "w"] as ResizeHandle[]).map((handle) => (
                  <span
                    className={`manual-resize-handle ${handle}`}
                    key={handle}
                    onPointerDown={(event) => beginDrag(event, layer, "resize", handle)}
                  />
                ))
              : null}
          </div>
        );
      })}
    </div>
  );
}

const manualSlotLabels: Record<string, string> = {
  soups: "Polévka",
  mains: "Hlavní jídlo",
  pizza: "Pizza",
  buffet: "Položka bufetu",
  special: "Nabídka"
};

export function manualLayerLabel(layer: TemplateLayerV2) {
  if (layer.type === "logo") return "Logo";
  if (layer.type === "shape") return "Podklad";
  if (layer.type === "image") {
    return layer.binding?.source === "item"
      ? `Fotka · ${manualSlotLabels[layer.binding.sectionKey] ?? "Položka"} ${layer.binding.index + 1}`
      : "Obrázek";
  }
  if (layer.binding?.source === "item") {
    const fields = {
      name: "Název",
      description: "Popis",
      price: "Cena",
      allergens: "Alergeny",
      photo: "Fotka"
    };
    const slot = manualSlotLabels[layer.binding.sectionKey] ?? "Položka";
    return `${fields[layer.binding.field]} · ${slot} ${layer.binding.index + 1}`;
  }
  if (layer.binding?.source === "menu") {
    return layer.binding.field === "date" ? "Datum" : "Nadpis";
  }
  return layer.text?.slice(0, 24) || "Text";
}

function moveFrame(
  start: LayerFrame,
  dx: number,
  dy: number,
  manifest: TemplateManifestV2,
  grid: number
): LayerFrame {
  const safe = manifest.safeArea;
  const x = Math.round((start.x + dx) / grid) * grid;
  const y = Math.round((start.y + dy) / grid) * grid;
  return {
    ...start,
    x: clamp(x, safe.x, safe.x + safe.width - start.w),
    y: clamp(y, safe.y, safe.y + safe.height - start.h)
  };
}

function resizeFrame(
  start: LayerFrame,
  handle: ResizeHandle,
  dx: number,
  dy: number,
  manifest: TemplateManifestV2,
  grid: number
): LayerFrame {
  const safe = manifest.safeArea;
  const snap = (value: number) => Math.round(value / grid) * grid;
  let { x, y, w, h } = start;
  if (handle.includes("e")) w = snap(w + dx);
  if (handle.includes("s")) h = snap(h + dy);
  if (handle.includes("w")) {
    x = snap(x + dx);
    w = start.x + start.w - x;
  }
  if (handle.includes("n")) {
    y = snap(y + dy);
    h = start.y + start.h - y;
  }

  w = Math.max(48, w);
  h = Math.max(32, h);
  x = clamp(x, safe.x, start.x + start.w - 48);
  y = clamp(y, safe.y, start.y + start.h - 32);
  w = Math.min(w, safe.x + safe.width - x);
  h = Math.min(h, safe.y + safe.height - y);

  return {
    ...start,
    x: Math.round(x),
    y: Math.round(y),
    w: Math.round(w),
    h: Math.round(h)
  };
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}
