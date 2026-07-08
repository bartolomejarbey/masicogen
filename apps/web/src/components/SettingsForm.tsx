"use client";

import { useMemo, useState } from "react";
import {
  dailyLoopSlides,
  dailyLoopTemplates,
  framesToSeconds,
  SLIDE_MAX_DURATION_SECONDS,
  SLIDE_MIN_DURATION_SECONDS,
  type DailyLoopSlideKey,
  type OrgSettings
} from "@masico/shared";
import { Check, Info, Loader2, Minus, Plus, Save, TriangleAlert, X } from "lucide-react";

export type AutomationRunItem = {
  runType: string;
  status: string;
  errorMessage: string | null;
  startedAt: string;
  detail: Record<string, unknown> | null;
};

type SettingsFormProps = {
  initialSettings: OrgSettings;
  runs: AutomationRunItem[];
  /** Vlastník/admin: může upravovat a ukládat. */
  isAdmin: boolean;
  /** Admin a demo vidí i Obsah, Automatiku a Provoz; ostatní jen Smyčku. */
  showAdminSections: boolean;
  readOnlyNote: string | null;
};

type SettingsFormState = {
  enabledSlides: Record<DailyLoopSlideKey, boolean>;
  durations: Record<DailyLoopSlideKey, number>;
  footerLegendText: string;
  defaultSoup: string;
  autoPublish: boolean;
  aiPhotosEnabled: boolean;
  aiPhotosDailyLimit: number;
};

const AI_PHOTO_LIMIT_MIN = 0;
const AI_PHOTO_LIMIT_MAX = 200;
const AI_PHOTO_LIMIT_STEP = 5;

const slideLabels: Record<DailyLoopSlideKey, string> = {
  intro: "Přehled dne",
  soups: "Polévky",
  mains: "Hlavní jídla",
  pizza: "Pizza dne",
  buffet: "Teplý bufet",
  special: "Dnes navíc"
};

const runTypeLabels: Record<string, string> = {
  pull_publish: "Publikace na TV",
  week_extract: "Načtení lístku",
  dish_photo: "Fotka jídla",
  deck_prepare: "Příprava smyčky",
  morning_check: "Ranní kontrola",
  render: "Export videa"
};

const skipReasonLabels: Record<string, string> = {
  auto_publish_disabled: "Ranní publikace je vypnutá v nastavení.",
  no_deck_for_today: "Na ten den nebylo připravené menu.",
  manual_publish_newer: "Přednost dostala novější ruční publikace.",
  deck_screen_mismatch: "Připravená smyčka nepatřila k této televizi."
};

function templateDefaultDurations(): Record<DailyLoopSlideKey, number> {
  const durations = {} as Record<DailyLoopSlideKey, number>;
  for (const slide of dailyLoopSlides) {
    const template = dailyLoopTemplates.find((candidate) => candidate.id === slide.templateId);
    durations[slide.key] = template ? framesToSeconds(template.durationFrames) : 8;
  }
  return durations;
}

function buildFormState(settings: OrgSettings): SettingsFormState {
  const fallbackDurations = templateDefaultDurations();
  const durations = {} as Record<DailyLoopSlideKey, number>;
  const enabledSlides = {} as Record<DailyLoopSlideKey, boolean>;

  for (const slide of dailyLoopSlides) {
    durations[slide.key] = settings.loop.durationsSeconds[slide.key] ?? fallbackDurations[slide.key];
    // Povinné slidy jsou vždy zapnuté, ať je v uloženém JSON cokoliv.
    enabledSlides[slide.key] = slide.optional ? settings.loop.enabledSlides[slide.key] : true;
  }

  return {
    enabledSlides,
    durations,
    footerLegendText: settings.content.footerLegendText,
    defaultSoup: settings.content.defaultSoup,
    autoPublish: settings.automation.autoPublish,
    aiPhotosEnabled: settings.automation.aiPhotos.enabled,
    aiPhotosDailyLimit: settings.automation.aiPhotos.dailyLimit
  };
}

function slidesEqual(
  left: Record<DailyLoopSlideKey, boolean | number>,
  right: Record<DailyLoopSlideKey, boolean | number>
) {
  return dailyLoopSlides.every((slide) => left[slide.key] === right[slide.key]);
}

/** Posílají se vždy celé sekce — RPC merguje sekce mělce, dílčí patch by umazal sourozence. */
function buildPatch(state: SettingsFormState, baseline: SettingsFormState) {
  const patch: Record<string, unknown> = {};

  if (
    !slidesEqual(state.enabledSlides, baseline.enabledSlides) ||
    !slidesEqual(state.durations, baseline.durations)
  ) {
    patch.loop = {
      enabledSlides: state.enabledSlides,
      durationsSeconds: state.durations
    };
  }

  if (
    state.footerLegendText !== baseline.footerLegendText ||
    state.defaultSoup !== baseline.defaultSoup
  ) {
    patch.content = {
      footerLegendText: state.footerLegendText,
      defaultSoup: state.defaultSoup
    };
  }

  if (
    state.autoPublish !== baseline.autoPublish ||
    state.aiPhotosEnabled !== baseline.aiPhotosEnabled ||
    state.aiPhotosDailyLimit !== baseline.aiPhotosDailyLimit
  ) {
    patch.automation = {
      autoPublish: state.autoPublish,
      aiPhotos: {
        enabled: state.aiPhotosEnabled,
        dailyLimit: state.aiPhotosDailyLimit
      }
    };
  }

  return patch;
}

const runTimeFormat = new Intl.DateTimeFormat("cs-CZ", {
  weekday: "short",
  day: "numeric",
  month: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Prague"
});

function formatRunTime(startedAt: string) {
  const time = new Date(startedAt);
  return Number.isNaN(time.getTime()) ? startedAt : runTimeFormat.format(time);
}

export function SettingsForm({
  initialSettings,
  runs,
  isAdmin,
  showAdminSections,
  readOnlyNote
}: SettingsFormProps) {
  const [baseline, setBaseline] = useState(() => buildFormState(initialSettings));
  const [state, setState] = useState(baseline);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedOnce, setSavedOnce] = useState(false);

  const patch = useMemo(() => buildPatch(state, baseline), [state, baseline]);
  const dirty = Object.keys(patch).length > 0;

  const loopTotalSeconds = dailyLoopSlides.reduce(
    (total, slide) => (state.enabledSlides[slide.key] ? total + state.durations[slide.key] : total),
    0
  );

  function updateState(update: Partial<SettingsFormState>) {
    setState((previous) => ({ ...previous, ...update }));
  }

  function setSlideEnabled(key: DailyLoopSlideKey, enabled: boolean) {
    const definition = dailyLoopSlides.find((slide) => slide.key === key);
    // Přehled dne, polévky a hlavní jídla nejde vypnout — změnu ignorujeme.
    if (!definition || !definition.optional || !isAdmin) {
      return;
    }

    setState((previous) => ({
      ...previous,
      enabledSlides: { ...previous.enabledSlides, [key]: enabled }
    }));
  }

  function stepDuration(key: DailyLoopSlideKey, delta: number) {
    setState((previous) => ({
      ...previous,
      durations: {
        ...previous.durations,
        [key]: Math.min(
          SLIDE_MAX_DURATION_SECONDS,
          Math.max(SLIDE_MIN_DURATION_SECONDS, previous.durations[key] + delta)
        )
      }
    }));
  }

  function stepPhotoLimit(delta: number) {
    setState((previous) => ({
      ...previous,
      aiPhotosDailyLimit: Math.min(
        AI_PHOTO_LIMIT_MAX,
        Math.max(AI_PHOTO_LIMIT_MIN, previous.aiPhotosDailyLimit + delta)
      )
    }));
  }

  async function handleSave() {
    if (!dirty || saving) {
      return;
    }

    setSaving(true);
    setSaveError(null);

    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patch })
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        settings?: OrgSettings;
      } | null;

      if (!response.ok) {
        setSaveError(payload?.error ?? "Uložení se nepovedlo. Zkuste to prosím znovu.");
        return;
      }

      const nextState = payload?.settings ? buildFormState(payload.settings) : state;
      setBaseline(nextState);
      setState(nextState);
      setSavedOnce(true);
    } catch {
      setSaveError("Uložení se nepovedlo. Zkontrolujte připojení a zkuste to znovu.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="settings-page">
      {readOnlyNote ? (
        <div className="production-banner" role="status">
          <Info size={20} aria-hidden="true" />
          <strong>Jen k nahlédnutí.</strong>
          <span>{readOnlyNote}</span>
        </div>
      ) : null}

      <section className="card pad settings-card" aria-labelledby="settings-loop-title">
        <header className="settings-card-head">
          <h2 id="settings-loop-title">Smyčka</h2>
          <p>Které obrazovky se na televizi točí a jak dlouho každá zůstane.</p>
        </header>
        <div className="settings-slide-list">
          {dailyLoopSlides.map((slide) => {
            const label = slideLabels[slide.key];
            const enabled = state.enabledSlides[slide.key];

            return (
              <div className={`settings-slide-row ${enabled ? "" : "off"}`} key={slide.key}>
                <label className="settings-slide-toggle">
                  <input
                    type="checkbox"
                    checked={enabled}
                    disabled={!slide.optional || !isAdmin}
                    onChange={(event) => setSlideEnabled(slide.key, event.target.checked)}
                  />
                  <span>
                    <strong>{label}</strong>
                    <small>
                      {!slide.optional
                        ? "Vždy zapnuto"
                        : enabled
                          ? "Zobrazuje se"
                          : "Nezobrazuje se"}
                    </small>
                  </span>
                </label>
                <div className="day-duration-stepper">
                  <button
                    aria-label={`Zkrátit ${label}`}
                    disabled={!isAdmin || !enabled || state.durations[slide.key] <= SLIDE_MIN_DURATION_SECONDS}
                    onClick={() => stepDuration(slide.key, -1)}
                    type="button"
                  >
                    <Minus size={20} aria-hidden="true" />
                  </button>
                  <strong>{state.durations[slide.key]} s</strong>
                  <button
                    aria-label={`Prodloužit ${label}`}
                    disabled={!isAdmin || !enabled || state.durations[slide.key] >= SLIDE_MAX_DURATION_SECONDS}
                    onClick={() => stepDuration(slide.key, 1)}
                    type="button"
                  >
                    <Plus size={20} aria-hidden="true" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <p className="settings-loop-total">
          <span>
            Celá smyčka: přibližně <strong>{loopTotalSeconds} sekund</strong>
          </span>
          <small>
            Skutečná délka se den ode dne liší podle toho, které sekce mají ten den jídla.
          </small>
        </p>
      </section>

      {showAdminSections ? (
        <section className="card pad settings-card" aria-labelledby="settings-content-title">
          <header className="settings-card-head">
            <h2 id="settings-content-title">Obsah</h2>
            <p>Texty, které se předvyplňují a zobrazují každý den.</p>
          </header>
          <label className="settings-field">
            <span>Spodní řádek s alergeny</span>
            <textarea
              disabled={!isAdmin}
              maxLength={200}
              onChange={(event) => updateState({ footerLegendText: event.target.value })}
              rows={3}
              value={state.footerLegendText}
            />
            <small>
              {state.footerLegendText.length} / 200 znaků · Takhle bude řádek vypadat dole na
              televizi:
            </small>
          </label>
          <p aria-hidden="true" className="settings-legend-preview">
            {state.footerLegendText.trim().length > 0
              ? state.footerLegendText
              : "Spodní řádek zůstane s původním textem šablony."}
          </p>
          <label className="settings-field">
            <span>Výchozí polévka</span>
            <input
              disabled={!isAdmin}
              maxLength={120}
              onChange={(event) => updateState({ defaultSoup: event.target.value })}
              type="text"
              value={state.defaultSoup}
            />
            <small>Polévka, kterou vaříte nejčastěji — předvyplní se do formuláře dne.</small>
          </label>
        </section>
      ) : null}

      {showAdminSections ? (
        <section className="card pad settings-card" aria-labelledby="settings-automation-title">
          <header className="settings-card-head">
            <h2 id="settings-automation-title">Automatika</h2>
            <p>Co smí systém dělat sám, bez klikání.</p>
          </header>
          <label className="settings-switch">
            <input
              checked={state.autoPublish}
              disabled={!isAdmin}
              onChange={(event) => updateState({ autoPublish: event.target.checked })}
              type="checkbox"
            />
            <span>
              <strong>Ranní publikace</strong>
              <small>TV si ráno sama pustí připravené menu.</small>
            </span>
          </label>
          <label className="settings-switch">
            <input
              checked={state.aiPhotosEnabled}
              disabled={!isAdmin}
              onChange={(event) => updateState({ aiPhotosEnabled: event.target.checked })}
              type="checkbox"
            />
            <span>
              <strong>Ilustrační fotky jídel</strong>
              <small>
                Když jídlo nemá vlastní fotku, systém doplní ilustrační. Vaše fotky mají vždy
                přednost.
              </small>
            </span>
          </label>
          <div className="settings-limit-row">
            <span>Kolik fotek smí systém denně vygenerovat</span>
            <div className="day-duration-stepper">
              <button
                aria-label="Snížit denní počet fotek"
                disabled={
                  !isAdmin || !state.aiPhotosEnabled || state.aiPhotosDailyLimit <= AI_PHOTO_LIMIT_MIN
                }
                onClick={() => stepPhotoLimit(-AI_PHOTO_LIMIT_STEP)}
                type="button"
              >
                <Minus size={20} aria-hidden="true" />
              </button>
              <strong>{state.aiPhotosDailyLimit}</strong>
              <button
                aria-label="Zvýšit denní počet fotek"
                disabled={
                  !isAdmin || !state.aiPhotosEnabled || state.aiPhotosDailyLimit >= AI_PHOTO_LIMIT_MAX
                }
                onClick={() => stepPhotoLimit(AI_PHOTO_LIMIT_STEP)}
                type="button"
              >
                <Plus size={20} aria-hidden="true" />
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {showAdminSections ? (
        <section className="card pad settings-card" aria-labelledby="settings-runs-title">
          <header className="settings-card-head">
            <h2 id="settings-runs-title">Provoz</h2>
            <p>Posledních deset věcí, které systém udělal sám.</p>
          </header>
          {runs.length === 0 ? (
            <p className="muted">
              Zatím tu nic není. Záznamy se objeví, jakmile automatika poprvé poběží.
            </p>
          ) : (
            <div className="table-wrap">
              <table className="table settings-runs-table">
                <thead>
                  <tr>
                    <th scope="col">Kdy</th>
                    <th scope="col">Co</th>
                    <th scope="col">Výsledek</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run, index) => (
                    <tr key={`${run.startedAt}-${index}`}>
                      <td>{formatRunTime(run.startedAt)}</td>
                      <td>{runTypeLabels[run.runType] ?? run.runType}</td>
                      <td>
                        <RunStatus run={run} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {isAdmin ? (
        <div className="settings-save-bar">
          <div className="settings-save-status" role="status">
            {saveError ? (
              <span className="settings-save-error">
                <TriangleAlert size={20} aria-hidden="true" />
                {saveError}
              </span>
            ) : dirty ? (
              <span>Máte neuložené změny.</span>
            ) : savedOnce ? (
              <span className="settings-save-done">
                <Check size={20} aria-hidden="true" />
                Uloženo ✓
              </span>
            ) : (
              <span className="muted">Vše je uložené.</span>
            )}
          </div>
          <button
            className="button primary large"
            disabled={!dirty || saving}
            onClick={handleSave}
            type="button"
          >
            {saving ? (
              <Loader2 className="spin" size={20} aria-hidden="true" />
            ) : (
              <Save size={20} aria-hidden="true" />
            )}
            {saving ? "Ukládám…" : "Uložit nastavení"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function RunStatus({ run }: { run: AutomationRunItem }) {
  if (run.status === "succeeded") {
    return (
      <span className="settings-run-status good">
        <Check size={18} aria-hidden="true" />
        Proběhlo
      </span>
    );
  }

  if (run.status === "skipped") {
    const reason = typeof run.detail?.reason === "string" ? run.detail.reason : null;
    const reasonLabel = reason ? skipReasonLabels[reason] ?? null : null;

    return (
      <span className="settings-run-status muted">
        <Minus size={18} aria-hidden="true" />
        Přeskočeno
        {reasonLabel ? <small className="settings-run-detail">{reasonLabel}</small> : null}
      </span>
    );
  }

  if (run.status === "failed") {
    return (
      <span className="settings-run-status bad">
        <X size={18} aria-hidden="true" />
        Selhalo
        {run.errorMessage ? <small className="settings-run-detail">{run.errorMessage}</small> : null}
      </span>
    );
  }

  return (
    <span className="settings-run-status warn">
      <TriangleAlert size={18} aria-hidden="true" />
      Proběhlo s výhradami
      {run.errorMessage ? <small className="settings-run-detail">{run.errorMessage}</small> : null}
    </span>
  );
}
