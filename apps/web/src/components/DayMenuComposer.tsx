"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  allergenCatalog,
  buildDailyDeckManifest,
  dailyLoopSlides,
  dailyLoopTemplates,
  framesToSeconds,
  SLIDE_MAX_DURATION_SECONDS,
  SLIDE_MIN_DURATION_SECONDS,
  type AllergenCode,
  type DailyLoopSlideKey,
  type MenuExtractionItem,
  type MenuExtractionResult
} from "@masico/shared";
import { TvComposition } from "@masico/render";
import {
  Camera,
  Check,
  ImageOff,
  Loader2,
  Minus,
  Plus,
  Rocket,
  Save,
  Settings,
  TriangleAlert,
  X
} from "lucide-react";
import type { ProductionDashboardSnapshot } from "@/lib/studio-dashboard";
import { ScaledTvFrame } from "./ScaledTvFrame";
import { StatusBadge } from "./StatusBadge";

type FormSectionKey = "soups" | "mains" | "pizza" | "buffet" | "special";

type DraftItem = {
  key: string;
  name: string;
  price: string;
  description: string;
  allergens: AllergenCode[];
  noAllergens: boolean;
  allergensFromHistory: boolean;
  allergensConfirmed: boolean;
  photoAssetId: string | null;
  photoUrl: string | null;
  photoFocalPoint: { x: number; y: number } | null;
};

type LibraryPhoto = {
  id: string;
  assetId: string;
  dishName: string;
  focalPoint: { x: number; y: number };
  signedUrl: string | null;
};

type Suggestion = {
  name: string;
  priceCzk: number | null;
  allergens: string[];
  photoAssetId: string | null;
  photoFocalPoint: { x: number; y: number } | null;
  timesUsed: number;
};

const sectionMeta: Array<{
  key: FormSectionKey;
  title: string;
  hint: string;
  slots: number;
  minFilled: number;
  photos: boolean;
  withDescription: boolean;
}> = [
  {
    key: "soups",
    title: "Polévky",
    hint: "Vždy dvě polévky. Když dnes vaříte jen jednu, druhou nechte prázdnou.",
    slots: 2,
    minFilled: 1,
    photos: true,
    withDescription: false
  },
  {
    key: "mains",
    title: "Hlavní jídla",
    hint: "Až pět jídel dne. Prázdné řádky se na TV nezobrazí.",
    slots: 5,
    minFilled: 1,
    photos: true,
    withDescription: false
  },
  {
    key: "pizza",
    title: "Pizza dne",
    hint: "Dnešní pizza s fotkou. Když pizza není, nechte prázdné.",
    slots: 1,
    minFilled: 0,
    photos: true,
    withDescription: true
  },
  {
    key: "buffet",
    title: "Teplý bufet",
    hint: "Až sedm položek bez fotek, jen názvy a ceny.",
    slots: 7,
    minFilled: 0,
    photos: false,
    withDescription: false
  },
  {
    key: "special",
    title: "Dnes navíc",
    hint: "Dezerty a speciality. Když nic není, nechte prázdné.",
    slots: 3,
    minFilled: 0,
    photos: true,
    withDescription: false
  }
];

const sectionTitles: Record<FormSectionKey, string> = {
  soups: "Polévky",
  mains: "Hlavní jídla",
  pizza: "Pizza dne",
  buffet: "Teplý bufet",
  special: "Dnes navíc"
};

const slideLabels: Record<DailyLoopSlideKey, string> = {
  intro: "Úvodní slide",
  soups: "Polévky",
  mains: "Hlavní jídla",
  pizza: "Pizza dne",
  buffet: "Teplý bufet",
  special: "Dnes navíc"
};

function emptyItem(key: string): DraftItem {
  return {
    key,
    name: "",
    price: "",
    description: "",
    allergens: [],
    noAllergens: false,
    allergensFromHistory: false,
    allergensConfirmed: true,
    photoAssetId: null,
    photoUrl: null,
    photoFocalPoint: null
  };
}

function emptySections(): Record<FormSectionKey, DraftItem[]> {
  const result = {} as Record<FormSectionKey, DraftItem[]>;
  for (const section of sectionMeta) {
    result[section.key] = Array.from({ length: section.slots }, (_, index) =>
      emptyItem(`${section.key}-${index}`)
    );
  }
  return result;
}

function defaultDurations(): Record<DailyLoopSlideKey, number> {
  const durations = {} as Record<DailyLoopSlideKey, number>;
  for (const slide of dailyLoopSlides) {
    const template = dailyLoopTemplates.find((candidate) => candidate.id === slide.templateId);
    durations[slide.key] = template ? framesToSeconds(template.durationFrames) : 8;
  }
  return durations;
}

function sectionsFromMenu(menu: MenuExtractionResult): Record<FormSectionKey, DraftItem[]> {
  const sections = emptySections();
  const keyAliases: Record<string, FormSectionKey> = {
    soups: "soups",
    mains: "mains",
    pizza: "pizza",
    buffet: "buffet",
    special: "special",
    specials: "special",
    desserts: "special"
  };

  for (const section of menu.sections) {
    const target = keyAliases[section.id];
    if (!target) {
      continue;
    }

    section.items.forEach((item, index) => {
      if (index >= sections[target].length) {
        return;
      }

      sections[target][index] = {
        key: `${target}-${index}`,
        name: item.name,
        price: item.prices[0]?.amount != null ? String(item.prices[0].amount) : "",
        description: item.description ?? "",
        allergens: item.allergens,
        noAllergens: !item.allergensUnknown && item.allergens.length === 0,
        allergensFromHistory: false,
        allergensConfirmed: true,
        photoAssetId: item.photoAssetId ?? null,
        photoUrl: null,
        photoFocalPoint: item.photoFocalPoint ?? null
      };
    });
  }

  return sections;
}

type DayMenuComposerProps = {
  date: string;
  canLaunch: boolean;
  roleLabel: string;
  snapshot: ProductionDashboardSnapshot;
  initialMenu: MenuExtractionResult | null;
  initialStatus: string | null;
};

export function DayMenuComposer({
  date,
  canLaunch,
  roleLabel,
  snapshot,
  initialMenu,
  initialStatus
}: DayMenuComposerProps) {
  const [sections, setSections] = useState<Record<FormSectionKey, DraftItem[]>>(() =>
    initialMenu ? sectionsFromMenu(initialMenu) : emptySections()
  );
  const [durations, setDurations] = useState<Record<DailyLoopSlideKey, number>>(defaultDurations);
  const [locationId, setLocationId] = useState(snapshot.locations[0]?.id ?? "");
  const canteens = useMemo(
    () => snapshot.canteens.filter((canteen) => canteen.locationId === locationId),
    [locationId, snapshot.canteens]
  );
  const [canteenId, setCanteenId] = useState(
    () => canteens[0]?.id ?? snapshot.canteens[0]?.id ?? ""
  );
  const screens = snapshot.screens.filter(
    (screen) => screen.locationId === locationId && screen.canteenId === canteenId
  );
  const [screenId, setScreenId] = useState(() => screens[0]?.id ?? "");
  const [showTarget, setShowTarget] = useState(false);
  const [activeSlideKey, setActiveSlideKey] = useState<DailyLoopSlideKey>("soups");
  const [photoPicker, setPhotoPicker] = useState<{ sectionKey: FormSectionKey; index: number } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState<"publish" | "save" | null>(null);
  const [result, setResult] = useState<{ published: boolean; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copyNote, setCopyNote] = useState<string | null>(null);
  const [draftRestoredAt, setDraftRestoredAt] = useState<string | null>(null);
  const draftKey = `masico-day-draft:${canteenId}:${date}`;
  const draftRestoreDone = useRef(false);

  // Obnova rozepsaného menu z tohoto počítače — nic se neztrácí.
  useEffect(() => {
    if (draftRestoreDone.current || initialMenu) {
      return;
    }
    draftRestoreDone.current = true;

    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) {
        return;
      }
      const draft = JSON.parse(raw) as {
        sections?: Record<FormSectionKey, DraftItem[]>;
        durations?: Record<DailyLoopSlideKey, number>;
        savedAt?: string;
      };
      if (draft.sections) {
        setSections(draft.sections);
      }
      if (draft.durations) {
        setDurations(draft.durations);
      }
      if (draft.savedAt) {
        setDraftRestoredAt(draft.savedAt);
      }
    } catch {
      localStorage.removeItem(draftKey);
    }
  }, [draftKey, initialMenu]);

  // Průběžný autosave (debounce 500 ms).
  useEffect(() => {
    const timeout = setTimeout(() => {
      try {
        localStorage.setItem(
          draftKey,
          JSON.stringify({ sections, durations, savedAt: new Date().toISOString() })
        );
      } catch {
        // plné úložiště nesmí rozbít formulář
      }
    }, 500);

    return () => clearTimeout(timeout);
  }, [draftKey, durations, sections]);

  const formEmpty = useMemo(
    () =>
      sectionMeta.every((meta) =>
        sections[meta.key].every((item) => item.name.trim().length === 0)
      ),
    [sections]
  );

  async function copyFromDate(offsetDays: number, label: string) {
    const source = new Date(`${date}T12:00:00`);
    source.setDate(source.getDate() + offsetDays);
    const sourceIso = source.toISOString().slice(0, 10);
    setCopyNote(null);

    try {
      const params = new URLSearchParams({ canteenId, date: sourceIso });
      const response = await fetch(`/api/menus/day?${params.toString()}`);
      const body = (await response.json().catch(() => null)) as
        | { menu?: MenuExtractionResult | null }
        | null;

      if (!body?.menu) {
        setCopyNote(`Pro ${label} není uložené žádné menu.`);
        return;
      }

      const copied = sectionsFromMenu(body.menu);
      for (const meta of sectionMeta) {
        for (const item of copied[meta.key]) {
          if (item.name.trim() && item.allergens.length > 0) {
            item.allergensFromHistory = true;
            item.allergensConfirmed = false;
          }
        }
      }

      setSections(copied);
      setCopyNote(
        `Zkopírováno z ${label}. Zkontrolujte ceny, pizzu dne a potvrďte alergeny u každého jídla.`
      );
    } catch {
      setCopyNote("Kopírování se nepovedlo. Zkuste to znovu.");
    }
  }

  const updateItem = useCallback(
    (sectionKey: FormSectionKey, index: number, patch: Partial<DraftItem>) => {
      setSections((previous) => {
        const items = previous[sectionKey].map((item, itemIndex) =>
          itemIndex === index ? { ...item, ...patch } : item
        );
        return { ...previous, [sectionKey]: items };
      });
      setResult(null);
    },
    []
  );

  const menu = useMemo<MenuExtractionResult>(() => {
    const menuSections: MenuExtractionResult["sections"] = [];

    for (const meta of sectionMeta) {
      const filled = sections[meta.key].filter((item) => item.name.trim().length > 0);
      if (filled.length === 0) {
        continue;
      }

      menuSections.push({
        id: meta.key,
        name: sectionTitles[meta.key],
        items: filled.map((item, index) => toMenuItem(meta.key, item, index))
      });
    }

    return {
      restaurant: { name: "MASI-CO food", locale: "cs-CZ", currency: "CZK" },
      date,
      locationName: snapshot.locations.find((location) => location.id === locationId)?.name ?? null,
      sections: menuSections,
      warnings: []
    };
  }, [date, locationId, sections, snapshot.locations]);

  const photoUrls = useMemo(() => {
    const urls: Record<string, string> = {};
    for (const meta of sectionMeta) {
      for (const item of sections[meta.key]) {
        if (item.photoAssetId && item.photoUrl) {
          urls[item.photoAssetId] = item.photoUrl;
        }
      }
    }
    return urls;
  }, [sections]);

  const previewDeck = useMemo(() => {
    const manifest = buildDailyDeckManifest(menu, {
      slideDurationsSeconds: durations
    });
    return { ...manifest, assetUrls: photoUrls };
  }, [durations, menu, photoUrls]);

  const includedSlides = previewDeck.slides.map((slide) => slide.id.replace("slide-", "") as DailyLoopSlideKey);
  const activeSlideId = includedSlides.includes(activeSlideKey)
    ? `slide-${activeSlideKey}`
    : previewDeck.slides[0]?.id;

  const validation = useMemo(() => {
    const problems: string[] = [];
    let unconfirmedAllergens = 0;

    for (const meta of sectionMeta) {
      const filled = sections[meta.key].filter((item) => item.name.trim().length > 0);

      for (const item of filled) {
        if (item.price.trim() === "" || Number.isNaN(Number(item.price))) {
          problems.push(`${item.name}: chybí cena.`);
        }
        if (!item.noAllergens && item.allergens.length === 0) {
          problems.push(`${item.name}: vyberte alergeny nebo „Bez alergenů".`);
        }
        if (item.allergensFromHistory && !item.allergensConfirmed) {
          unconfirmedAllergens += 1;
        }
      }
    }

    const hasFood =
      sections.soups.some((item) => item.name.trim()) ||
      sections.mains.some((item) => item.name.trim());
    if (!hasFood) {
      problems.push("Vyplňte alespoň jednu polévku nebo hlavní jídlo.");
    }

    if (unconfirmedAllergens > 0) {
      problems.push(
        unconfirmedAllergens === 1
          ? "1 jídlo má alergeny převzaté z minula — potvrďte je."
          : `${unconfirmedAllergens} jídla mají alergeny převzaté z minula — potvrďte je.`
      );
    }

    return { problems, ready: problems.length === 0 };
  }, [sections]);

  async function submit(publish: boolean) {
    setSubmitting(publish ? "publish" : "save");
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/today/launch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          locationId,
          canteenId,
          menuDate: date,
          menu,
          slideDurationsSeconds: durations,
          screenId: publish ? screenId : undefined,
          publish
        })
      });

      const body = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string; note?: string }
        | null;

      if (!response.ok || !body?.ok) {
        throw new Error(body?.error ?? `Uložení selhalo (${response.status}).`);
      }

      setResult({
        published: publish,
        message: publish
          ? "Menu je na TV. Obrazovka si ho načte do minuty."
          : "Menu je uložené a připravené. Na TV zatím neběží."
      });
      localStorage.removeItem(draftKey);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Uložení selhalo.");
    } finally {
      setSubmitting(null);
      setConfirmOpen(false);
    }
  }

  const selectedScreen = screens.find((screen) => screen.id === screenId);
  const dayLabel = formatDayLabel(date);

  return (
    <div className="day-composer">
      <header className="day-composer-head">
        <div>
          <p className="eyebrow">Menu na den</p>
          <h1>{dayLabel}</h1>
          <p className="day-composer-subtitle">
            {snapshot.locations.find((location) => location.id === locationId)?.name ?? "Provozovna"} ·{" "}
            {canteens.find((canteen) => canteen.id === canteenId)?.name ?? "jídelna"}
            {initialStatus ? ` · uložený stav: ${statusLabel(initialStatus)}` : ""}
          </p>
        </div>
        <button
          className="button"
          onClick={() => setShowTarget((value) => !value)}
          type="button"
          aria-expanded={showTarget}
        >
          <Settings size={20} aria-hidden="true" />
          Změnit jídelnu nebo TV
        </button>
      </header>

      {showTarget ? (
        <div className="day-target card pad">
          <label>
            Provozovna
            <select
              onChange={(event) => {
                const nextLocation = event.target.value;
                setLocationId(nextLocation);
                const nextCanteen = snapshot.canteens.find(
                  (canteen) => canteen.locationId === nextLocation
                );
                setCanteenId(nextCanteen?.id ?? "");
                const nextScreen = snapshot.screens.find(
                  (screen) => screen.locationId === nextLocation && screen.canteenId === nextCanteen?.id
                );
                setScreenId(nextScreen?.id ?? "");
              }}
              value={locationId}
            >
              {snapshot.locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Jídelna
            <select
              onChange={(event) => {
                setCanteenId(event.target.value);
                const nextScreen = snapshot.screens.find(
                  (screen) => screen.locationId === locationId && screen.canteenId === event.target.value
                );
                setScreenId(nextScreen?.id ?? "");
              }}
              value={canteenId}
            >
              {canteens.map((canteen) => (
                <option key={canteen.id} value={canteen.id}>
                  {canteen.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            TV obrazovka
            <select onChange={(event) => setScreenId(event.target.value)} value={screenId}>
              {screens.length === 0 ? <option value="">Není spárovaná TV</option> : null}
              {screens.map((screen) => (
                <option key={screen.id} value={screen.id}>
                  {screen.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      {formEmpty ? (
        <div className="day-copy-row" role="group" aria-label="Rychlé předvyplnění">
          <span>Nechcete začínat od nuly?</span>
          <button className="button" onClick={() => void copyFromDate(-1, "včerejška")} type="button">
            Zkopírovat ze včerejška
          </button>
          <button
            className="button"
            onClick={() => void copyFromDate(-7, `minulého ${weekdayLabel(date)}`)}
            type="button"
          >
            Zkopírovat z minulého {weekdayLabel(date)}
          </button>
        </div>
      ) : null}

      {copyNote ? (
        <div className="day-copy-note" role="status">
          {copyNote}
        </div>
      ) : null}

      {draftRestoredAt ? (
        <div className="day-copy-note" role="status">
          Obnovili jsme menu, které jste psali {formatSavedAt(draftRestoredAt)}. Nic se neztratilo.
        </div>
      ) : null}

      <div className="day-composer-grid">
        <div className="day-form-column">
          {sectionMeta.map((meta) => (
            <section className="day-section card pad" id={`sekce-${meta.key}`} key={meta.key}>
              <header className="day-section-head">
                <h2>{meta.title}</h2>
                <p>{meta.hint}</p>
              </header>
              <div className="day-items">
                {sections[meta.key].map((item, index) => (
                  <DishRow
                    key={item.key}
                    item={item}
                    index={index}
                    sectionKey={meta.key}
                    canteenId={canteenId}
                    withPhoto={meta.photos}
                    withDescription={meta.withDescription}
                    onChange={(patch) => updateItem(meta.key, index, patch)}
                    onOpenPhoto={() => setPhotoPicker({ sectionKey: meta.key, index })}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>

        <aside className="day-preview-column">
          <div className="day-preview card">
            <div className="day-preview-head">
              <p className="eyebrow">Náhled — přesně takhle to uvidí hosté</p>
              <div className="day-slide-tabs" role="tablist" aria-label="Slidy">
                {previewDeck.slides.map((slide) => {
                  const key = slide.id.replace("slide-", "") as DailyLoopSlideKey;
                  return (
                    <button
                      key={slide.id}
                      className={`day-slide-tab ${slide.id === activeSlideId ? "active" : ""}`}
                      onClick={() => setActiveSlideKey(key)}
                      role="tab"
                      aria-selected={slide.id === activeSlideId}
                      type="button"
                    >
                      {slideLabels[key]}
                    </button>
                  );
                })}
              </div>
            </div>
            <ScaledTvFrame>
              <TvComposition deck={previewDeck} menu={menu} activeSlideId={activeSlideId} />
            </ScaledTvFrame>
            <div className="day-durations">
              <p className="day-durations-title">Jak dlouho se slide zobrazí</p>
              {previewDeck.slides.map((slide) => {
                const key = slide.id.replace("slide-", "") as DailyLoopSlideKey;
                return (
                  <div className="day-duration-row" key={slide.id}>
                    <span>{slideLabels[key]}</span>
                    <div className="day-duration-stepper">
                      <button
                        aria-label={`Zkrátit ${slideLabels[key]}`}
                        disabled={durations[key] <= SLIDE_MIN_DURATION_SECONDS}
                        onClick={() =>
                          setDurations((previous) => ({
                            ...previous,
                            [key]: Math.max(SLIDE_MIN_DURATION_SECONDS, previous[key] - 1)
                          }))
                        }
                        type="button"
                      >
                        <Minus size={20} aria-hidden="true" />
                      </button>
                      <strong>{durations[key]} s</strong>
                      <button
                        aria-label={`Prodloužit ${slideLabels[key]}`}
                        disabled={durations[key] >= SLIDE_MAX_DURATION_SECONDS}
                        onClick={() =>
                          setDurations((previous) => ({
                            ...previous,
                            [key]: Math.min(SLIDE_MAX_DURATION_SECONDS, previous[key] + 1)
                          }))
                        }
                        type="button"
                      >
                        <Plus size={20} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                );
              })}
              <p className="day-durations-total">
                Celá smyčka: {previewDeck.slides.reduce((total, slide) => total + slide.durationFrames, 0) / 30} sekund
              </p>
            </div>
          </div>
        </aside>
      </div>

      <div className="day-submit-bar">
        <div className="day-submit-status">
          {validation.ready ? (
            <StatusBadge tone="good">Vše připravené</StatusBadge>
          ) : (
            <div className="day-problems">
              <TriangleAlert size={20} aria-hidden="true" />
              <ul>
                {validation.problems.slice(0, 3).map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
                {validation.problems.length > 3 ? (
                  <li>… a další ({validation.problems.length - 3})</li>
                ) : null}
              </ul>
            </div>
          )}
        </div>
        <div className="day-submit-actions">
          <button
            className="button"
            disabled={!validation.ready || submitting !== null}
            onClick={() => submit(false)}
            type="button"
          >
            {submitting === "save" ? (
              <Loader2 className="spin" size={20} aria-hidden="true" />
            ) : (
              <Save size={20} aria-hidden="true" />
            )}
            Uložit na později
          </button>
          <button
            className="button primary large"
            disabled={!validation.ready || !canLaunch || !selectedScreen || submitting !== null}
            onClick={() => setConfirmOpen(true)}
            type="button"
          >
            {submitting === "publish" ? (
              <Loader2 className="spin" size={20} aria-hidden="true" />
            ) : (
              <Rocket size={20} aria-hidden="true" />
            )}
            Spustit na TV
          </button>
        </div>
        {!canLaunch ? (
          <p className="day-submit-note">
            Vaše role ({roleLabel}) nemůže spouštět TV. Menu můžete uložit a spuštění nechat na vedoucím.
          </p>
        ) : !selectedScreen ? (
          <p className="day-submit-note">Není vybraná žádná spárovaná TV — menu lze zatím jen uložit.</p>
        ) : null}
      </div>

      {error ? (
        <div className="launch-error" role="alert">
          <strong>Nepovedlo se.</strong>
          <span>{error}</span>
        </div>
      ) : null}

      {result ? (
        <div className="launch-result" aria-live="polite" role="status">
          <div>
            <Check size={22} aria-hidden="true" />
            <strong>{result.message}</strong>
          </div>
        </div>
      ) : null}

      {confirmOpen ? (
        <ConfirmModal
          dayLabel={dayLabel}
          screenName={selectedScreen?.name ?? "TV"}
          itemCount={menu.sections.reduce((total, section) => total + section.items.length, 0)}
          slideCount={previewDeck.slides.length}
          submitting={submitting === "publish"}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => submit(true)}
        />
      ) : null}

      {photoPicker ? (
        <DishPhotoModal
          dishName={sections[photoPicker.sectionKey][photoPicker.index].name}
          canteenId={canteenId}
          onClose={() => setPhotoPicker(null)}
          onPick={(photo) => {
            updateItem(photoPicker.sectionKey, photoPicker.index, {
              photoAssetId: photo?.assetId ?? null,
              photoUrl: photo?.url ?? null,
              photoFocalPoint: photo?.focalPoint ?? null
            });
            setPhotoPicker(null);
          }}
        />
      ) : null}
    </div>
  );
}

function toMenuItem(sectionKey: FormSectionKey, item: DraftItem, index: number): MenuExtractionItem {
  const price = Number(item.price);

  return {
    id: `${sectionKey}-${index + 1}`,
    name: item.name.trim(),
    shortName: item.name.trim().length > 28 ? item.name.trim().slice(0, 25).trimEnd() : undefined,
    description: item.description.trim() ? item.description.trim() : null,
    prices: [
      {
        label: "porce",
        amount: item.price.trim() !== "" && !Number.isNaN(price) ? price : null,
        currency: "CZK"
      }
    ],
    allergens: item.allergens,
    allergensUnknown: !item.noAllergens && item.allergens.length === 0,
    dietaryTags: [],
    modifiers: [],
    available: true,
    highlight: false,
    photoAssetId: item.photoAssetId,
    photoFocalPoint: item.photoFocalPoint ?? undefined,
    sourceRefs: [],
    confidence: 1
  };
}

type DishRowProps = {
  item: DraftItem;
  index: number;
  sectionKey: FormSectionKey;
  canteenId: string;
  withPhoto: boolean;
  withDescription: boolean;
  onChange: (patch: Partial<DraftItem>) => void;
  onOpenPhoto: () => void;
};

function DishRow({
  item,
  index,
  sectionKey,
  canteenId,
  withPhoto,
  withDescription,
  onChange,
  onOpenPhoto
}: DishRowProps) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const filled = item.name.trim().length > 0;

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  function handleNameChange(value: string) {
    onChange({ name: value });

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (value.trim().length < 2) {
      setSuggestions([]);
      setSuggestionsOpen(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ canteenId, q: value.trim(), sectionId: sectionKey });
        const response = await fetch(`/api/menus/suggest?${params.toString()}`);
        const body = (await response.json().catch(() => null)) as { suggestions?: Suggestion[] } | null;
        setSuggestions(body?.suggestions ?? []);
        setSuggestionsOpen((body?.suggestions ?? []).length > 0);
      } catch {
        setSuggestions([]);
      }
    }, 300);
  }

  async function applySuggestion(suggestion: Suggestion) {
    setSuggestionsOpen(false);

    let photoUrl: string | null = null;
    if (suggestion.photoAssetId) {
      try {
        const response = await fetch(`/api/dish-photos?assetId=${suggestion.photoAssetId}`);
        const body = (await response.json().catch(() => null)) as { photos?: LibraryPhoto[] } | null;
        photoUrl = body?.photos?.[0]?.signedUrl ?? null;
      } catch {
        photoUrl = null;
      }
    }

    onChange({
      name: suggestion.name,
      price: suggestion.priceCzk != null ? String(suggestion.priceCzk) : item.price,
      allergens: suggestion.allergens.filter(isAllergenCode),
      noAllergens: false,
      allergensFromHistory: suggestion.allergens.length > 0,
      allergensConfirmed: suggestion.allergens.length === 0,
      photoAssetId: suggestion.photoAssetId,
      photoUrl,
      photoFocalPoint: suggestion.photoFocalPoint
    });
  }

  return (
    <div className={`dish-row ${filled ? "filled" : ""}`}>
      <div className="dish-row-main">
        {withPhoto ? (
          <button
            className={`dish-photo-button ${item.photoUrl ? "has-photo" : ""}`}
            onClick={onOpenPhoto}
            disabled={!filled}
            title={filled ? "Vybrat fotku jídla" : "Nejdřív napište název jídla"}
            type="button"
          >
            {item.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img alt="" src={item.photoUrl} />
            ) : (
              <>
                <Camera size={22} aria-hidden="true" />
                <span>Fotka</span>
              </>
            )}
          </button>
        ) : null}

        <div className="dish-name-wrap">
          <label>
            {index + 1}. jídlo
            <input
              autoComplete="off"
              onBlur={() => setTimeout(() => setSuggestionsOpen(false), 200)}
              onChange={(event) => handleNameChange(event.target.value)}
              placeholder="Začněte psát název…"
              type="text"
              value={item.name}
            />
          </label>
          {suggestionsOpen ? (
            <div className="dish-suggestions" role="listbox">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion.name}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    void applySuggestion(suggestion);
                  }}
                  role="option"
                  aria-selected="false"
                  type="button"
                >
                  <strong>{suggestion.name}</strong>
                  <span>
                    {suggestion.priceCzk != null ? `${suggestion.priceCzk} Kč` : "bez ceny"}
                    {suggestion.allergens.length > 0 ? ` · alergeny ${suggestion.allergens.join(", ")}` : ""}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <label className="dish-price">
          Cena (Kč)
          <input
            inputMode="numeric"
            onChange={(event) => onChange({ price: event.target.value.replace(/[^0-9]/g, "") })}
            placeholder="0"
            type="text"
            value={item.price}
          />
        </label>
      </div>

      {withDescription && filled ? (
        <label className="dish-description">
          Popis (co na ní je)
          <input
            maxLength={120}
            onChange={(event) => onChange({ description: event.target.value })}
            placeholder="např. tomat, mozzarella, prosciutto, rukola"
            type="text"
            value={item.description}
          />
        </label>
      ) : null}

      {filled ? (
        <div className="dish-allergens">
          <span className="dish-allergens-label">Alergeny:</span>
          <div className="allergen-chips">
            {allergenCatalog.map((allergen) => {
              const selected = item.allergens.includes(allergen.code);
              return (
                <button
                  key={allergen.code}
                  className={`allergen-chip ${selected ? "selected" : ""}`}
                  onClick={() =>
                    onChange({
                      allergens: selected
                        ? item.allergens.filter((code) => code !== allergen.code)
                        : [...item.allergens, allergen.code],
                      noAllergens: false,
                      allergensConfirmed: true,
                      allergensFromHistory: false
                    })
                  }
                  title={allergen.fullName}
                  type="button"
                >
                  {allergen.code}
                  <small>{allergen.shortName}</small>
                </button>
              );
            })}
            <button
              className={`allergen-chip none ${item.noAllergens ? "selected" : ""}`}
              onClick={() =>
                onChange({
                  noAllergens: !item.noAllergens,
                  allergens: [],
                  allergensConfirmed: true,
                  allergensFromHistory: false
                })
              }
              type="button"
            >
              Bez alergenů
            </button>
          </div>
          {item.allergensFromHistory && !item.allergensConfirmed ? (
            <div className="allergen-confirm" role="alert">
              <TriangleAlert size={18} aria-hidden="true" />
              <span>Alergeny jsou převzaté z minula. Zkontrolujte je — receptura se mohla změnit.</span>
              <button
                className="button compact"
                onClick={() => onChange({ allergensConfirmed: true })}
                type="button"
              >
                <Check size={18} aria-hidden="true" />
                Zkontrolováno, souhlasí
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

const allergenCodes = new Set(allergenCatalog.map((allergen) => allergen.code));

function isAllergenCode(value: string): value is AllergenCode {
  return allergenCodes.has(value as AllergenCode);
}

type ConfirmModalProps = {
  dayLabel: string;
  screenName: string;
  itemCount: number;
  slideCount: number;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

function ConfirmModal({
  dayLabel,
  screenName,
  itemCount,
  slideCount,
  submitting,
  onCancel,
  onConfirm
}: ConfirmModalProps) {
  return (
    <div className="day-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <div className="day-modal">
        <h2 id="confirm-title">Spustit menu na TV?</h2>
        <ul className="day-modal-summary">
          <li>
            <strong>Den:</strong> {dayLabel}
          </li>
          <li>
            <strong>TV:</strong> {screenName}
          </li>
          <li>
            <strong>Obsah:</strong> {itemCount} jídel na {slideCount} slidech
          </li>
        </ul>
        <p>Hosté v jídelně uvidí novou smyčku do minuty.</p>
        <div className="day-modal-actions">
          <button className="button" disabled={submitting} onClick={onCancel} type="button">
            <X size={20} aria-hidden="true" />
            Zpět, ještě upravit
          </button>
          <button className="button primary large" disabled={submitting} onClick={onConfirm} type="button">
            {submitting ? (
              <Loader2 className="spin" size={20} aria-hidden="true" />
            ) : (
              <Rocket size={20} aria-hidden="true" />
            )}
            Ano, spustit na TV
          </button>
        </div>
      </div>
    </div>
  );
}

type DishPhotoModalProps = {
  dishName: string;
  canteenId: string;
  onClose: () => void;
  onPick: (photo: { assetId: string; url: string | null; focalPoint: { x: number; y: number } | null } | null) => void;
};

function DishPhotoModal({ dishName, canteenId, onClose, onPick }: DishPhotoModalProps) {
  const [photos, setPhotos] = useState<LibraryPhoto[]>([]);
  const [query, setQuery] = useState(dishName);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadPhotos = useCallback(async (searchTerm: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchTerm.trim()) {
        params.set("q", searchTerm.trim());
      }
      const response = await fetch(`/api/dish-photos?${params.toString()}`);
      const body = (await response.json().catch(() => null)) as { photos?: LibraryPhoto[] } | null;
      setPhotos(body?.photos ?? []);
    } catch {
      setPhotos([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPhotos(dishName);
  }, [dishName, loadPhotos]);

  async function uploadPhoto(file: File) {
    setUploading(true);
    setUploadError(null);

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
        | { bucket?: string; path?: string; token?: string; signedUrl?: string; error?: string }
        | null;

      if (!intentResponse.ok || !intent?.path || !intent.token) {
        throw new Error(intent?.error ?? "Příprava nahrání selhala.");
      }

      const { createBrowserSupabaseClient } = await import("@/lib/supabase/client");
      const supabase = createBrowserSupabaseClient();
      const upload = await supabase.storage
        .from(intent.bucket ?? "dish-photos")
        .uploadToSignedUrl(intent.path, intent.token, file, { contentType: file.type });

      if (upload.error) {
        throw new Error(`Nahrání fotky selhalo: ${upload.error.message}`);
      }

      const registerResponse = await fetch("/api/dish-photos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          path: intent.path,
          dishName,
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
        focalPoint: { x: 0.5, y: 0.5 }
      });
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Nahrání selhalo.");
      setUploading(false);
    }
  }

  return (
    <div className="day-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="photo-title">
      <div className="day-modal wide">
        <div className="day-modal-head">
          <h2 id="photo-title">Fotka pro „{dishName}"</h2>
          <button className="button compact" onClick={onClose} type="button">
            <X size={18} aria-hidden="true" />
            Zavřít
          </button>
        </div>

        <div className="photo-modal-toolbar">
          <input
            onChange={(event) => {
              setQuery(event.target.value);
              void loadPhotos(event.target.value);
            }}
            placeholder="Hledat v knihovně fotek…"
            type="text"
            value={query}
          />
          <button
            className="button primary"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            type="button"
          >
            {uploading ? (
              <Loader2 className="spin" size={20} aria-hidden="true" />
            ) : (
              <Camera size={20} aria-hidden="true" />
            )}
            Nahrát novou fotku
          </button>
          <input
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void uploadPhoto(file);
              }
            }}
            ref={fileInputRef}
            type="file"
          />
          <button className="button" onClick={() => onPick(null)} type="button">
            <ImageOff size={20} aria-hidden="true" />
            Bez fotky
          </button>
        </div>

        {uploadError ? (
          <div className="launch-error" role="alert">
            <strong>Fotku se nepodařilo nahrát.</strong>
            <span>{uploadError}</span>
          </div>
        ) : null}

        <div className="photo-grid">
          {loading ? (
            <p className="photo-grid-note">
              <Loader2 className="spin" size={20} aria-hidden="true" /> Načítám knihovnu…
            </p>
          ) : photos.length === 0 ? (
            <p className="photo-grid-note">
              Žádná fotka v knihovně. Nahrajte první — příště se ke stejnému jídlu doplní sama.
            </p>
          ) : (
            photos.map((photo) => (
              <button
                key={photo.id}
                className="photo-grid-item"
                onClick={() =>
                  onPick({ assetId: photo.assetId, url: photo.signedUrl, focalPoint: photo.focalPoint })
                }
                type="button"
              >
                {photo.signedUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img alt={photo.dishName} src={photo.signedUrl} />
                ) : (
                  <span className="photo-grid-missing">bez náhledu</span>
                )}
                <span>{photo.dishName}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    draft: "rozepsané",
    needs_review: "čeká na kontrolu",
    approved: "připravené",
    published: "na TV",
    rejected: "vrácené k úpravě"
  };
  return labels[status] ?? status;
}

function formatDayLabel(isoDate: string) {
  return new Intl.DateTimeFormat("cs-CZ", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(new Date(`${isoDate}T12:00:00`));
}

function weekdayLabel(isoDate: string) {
  return new Intl.DateTimeFormat("cs-CZ", { weekday: "long" }).format(
    new Date(`${isoDate}T12:00:00`)
  );
}

function formatSavedAt(savedAtIso: string) {
  try {
    return new Intl.DateTimeFormat("cs-CZ", {
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(savedAtIso));
  } catch {
    return "před chvílí";
  }
}
