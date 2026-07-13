"use client";

import type { LayerFrame, TemplateLayerV2, TemplateManifestV2 } from "@masico/shared";
import { AlignCenter, Lock, MousePointer2, RotateCcw } from "lucide-react";
import { manualLayerLabel } from "./LayerEditorOverlay";

/**
 * Pravý panel v režimu „Rozvržení": přesné číselné umístění vybraného prvku,
 * výběr prvku ze seznamu a návrat rozvržení na výchozí šablonu. Přetahování
 * řeší overlay v náhledu — tady jde o milimetrovou přesnost.
 */
export function LayoutInspector({
  manifest,
  selectedLayerId,
  onSelectLayer,
  onManifestChange,
  onResetLayout
}: {
  manifest: TemplateManifestV2;
  selectedLayerId: string | null;
  onSelectLayer: (layerId: string | null) => void;
  onManifestChange: (manifest: TemplateManifestV2) => void;
  /** Vrátí celé rozvržení slidu na výchozí šablonu. */
  onResetLayout: () => void;
}) {
  const safe = manifest.safeArea;
  const layersTopFirst = [...manifest.layers].sort(
    (left, right) => right.frame.zIndex - left.frame.zIndex
  );
  const selected = manifest.layers.find((layer) => layer.id === selectedLayerId) ?? null;

  function patchFrame(layerId: string, next: Partial<LayerFrame>) {
    onManifestChange(patchLayerFrame(manifest, layerId, next, safe));
  }

  function patchTextLayer(layerId: string, patch: Partial<Extract<TemplateLayerV2, { type: "text" }>>) {
    onManifestChange({
      ...manifest,
      layers: manifest.layers.map((layer) =>
        layer.id === layerId && layer.type === "text" ? { ...layer, ...patch } : layer
      )
    });
  }

  return (
    <aside className="prez-layout-inspector card">
      <section className="prez-inspector-section">
        <p className="eyebrow">
          <MousePointer2 aria-hidden="true" size={14} /> Rozvržení
        </p>
        <p className="prez-hint">
          Chytněte prvek v náhledu a přetáhněte ho, nebo ho vyberte v seznamu a zadejte přesné
          hodnoty. Držte <kbd>Alt</kbd> pro volný pohyb bez mřížky. Zamčené prvky (🔒) drží
          jednotný vzhled značky a nejdou hýbat.
        </p>
      </section>

      <section className="prez-inspector-section">
        <p className="eyebrow">Prvky slidu</p>
        <div className="prez-layer-list">
          {layersTopFirst.map((layer) => (
            <button
              className={`prez-layer-row ${layer.id === selectedLayerId ? "active" : ""} ${layer.locked ? "locked" : ""}`}
              disabled={layer.locked}
              key={layer.id}
              onClick={() => onSelectLayer(layer.id)}
              type="button"
            >
              {layer.locked ? <Lock aria-hidden="true" size={14} /> : null}
              <span>{manualLayerLabel(layer)}</span>
            </button>
          ))}
        </div>
      </section>

      {selected && !selected.locked ? (
        <section className="prez-inspector-section">
          <div className="prez-selected-head">
            <p className="eyebrow">{manualLayerLabel(selected)}</p>
            <button className="button compact" onClick={() => onSelectLayer(null)} type="button">
              Zrušit výběr
            </button>
          </div>
          <div className="prez-frame-grid">
            <label>
              X
              <input
                onChange={(event) => patchFrame(selected.id, { x: toInt(event.target.value) })}
                type="number"
                value={selected.frame.x}
              />
            </label>
            <label>
              Y
              <input
                onChange={(event) => patchFrame(selected.id, { y: toInt(event.target.value) })}
                type="number"
                value={selected.frame.y}
              />
            </label>
            <label>
              Šířka
              <input
                min={48}
                onChange={(event) => patchFrame(selected.id, { w: toInt(event.target.value) })}
                type="number"
                value={selected.frame.w}
              />
            </label>
            <label>
              Výška
              <input
                min={32}
                onChange={(event) => patchFrame(selected.id, { h: toInt(event.target.value) })}
                type="number"
                value={selected.frame.h}
              />
            </label>
          </div>
          <div className="prez-align-row">
            <button
              className="button compact"
              onClick={() =>
                patchFrame(selected.id, {
                  x: Math.round(safe.x + (safe.width - selected.frame.w) / 2)
                })
              }
              type="button"
            >
              <AlignCenter aria-hidden="true" size={16} /> Na střed vodorovně
            </button>
            <button
              className="button compact"
              onClick={() =>
                patchFrame(selected.id, {
                  y: Math.round(safe.y + (safe.height - selected.frame.h) / 2)
                })
              }
              type="button"
            >
              <AlignCenter aria-hidden="true" size={16} className="prez-rotate" /> Na střed svisle
            </button>
          </div>

          {selected.type === "text" ? (
            <div className="prez-frame-grid two">
              <label>
                Velikost písma
                <input
                  max={200}
                  min={30}
                  onChange={(event) =>
                    patchTextLayer(selected.id, {
                      fontSizePx: clampInt(toInt(event.target.value), 30, 200)
                    })
                  }
                  type="number"
                  value={selected.fontSizePx}
                />
              </label>
              <label>
                Zarovnání
                <select
                  onChange={(event) =>
                    patchTextLayer(selected.id, {
                      align: event.target.value as "left" | "center" | "right"
                    })
                  }
                  value={selected.align}
                >
                  <option value="left">Vlevo</option>
                  <option value="center">Na střed</option>
                  <option value="right">Vpravo</option>
                </select>
              </label>
            </div>
          ) : null}
        </section>
      ) : (
        <section className="prez-inspector-section">
          <p className="prez-hint muted">Vyberte prvek v náhledu nebo v seznamu výše.</p>
        </section>
      )}

      <section className="prez-inspector-section prez-inspector-footer">
        <button
          className="button"
          onClick={() => {
            if (
              window.confirm(
                "Vrátit rozvržení tohoto slidu na výchozí šablonu? Ruční úpravy pozic se ztratí."
              )
            ) {
              onResetLayout();
            }
          }}
          type="button"
        >
          <RotateCcw aria-hidden="true" size={16} /> Vrátit rozvržení na výchozí
        </button>
      </section>
    </aside>
  );
}

/** Immutabilní úprava rámce jedné vrstvy se srovnáním do bezpečné zóny. */
function patchLayerFrame(
  manifest: TemplateManifestV2,
  layerId: string,
  next: Partial<LayerFrame>,
  safe: { x: number; y: number; width: number; height: number }
): TemplateManifestV2 {
  return {
    ...manifest,
    layers: manifest.layers.map((layer) => {
      if (layer.id !== layerId) return layer;
      const merged = { ...layer.frame, ...next };
      const w = Math.max(48, Math.min(merged.w, safe.width));
      const h = Math.max(32, Math.min(merged.h, safe.height));
      const x = clampInt(merged.x, safe.x, safe.x + safe.width - w);
      const y = clampInt(merged.y, safe.y, safe.y + safe.height - h);
      return { ...layer, frame: { ...merged, x, y, w, h } };
    })
  };
}

function toInt(value: string) {
  const parsed = Math.round(Number(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function clampInt(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}
