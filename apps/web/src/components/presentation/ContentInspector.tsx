"use client";

import {
  allergenCatalog,
  getManualPresentationLayout,
  isBlankManualItem,
  layoutSupportsPhotos,
  manualItemSection,
  manualPresentationLayouts,
  slideShowsPhotos,
  type AllergenCode,
  type ManualPresentationItem,
  type ManualPresentationLayoutId,
  type ManualPresentationSlide,
  type ManualPresentationSlotGroup
} from "@masico/shared";
import { Camera, Eraser, ImageOff, Images, Loader2, Move, Sparkles } from "lucide-react";
import Image from "next/image";
import { useRef, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";

/**
 * Pravý panel v režimu „Obsah": vyplňování kolonek slidu, přepínač fotek a AI
 * návrh. Rozvržení (drag-n-drop) řeší samostatný panel v režimu „Rozvržení".
 */
export function ContentInspector({
  slide,
  assetUrls,
  generatingSlide,
  generatingPhotoId,
  improvingFieldId,
  onSlideChange,
  onChangeLayout,
  onRequestPhoto,
  onGenerateSlide,
  onGeneratePhoto,
  onImproveField
}: {
  slide: ManualPresentationSlide;
  assetUrls: Record<string, string>;
  generatingSlide: boolean;
  generatingPhotoId: string | null;
  improvingFieldId: string | null;
  onSlideChange: (slide: ManualPresentationSlide) => void;
  onChangeLayout: (layoutId: ManualPresentationLayoutId) => void;
  onRequestPhoto: (itemId: string) => void;
  onGenerateSlide: () => void;
  onGeneratePhoto: (itemId: string) => void;
  onImproveField: (itemId: string, field: "name" | "description") => void;
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

      <PhotosToggle onSlideChange={onSlideChange} slide={slide} />

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
          improvingFieldId={improvingFieldId}
          items={slide.items.filter((item) => manualItemSection(item, layout) === group.sectionKey)}
          key={group.sectionKey}
          onGeneratePhoto={onGeneratePhoto}
          onImproveField={onImproveField}
          onRequestPhoto={onRequestPhoto}
          onUpdateItem={updateItem}
          showPhotos={slideShowsPhotos(slide)}
        />
      ))}
    </aside>
  );
}

/**
 * Přepínač „S fotkami / Bez fotek". Mění layout slidu (fotky se automaticky
 * přeskládají na čistý text). U rozložení bez foto slotů se nezobrazuje.
 */
function PhotosToggle({
  slide,
  onSlideChange
}: {
  slide: ManualPresentationSlide;
  onSlideChange: (slide: ManualPresentationSlide) => void;
}) {
  if (!layoutSupportsPhotos(slide.baseTemplateId)) {
    return null;
  }
  const showsPhotos = slideShowsPhotos(slide);
  return (
    <section className="manual-inspector-section">
      <p className="eyebrow">
        <Images aria-hidden="true" size={14} /> Fotky jídel
      </p>
      <div className="prez-photos-toggle" role="group" aria-label="Zobrazení fotek">
        <button
          aria-pressed={showsPhotos}
          className={`prez-photos-option ${showsPhotos ? "active" : ""}`}
          onClick={() => onSlideChange({ ...slide, photosEnabled: true })}
          type="button"
        >
          <Camera aria-hidden="true" size={16} /> S fotkami
        </button>
        <button
          aria-pressed={!showsPhotos}
          className={`prez-photos-option ${!showsPhotos ? "active" : ""}`}
          onClick={() => onSlideChange({ ...slide, photosEnabled: false })}
          type="button"
        >
          <ImageOff aria-hidden="true" size={16} /> Bez fotek
        </button>
      </div>
      <small className="prez-photos-hint">
        Bez fotek se rozvržení automaticky přeskládá na čistý text — žádné prázdné rámečky ani
        placeholdery.
      </small>
    </section>
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
  improvingFieldId,
  showPhotos,
  onUpdateItem,
  onRequestPhoto,
  onGeneratePhoto,
  onImproveField
}: {
  group: ManualPresentationSlotGroup;
  items: ManualPresentationItem[];
  assetUrls: Record<string, string>;
  generatingPhotoId: string | null;
  improvingFieldId: string | null;
  showPhotos: boolean;
  onUpdateItem: (itemId: string, patch: Partial<ManualPresentationItem>) => void;
  onRequestPhoto: (itemId: string) => void;
  onGeneratePhoto: (itemId: string) => void;
  onImproveField: (itemId: string, field: "name" | "description") => void;
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
              <div className="manual-field-with-ai">
                <input
                  aria-label={`${group.itemLabel} ${index + 1} — název`}
                  className="manual-item-name"
                  maxLength={160}
                  onChange={(event) => onUpdateItem(item.id, { name: event.target.value })}
                  placeholder="Nevyplněné se na slidu schová"
                  value={item.name}
                />
                <button
                  aria-label={`Vylepšit název pomocí AI`}
                  className="manual-ai-field"
                  disabled={improvingFieldId === `${item.id}:name` || !item.name.trim()}
                  onClick={() => onImproveField(item.id, "name")}
                  title="Vylepšit název pomocí AI"
                  type="button"
                >
                  {improvingFieldId === `${item.id}:name` ? (
                    <Loader2 aria-hidden="true" className="spin" size={16} />
                  ) : (
                    <Sparkles aria-hidden="true" size={16} />
                  )}
                </button>
              </div>
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
                      <div className="manual-field-with-ai">
                        <input
                          maxLength={280}
                          onChange={(event) =>
                            onUpdateItem(item.id, { description: event.target.value })
                          }
                          placeholder="např. rajčata, mozzarella, bazalka"
                          value={item.description}
                        />
                        <button
                          aria-label="Vylepšit popis pomocí AI"
                          className="manual-ai-field"
                          disabled={
                            improvingFieldId === `${item.id}:description` || !item.description.trim()
                          }
                          onClick={() => onImproveField(item.id, "description")}
                          title="Vylepšit popis pomocí AI"
                          type="button"
                        >
                          {improvingFieldId === `${item.id}:description` ? (
                            <Loader2 aria-hidden="true" className="spin" size={16} />
                          ) : (
                            <Sparkles aria-hidden="true" size={16} />
                          )}
                        </button>
                      </div>
                    </label>
                  ) : null}
                  {group.photo && showPhotos ? (
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
      {item.photoAssetId && assetUrls[item.photoAssetId] ? (
        <FocalPointEditor
          alt={item.name}
          focal={item.photoFocalPoint}
          onChange={(photoFocalPoint) => onUpdateItem(item.id, { photoFocalPoint })}
          src={assetUrls[item.photoAssetId]}
        />
      ) : null}
    </>
  );
}

/**
 * Ohnisko fotky tažením — obsluha chytí náhled a posune výřez, kam chce. Náhled
 * ukazuje přesně to, co uvidí slide (cover crop). Klávesnicí (šipky) i myší,
 * plus jemné slidery pod náhledem. Blbuvzdorné: hodnota se vždy ořízne na 0–1.
 */
function FocalPointEditor({
  alt,
  focal,
  onChange,
  src
}: {
  alt: string;
  focal: { x: number; y: number };
  onChange: (focal: { x: number; y: number }) => void;
  src: string;
}) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);

  const clamp = (value: number) => Math.min(1, Math.max(0, value));
  const round = (value: number) => Number(clamp(value).toFixed(3));

  function setFromPointer(clientX: number, clientY: number) {
    const box = boxRef.current;
    if (!box) return;
    const rect = box.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    onChange({
      x: round((clientX - rect.left) / rect.width),
      y: round((clientY - rect.top) / rect.height)
    });
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    draggingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    setFromPointer(event.clientX, event.clientY);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (draggingRef.current) setFromPointer(event.clientX, event.clientY);
  }

  function stopDragging(event: ReactPointerEvent<HTMLDivElement>) {
    draggingRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 0.1 : 0.02;
    const nudge: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step]
    };
    const delta = nudge[event.key];
    if (!delta) return;
    event.preventDefault();
    onChange({ x: round(focal.x + delta[0]), y: round(focal.y + delta[1]) });
  }

  return (
    <div className="manual-focal">
      <div
        aria-label="Ohnisko fotky – táhněte pro nastavení výřezu"
        aria-valuetext={`${Math.round(focal.x * 100)} % zleva, ${Math.round(focal.y * 100)} % shora`}
        className="manual-focal-box"
        onKeyDown={handleKeyDown}
        onPointerCancel={stopDragging}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDragging}
        ref={boxRef}
        role="slider"
        style={{ backgroundImage: `url("${src}")`, backgroundPosition: `${focal.x * 100}% ${focal.y * 100}%` }}
        tabIndex={0}
      >
        <span
          className="manual-focal-reticle"
          style={{ left: `${focal.x * 100}%`, top: `${focal.y * 100}%` }}
        />
        <span className="manual-focal-badge">
          <Move aria-hidden="true" size={14} />
          Táhněte pro výřez
        </span>
      </div>
      <div className="manual-two-columns">
        <label>
          Vodorovně: {Math.round(focal.x * 100)} %
          <input
            max={1}
            min={0}
            onChange={(event) => onChange({ ...focal, x: round(Number(event.target.value)) })}
            step={0.01}
            type="range"
            value={focal.x}
          />
        </label>
        <label>
          Svisle: {Math.round(focal.y * 100)} %
          <input
            max={1}
            min={0}
            onChange={(event) => onChange({ ...focal, y: round(Number(event.target.value)) })}
            step={0.01}
            type="range"
            value={focal.y}
          />
        </label>
      </div>
    </div>
  );
}

function toggleAllergen(current: AllergenCode[], code: AllergenCode) {
  return current.includes(code)
    ? current.filter((candidate) => candidate !== code)
    : [...current, code].sort((left, right) => Number(left) - Number(right));
}
