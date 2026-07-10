"use client";

import {
  allergenCatalog,
  createManualPresentationManifest,
  getManualPresentationLayout,
  manualPresentationLayouts,
  type AllergenCode,
  type ManualPresentationDocument,
  type ManualPresentationItem,
  type ManualPresentationLayoutId,
  type ManualPresentationSlide,
  type TemplateLayerV2
} from "@masico/shared";
import { Camera, ImageOff, Plus, Trash2 } from "lucide-react";
import Image from "next/image";
import type { PresentationCanteen, PresentationLocation } from "@/lib/manual-presentations";
import { manualLayerLabel } from "./ManualPresentationCanvas";

export function ManualPresentationInspector({
  document,
  slide,
  mode,
  selectedLayerId,
  assetUrls,
  locations,
  canteens,
  contextLocked,
  onDocumentChange,
  onSlideChange,
  onRequestPhoto
}: {
  document: ManualPresentationDocument;
  slide: ManualPresentationSlide;
  mode: "content" | "layout";
  selectedLayerId: string | null;
  assetUrls: Record<string, string>;
  locations: PresentationLocation[];
  canteens: PresentationCanteen[];
  contextLocked: boolean;
  onDocumentChange: (document: ManualPresentationDocument) => void;
  onSlideChange: (slide: ManualPresentationSlide) => void;
  onRequestPhoto: (itemId: string) => void;
}) {
  const selectedLayer = slide.manifest.layers.find((layer) => layer.id === selectedLayerId) ?? null;
  const layout = getManualPresentationLayout(slide.baseTemplateId);
  const availableCanteens = canteens.filter((canteen) => canteen.locationId === document.locationId);

  function updateItem(itemId: string, patch: Partial<ManualPresentationItem>) {
    onSlideChange({
      ...slide,
      items: slide.items.map((item) => (item.id === itemId ? { ...item, ...patch } : item))
    });
  }

  function updateLayer(patcher: (layer: TemplateLayerV2) => TemplateLayerV2) {
    if (!selectedLayer) return;
    onSlideChange({
      ...slide,
      manifest: {
        ...slide.manifest,
        layers: slide.manifest.layers.map((layer) =>
          layer.id === selectedLayer.id ? patcher(layer) : layer
        )
      }
    });
  }

  function changeLayout(baseTemplateId: ManualPresentationLayoutId) {
    if (baseTemplateId === slide.baseTemplateId) {
      return;
    }
    const nextLayout = getManualPresentationLayout(baseTemplateId);
    const baseline = createManualPresentationManifest(slide.baseTemplateId, slide.id);
    const customized =
      slide.items.length > nextLayout.capacity ||
      JSON.stringify(slide.manifest) !== JSON.stringify(baseline);
    if (
      customized &&
      !window.confirm(
        "Změna rozložení vrátí prvky na výchozí pozice a jídla nad kapacitu nového rozložení odebere. Pokračovat?"
      )
    ) {
      return;
    }
    onSlideChange({
      ...slide,
      baseTemplateId,
      manifest: createManualPresentationManifest(baseTemplateId, slide.id),
      items: slide.items.slice(0, nextLayout.capacity)
    });
  }

  return (
    <aside className="manual-inspector card">
      <section className="manual-inspector-section">
        <p className="eyebrow">Celá prezentace</p>
        <label>
          Název prezentace
          <input
            maxLength={140}
            onChange={(event) => onDocumentChange({ ...document, name: event.target.value })}
            value={document.name}
          />
        </label>
        <label>
          Datum na slidech
          <input
            onChange={(event) =>
              onDocumentChange({ ...document, presentationDate: event.target.value })
            }
            type="date"
            value={document.presentationDate}
          />
        </label>
        <label>
          Provozovna
          <select
            disabled={contextLocked}
            onChange={(event) => {
              const locationId = event.target.value;
              const canteenId = canteens.find((canteen) => canteen.locationId === locationId)?.id;
              if (!canteenId) return;
              onDocumentChange({ ...document, locationId, canteenId });
            }}
            value={document.locationId}
          >
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Jídelna
          <select
            disabled={contextLocked}
            onChange={(event) =>
              onDocumentChange({ ...document, canteenId: event.target.value })
            }
            value={document.canteenId}
          >
            {availableCanteens.map((canteen) => (
              <option key={canteen.id} value={canteen.id}>
                {canteen.name}
              </option>
            ))}
          </select>
        </label>
        {contextLocked ? (
          <small>U uložené prezentace zůstává provozovna kvůli historii verzí stejná.</small>
        ) : null}
      </section>

      <section className="manual-inspector-section">
        <p className="eyebrow">Aktivní slide</p>
        <label>
          Typ rozložení
          <select
            onChange={(event) => changeLayout(event.target.value as ManualPresentationLayoutId)}
            value={slide.baseTemplateId}
          >
            {manualPresentationLayouts.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.label} · max. {candidate.capacity}
              </option>
            ))}
          </select>
          <small>{layout.description}</small>
        </label>
        <label>
          Název slidu
          <input
            maxLength={140}
            onChange={(event) => onSlideChange({ ...slide, title: event.target.value })}
            value={slide.title}
          />
        </label>
        <label>
          Délka na TV: {slide.durationSeconds} s
          <input
            max={60}
            min={3}
            onChange={(event) =>
              onSlideChange({ ...slide, durationSeconds: Number(event.target.value) })
            }
            type="range"
            value={slide.durationSeconds}
          />
        </label>
        <label>
          Barva pozadí
          <span className="manual-color-row">
            <input
              aria-label="Barva pozadí slidu"
              onChange={(event) =>
                onSlideChange({
                  ...slide,
                  manifest: { ...slide.manifest, backgroundColor: event.target.value }
                })
              }
              type="color"
              value={slide.manifest.backgroundColor}
            />
            <code>{slide.manifest.backgroundColor}</code>
          </span>
        </label>
      </section>

      {mode === "layout" ? (
        <LayerInspector layer={selectedLayer} onChange={updateLayer} />
      ) : (
        <>
          <StaticTextFields slide={slide} onSlideChange={onSlideChange} />
          <section className="manual-inspector-section">
            <div className="manual-section-head">
              <div>
                <p className="eyebrow">Jídla a položky</p>
                <strong>
                  {slide.items.length}/{layout.capacity}
                </strong>
              </div>
              <button
                className="button compact"
                disabled={slide.items.length >= layout.capacity}
                onClick={() =>
                  onSlideChange({ ...slide, items: [...slide.items, createItem()] })
                }
                type="button"
              >
                <Plus aria-hidden="true" size={17} />
                Přidat
              </button>
            </div>
            <div className="manual-items-list">
              {slide.items.map((item, index) => (
                <article className="manual-item-card" key={item.id}>
                  <div className="manual-item-card-head">
                    <strong>Položka {index + 1}</strong>
                    <button
                      aria-label={`Odebrat položku ${index + 1}`}
                      className="icon-button"
                      disabled={slide.items.length === 1}
                      onClick={() =>
                        onSlideChange({
                          ...slide,
                          items: slide.items.filter((candidate) => candidate.id !== item.id)
                        })
                      }
                      type="button"
                    >
                      <Trash2 aria-hidden="true" size={17} />
                    </button>
                  </div>
                  <label>
                    Název jídla
                    <input
                      maxLength={160}
                      onChange={(event) => updateItem(item.id, { name: event.target.value })}
                      value={item.name}
                    />
                  </label>
                  <div className="manual-two-columns">
                    <label>
                      Cena v Kč
                      <input
                        max={1_000_000}
                        min={0}
                        onChange={(event) => {
                          const raw = event.target.value;
                          if (raw === "") {
                            updateItem(item.id, { priceCzk: null });
                            return;
                          }
                          const parsed = Math.round(Number(raw));
                          if (!Number.isFinite(parsed)) {
                            return;
                          }
                          updateItem(item.id, {
                            priceCzk: Math.min(1_000_000, Math.max(0, parsed))
                          });
                        }}
                        placeholder="např. 159"
                        step={1}
                        type="number"
                        value={item.priceCzk ?? ""}
                      />
                    </label>
                    <label>
                      Popis
                      <input
                        maxLength={280}
                        onChange={(event) =>
                          updateItem(item.id, { description: event.target.value })
                        }
                        placeholder="volitelný"
                        value={item.description}
                      />
                    </label>
                  </div>

                  <fieldset className="manual-allergens">
                    <legend>Alergeny</legend>
                    {allergenCatalog.map((allergen) => (
                      <label key={allergen.code} title={allergen.fullName}>
                        <input
                          checked={item.allergens.includes(allergen.code)}
                          onChange={() =>
                            updateItem(item.id, {
                              allergens: toggleAllergen(item.allergens, allergen.code)
                            })
                          }
                          type="checkbox"
                        />
                        <span>{allergen.code}</span>
                      </label>
                    ))}
                  </fieldset>

                  <div className="manual-photo-field">
                    {item.photoAssetId && assetUrls[item.photoAssetId] ? (
                      <Image
                        alt={item.name}
                        height={68}
                        src={assetUrls[item.photoAssetId]}
                        unoptimized
                        width={92}
                      />
                    ) : (
                      <span className="manual-photo-empty">
                        <Camera aria-hidden="true" size={22} />
                        Fotka je volitelná
                      </span>
                    )}
                    <div>
                      <button
                        className="button compact"
                        onClick={() => onRequestPhoto(item.id)}
                        type="button"
                      >
                        <Camera aria-hidden="true" size={17} />
                        {item.photoAssetId ? "Vyměnit" : "Přidat fotku"}
                      </button>
                      {item.photoAssetId ? (
                        <button
                          className="button compact"
                          onClick={() =>
                            updateItem(item.id, { photoAssetId: null, photoSource: null })
                          }
                          type="button"
                        >
                          <ImageOff aria-hidden="true" size={17} />
                          Bez fotky
                        </button>
                      ) : null}
                    </div>
                  </div>
                  {item.photoAssetId ? (
                    <div className="manual-two-columns">
                      <label>
                        Ohnisko vodorovně: {Math.round(item.photoFocalPoint.x * 100)} %
                        <input
                          max={1}
                          min={0}
                          onChange={(event) =>
                            updateItem(item.id, {
                              photoFocalPoint: {
                                ...item.photoFocalPoint,
                                x: Number(event.target.value)
                              }
                            })
                          }
                          step={0.01}
                          type="range"
                          value={item.photoFocalPoint.x}
                        />
                      </label>
                      <label>
                        Ohnisko svisle: {Math.round(item.photoFocalPoint.y * 100)} %
                        <input
                          max={1}
                          min={0}
                          onChange={(event) =>
                            updateItem(item.id, {
                              photoFocalPoint: {
                                ...item.photoFocalPoint,
                                y: Number(event.target.value)
                              }
                            })
                          }
                          step={0.01}
                          type="range"
                          value={item.photoFocalPoint.y}
                        />
                      </label>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          </section>
        </>
      )}
    </aside>
  );
}

function StaticTextFields({
  slide,
  onSlideChange
}: {
  slide: ManualPresentationSlide;
  onSlideChange: (slide: ManualPresentationSlide) => void;
}) {
  const editable = slide.manifest.layers.filter(
    (layer) => layer.type === "text" && (!layer.binding || layer.binding.source === "static") && !layer.locked
  );
  if (editable.length === 0) return null;

  return (
    <section className="manual-inspector-section">
      <p className="eyebrow">Texty slidu</p>
      {editable.map((layer) =>
        layer.type === "text" ? (
          <label key={layer.id}>
            {manualLayerLabel(layer)}
            <input
              maxLength={180}
              onChange={(event) =>
                onSlideChange({
                  ...slide,
                  manifest: {
                    ...slide.manifest,
                    layers: slide.manifest.layers.map((candidate) =>
                      candidate.id === layer.id && candidate.type === "text"
                        ? { ...candidate, text: event.target.value }
                        : candidate
                    )
                  }
                })
              }
              value={layer.text ?? ""}
            />
          </label>
        ) : null
      )}
    </section>
  );
}

function LayerInspector({
  layer,
  onChange
}: {
  layer: TemplateLayerV2 | null;
  onChange: (patcher: (layer: TemplateLayerV2) => TemplateLayerV2) => void;
}) {
  if (!layer) {
    return (
      <section className="manual-inspector-section manual-inspector-empty">
        <p className="eyebrow">Rozložení prvků</p>
        <p>Klepněte na prvek v náhledu. Pak ho můžete táhnout nebo přesně nastavit.</p>
      </section>
    );
  }

  return (
    <section className="manual-inspector-section">
      <p className="eyebrow">Vybraný prvek</p>
      <h2>{manualLayerLabel(layer)}</h2>
      {layer.locked ? <p className="muted">Brandový prvek je zamčený.</p> : null}
      <div className="manual-frame-grid">
        {(["x", "y", "w", "h"] as const).map((field) => (
          <label key={field}>
            {field.toUpperCase()}
            <input
              disabled={layer.locked}
              min={0}
              onChange={(event) =>
                onChange((current) => {
                  const value = Math.round(Number(event.target.value));
                  return {
                    ...current,
                    frame: {
                      ...current.frame,
                      [field]: field === "w" || field === "h" ? Math.max(1, value) : value
                    }
                  };
                })
              }
              type="number"
              value={layer.frame[field]}
            />
          </label>
        ))}
      </div>
      {layer.type === "text" ? (
        <>
          {(!layer.binding || layer.binding.source === "static") && !layer.locked ? (
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
          ) : null}
          <label>
            Velikost písma: {layer.fontSizePx} px
            <input
              disabled={layer.locked}
              max={200}
              min={30}
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
          </label>
          <div className="manual-two-columns">
            <label>
              Barva
              <input
                disabled={layer.locked}
                onChange={(event) =>
                  onChange((current) =>
                    current.type === "text" ? { ...current, color: event.target.value } : current
                  )
                }
                type="color"
                value={layer.color}
              />
            </label>
            <label>
              Zarovnání
              <select
                disabled={layer.locked}
                onChange={(event) =>
                  onChange((current) =>
                    current.type === "text"
                      ? {
                          ...current,
                          align: event.target.value as "left" | "center" | "right"
                        }
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
          </div>
        </>
      ) : null}
      {layer.type === "image" ? (
        <div className="manual-two-columns">
          <label>
            Ořez
            <select
              disabled={layer.locked}
              onChange={(event) =>
                onChange((current) =>
                  current.type === "image"
                    ? { ...current, fit: event.target.value as "cover" | "contain" }
                    : current
                )
              }
              value={layer.fit}
            >
              <option value="cover">Vyplnit plochu</option>
              <option value="contain">Ukázat celou fotku</option>
            </select>
          </label>
          <label>
            Bez fotografie
            <select
              disabled={layer.locked}
              onChange={(event) =>
                onChange((current) =>
                  current.type === "image"
                    ? { ...current, placeholder: event.target.value as "dish" | "none" }
                    : current
                )
              }
              value={layer.placeholder}
            >
              <option value="dish">Zobrazit zástupný motiv</option>
              <option value="none">Skrýt prvek</option>
            </select>
          </label>
        </div>
      ) : null}
    </section>
  );
}

function createItem(): ManualPresentationItem {
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

function toggleAllergen(current: AllergenCode[], code: AllergenCode) {
  return current.includes(code)
    ? current.filter((candidate) => candidate !== code)
    : [...current, code].sort((left, right) => Number(left) - Number(right));
}
