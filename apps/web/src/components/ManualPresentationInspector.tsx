"use client";

import {
  allergenCatalog,
  getManualPresentationLayout,
  isBlankManualItem,
  manualItemSection,
  manualPresentationLayouts,
  type AllergenCode,
  type ManualPresentationItem,
  type ManualPresentationLayoutId,
  type ManualPresentationSlide,
  type ManualPresentationSlotGroup
} from "@masico/shared";
import { Camera, Eraser, ImageOff, Loader2, Sparkles } from "lucide-react";
import Image from "next/image";

export function ManualPresentationInspector({
  slide,
  assetUrls,
  generatingSlide,
  generatingPhotoId,
  onSlideChange,
  onChangeLayout,
  onRequestPhoto,
  onGenerateSlide,
  onGeneratePhoto
}: {
  slide: ManualPresentationSlide;
  assetUrls: Record<string, string>;
  generatingSlide: boolean;
  generatingPhotoId: string | null;
  onSlideChange: (slide: ManualPresentationSlide) => void;
  onChangeLayout: (layoutId: ManualPresentationLayoutId) => void;
  onRequestPhoto: (itemId: string) => void;
  onGenerateSlide: () => void;
  onGeneratePhoto: (itemId: string) => void;
}) {
  const layout = getManualPresentationLayout(slide.baseTemplateId);

  function updateItem(itemId: string, patch: Partial<ManualPresentationItem>) {
    onSlideChange({
      ...slide,
      items: slide.items.map((item) => (item.id === itemId ? { ...item, ...patch } : item))
    });
  }

  return (
    <aside className="manual-inspector card">
      <button
        className="button primary manual-generate-slide"
        disabled={generatingSlide}
        onClick={onGenerateSlide}
        type="button"
      >
        {generatingSlide ? (
          <Loader2 aria-hidden="true" className="spin" size={18} />
        ) : (
          <Sparkles aria-hidden="true" size={18} />
        )}
        {generatingSlide ? "Generuji obsah slidu…" : "Vygenerovat obsah slidu (AI)"}
      </button>

      <section className="manual-inspector-section">
        <p className="eyebrow">Slide</p>
        <label>
          Typ slidu
          <select
            onChange={(event) => onChangeLayout(event.target.value as ManualPresentationLayoutId)}
            value={slide.baseTemplateId}
          >
            {manualPresentationLayouts.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.label}
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
          Na TV: {slide.durationSeconds} s
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
      </section>

      {layout.slotGroups.map((group) => (
        <SlotGroupEditor
          assetUrls={assetUrls}
          generatingPhotoId={generatingPhotoId}
          group={group}
          items={slide.items.filter((item) => manualItemSection(item, layout) === group.sectionKey)}
          key={group.sectionKey}
          onGeneratePhoto={onGeneratePhoto}
          onRequestPhoto={onRequestPhoto}
          onUpdateItem={updateItem}
        />
      ))}
    </aside>
  );
}

/**
 * Jedna skupina kolonek přesně podle slotů slidu (Polévka 1–2, Hlavní jídlo
 * 1–5…). Kolonky jsou pevné: prázdný název = slot se na slidu schová.
 */
function SlotGroupEditor({
  group,
  items,
  assetUrls,
  generatingPhotoId,
  onUpdateItem,
  onRequestPhoto,
  onGeneratePhoto
}: {
  group: ManualPresentationSlotGroup;
  items: ManualPresentationItem[];
  assetUrls: Record<string, string>;
  generatingPhotoId: string | null;
  onUpdateItem: (itemId: string, patch: Partial<ManualPresentationItem>) => void;
  onRequestPhoto: (itemId: string) => void;
  onGeneratePhoto: (itemId: string) => void;
}) {
  const filled = items.filter((item) => !isBlankManualItem(item)).length;

  return (
    <section className="manual-inspector-section">
      <div className="manual-section-head">
        <p className="eyebrow">{group.label}</p>
        <strong>
          {filled}/{group.capacity}
        </strong>
      </div>
      <div className="manual-items-list">
        {items.map((item, index) => {
          const blank = isBlankManualItem(item);
          return (
            <article className={`manual-item-card ${blank ? "blank" : ""}`} key={item.id}>
              <div className="manual-item-card-head">
                <strong>
                  {group.itemLabel} {index + 1}
                </strong>
                {!blank ? (
                  <button
                    aria-label={`Vyprázdnit kolonku ${group.itemLabel} ${index + 1}`}
                    className="icon-button"
                    onClick={() =>
                      onUpdateItem(item.id, {
                        name: "",
                        description: "",
                        priceCzk: null,
                        allergens: [],
                        photoAssetId: null,
                        photoSource: null
                      })
                    }
                    title="Vyprázdnit kolonku"
                    type="button"
                  >
                    <Eraser aria-hidden="true" size={16} />
                  </button>
                ) : null}
              </div>
              <input
                aria-label={`${group.itemLabel} ${index + 1} — název`}
                className="manual-item-name"
                maxLength={160}
                onChange={(event) => onUpdateItem(item.id, { name: event.target.value })}
                placeholder="Nevyplněné se na slidu schová"
                value={item.name}
              />
              {!blank ? (
                <>
                  <div className="manual-item-row">
                    <label className="manual-price-field">
                      Cena Kč
                      <input
                        max={1_000_000}
                        min={0}
                        onChange={(event) => {
                          const raw = event.target.value;
                          if (raw === "") {
                            onUpdateItem(item.id, { priceCzk: null });
                            return;
                          }
                          const parsed = Math.round(Number(raw));
                          if (!Number.isFinite(parsed)) {
                            return;
                          }
                          onUpdateItem(item.id, {
                            priceCzk: Math.min(1_000_000, Math.max(0, parsed))
                          });
                        }}
                        placeholder="159"
                        step={1}
                        type="number"
                        value={item.priceCzk ?? ""}
                      />
                    </label>
                    <fieldset className="manual-allergen-chips">
                      <legend>Alergeny</legend>
                      {allergenCatalog.map((allergen) => {
                        const active = item.allergens.includes(allergen.code);
                        return (
                          <button
                            aria-pressed={active}
                            className={active ? "active" : ""}
                            key={allergen.code}
                            onClick={() =>
                              onUpdateItem(item.id, {
                                allergens: toggleAllergen(item.allergens, allergen.code)
                              })
                            }
                            title={allergen.fullName}
                            type="button"
                          >
                            {allergen.code}
                          </button>
                        );
                      })}
                    </fieldset>
                  </div>
                  {group.description ? (
                    <label>
                      Popis na slidu
                      <input
                        maxLength={280}
                        onChange={(event) =>
                          onUpdateItem(item.id, { description: event.target.value })
                        }
                        placeholder="např. rajčata, mozzarella, bazalka"
                        value={item.description}
                      />
                    </label>
                  ) : null}
                  {group.photo ? (
                    <PhotoField
                      assetUrls={assetUrls}
                      generating={generatingPhotoId === item.id}
                      item={item}
                      onGeneratePhoto={onGeneratePhoto}
                      onRequestPhoto={onRequestPhoto}
                      onUpdateItem={onUpdateItem}
                    />
                  ) : null}
                </>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function PhotoField({
  item,
  assetUrls,
  generating,
  onUpdateItem,
  onRequestPhoto,
  onGeneratePhoto
}: {
  item: ManualPresentationItem;
  assetUrls: Record<string, string>;
  generating: boolean;
  onUpdateItem: (itemId: string, patch: Partial<ManualPresentationItem>) => void;
  onRequestPhoto: (itemId: string) => void;
  onGeneratePhoto: (itemId: string) => void;
}) {
  return (
    <>
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
            className="button compact primary"
            disabled={generating}
            onClick={() => onGeneratePhoto(item.id)}
            type="button"
          >
            {generating ? (
              <Loader2 aria-hidden="true" className="spin" size={17} />
            ) : (
              <Sparkles aria-hidden="true" size={17} />
            )}
            {generating ? "Generuji…" : "AI fotka"}
          </button>
          <button className="button compact" onClick={() => onRequestPhoto(item.id)} type="button">
            <Camera aria-hidden="true" size={17} />
            {item.photoAssetId ? "Vyměnit" : "Vybrat"}
          </button>
          {item.photoAssetId ? (
            <button
              className="button compact"
              onClick={() => onUpdateItem(item.id, { photoAssetId: null, photoSource: null })}
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
                onUpdateItem(item.id, {
                  photoFocalPoint: { ...item.photoFocalPoint, x: Number(event.target.value) }
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
                onUpdateItem(item.id, {
                  photoFocalPoint: { ...item.photoFocalPoint, y: Number(event.target.value) }
                })
              }
              step={0.01}
              type="range"
              value={item.photoFocalPoint.y}
            />
          </label>
        </div>
      ) : null}
    </>
  );
}

function toggleAllergen(current: AllergenCode[], code: AllergenCode) {
  return current.includes(code)
    ? current.filter((candidate) => candidate !== code)
    : [...current, code].sort((left, right) => Number(left) - Number(right));
}
