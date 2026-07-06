"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
  formatCzk,
  getAllergenLabel,
  parsePastedMenuText,
  validateMenuForApproval,
  type MenuExtractionResult
} from "@masico/shared";
import { CheckCircle2, Copy, ExternalLink, Loader2, Rocket, Settings, Sparkles, Utensils } from "lucide-react";
import type { ProductionDashboardSnapshot } from "@/lib/studio-dashboard";
import { StatusBadge } from "./StatusBadge";

type ProductionQuickLaunchProps = {
  canLaunch: boolean;
  roleLabel: string;
  snapshot: ProductionDashboardSnapshot;
};

type LaunchResult = {
  ok: true;
  mode: "live";
  menuVersionId: string;
  deckVersionId: string;
  screenId: string;
  publishEventId: string;
  playerUrl: string;
  background?: {
    assetId: string;
    signedUrl?: string;
    reused?: boolean;
  } | null;
  itemCount: number;
  warningCount: number;
  warnings: string[];
  note: string;
};

const menuPlaceholder = `Polévky
Gulášová polévka 49 Kč alergeny 1, 9

Hlavní jídla
Smažený vepřový řízek, bramborový salát 159 Kč alergeny 1, 3, 7, 10
Hovězí guláš, houskový knedlík 149 Kč al. 1, 3, 7`;

export function ProductionQuickLaunch({ canLaunch, roleLabel, snapshot }: ProductionQuickLaunchProps) {
  const [locationId, setLocationId] = useState(snapshot.locations[0]?.id ?? "");
  const canteens = useMemo(
    () => snapshot.canteens.filter((canteen) => canteen.locationId === locationId),
    [locationId, snapshot.canteens]
  );
  const [canteenId, setCanteenId] = useState(canteens[0]?.id ?? snapshot.canteens[0]?.id ?? "");
  const initialScreenId =
    snapshot.screens.find(
      (screen) =>
        screen.locationId === (snapshot.locations[0]?.id ?? "") &&
        screen.canteenId === (canteens[0]?.id ?? snapshot.canteens[0]?.id ?? "")
    )?.id ??
    snapshot.screens[0]?.id ??
    "";
  const [menuDate, setMenuDate] = useState(snapshot.todayIso);
  const [screenId, setScreenId] = useState(initialScreenId);
  const [sourceText, setSourceText] = useState("");
  const [confirmedForTv, setConfirmedForTv] = useState(false);
  const [backgroundPrompt, setBackgroundPrompt] = useState(
    "Moderní food signage background pro MASI-CO, světlá plocha pro menu vlevo, kvalitní české jídlo, červený akcent, bez textu."
  );
  const [showSettings, setShowSettings] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<LaunchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selectedCanteens = canteens.length > 0 ? canteens : snapshot.canteens;
  const selectedLocation = snapshot.locations.find((location) => location.id === locationId);
  const selectedCanteen = selectedCanteens.find((canteen) => canteen.id === canteenId);
  const selectedScreens = snapshot.screens.filter(
    (screen) => screen.locationId === locationId && screen.canteenId === canteenId
  );
  const selectedScreen = selectedScreens.find((screen) => screen.id === screenId);
  const isValidMenuDate = /^\d{4}-\d{2}-\d{2}$/.test(menuDate);
  const preflightMenu = useMemo(
    () => (sourceText.trim() ? parsePastedMenuText(sourceText, menuDate) : null),
    [menuDate, sourceText]
  );
  const preflightIssues = useMemo(
    () => (preflightMenu ? validateMenuForApproval(preflightMenu) : []),
    [preflightMenu]
  );
  const menuItemCount =
    preflightMenu?.sections.reduce((total, section) => total + section.items.length, 0) ?? 0;
  const blockingIssues = preflightIssues.filter((issue) => issue.severity === "error");
  const missingPriceCount = blockingIssues.filter((issue) => issue.code === "missing_price").length;
  const missingAllergenCount = blockingIssues.filter((issue) => issue.code === "missing_allergens").length;
  const hasEnoughMenuText = sourceText.trim().length >= 10;
  const hasMenuItems = menuItemCount > 0;
  const hasBlockingIssues = blockingIssues.length > 0;
  const canSubmit = Boolean(
    canLaunch &&
      locationId &&
      canteenId &&
      screenId &&
      selectedScreen &&
      isValidMenuDate &&
      hasEnoughMenuText &&
      hasMenuItems &&
      !hasBlockingIssues &&
      confirmedForTv &&
      !submitting
  );
  const launchNextStep = getLaunchNextStep({
    canLaunch,
    hasEnoughMenuText,
    hasMenuItems,
    hasBlockingIssues,
    missingAllergenCount,
    missingPriceCount,
    hasScreen: Boolean(selectedScreen),
    isValidMenuDate,
    confirmedForTv
  });

  async function submitLaunch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }

    setSubmitting(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/today/launch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          locationId,
          canteenId,
          menuDate,
          sourceText,
          screenId,
          backgroundPrompt,
          backgroundQuality: "draft",
          comment: "Dnešní spuštění potvrzeno v produkčním panelu."
        })
      });
      const body = (await response.json().catch(() => null)) as
        | LaunchResult
        | { error?: string; code?: string }
        | null;

      if (!response.ok || !body || !("ok" in body)) {
        const errorMessage = body && "error" in body ? body.error : null;
        throw new Error(getLaunchErrorMessage(errorMessage ?? `Spuštění selhalo (${response.status}).`));
      }

      setResult(body);
    } catch (launchError) {
      setError(
        launchError instanceof Error
          ? getLaunchErrorMessage(launchError.message)
          : "Spuštění TV selhalo."
      );
    } finally {
      setSubmitting(false);
    }
  }

  function markDraftChanged() {
    setConfirmedForTv(false);
    setResult(null);
    setError(null);
  }

  async function copyPlayerUrl() {
    if (!result?.playerUrl) {
      return;
    }

    await navigator.clipboard.writeText(result.playerUrl).catch(() => undefined);
  }

  return (
    <section className="launch-panel" id="dnes-spustit-tv">
      <div className="launch-hero">
        <div>
          <p className="eyebrow">Dnešní spuštění</p>
          <h2>Dnešní jídelníček</h2>
          <p>
            {selectedLocation?.name ?? "Provozovna"} · {selectedCanteen?.name ?? "jídelna"} ·{" "}
            {formatCzechDateLabel(menuDate)}
          </p>
        </div>
        <div className="launch-hero-actions">
          <StatusBadge tone={result ? "good" : error ? "critical" : "info"}>
            {result ? "Odesláno" : error ? "Chyba" : "Připraveno"}
          </StatusBadge>
        </div>
      </div>

      <form className="launch-form" onSubmit={submitLaunch}>
        <div className="launch-checklist" aria-label="Kontrola před spuštěním">
          <div>
            <Utensils size={18} aria-hidden="true" />
            <span>Vložit menu</span>
          </div>
          <span>Datum zkontrolovat dole</span>
          <span>Po kliknutí se menu odešle na TV</span>
        </div>

        <label className="launch-wide">
          Dnešní jídelníček
          <textarea
            aria-describedby="launch-menu-help"
            onChange={(event) => {
              setSourceText(event.target.value);
              markDraftChanged();
            }}
            placeholder={menuPlaceholder}
            rows={12}
            value={sourceText}
          />
        </label>

        <div className="launch-menu-footer" id="launch-menu-help">
          <span>{hasMenuItems ? formatItemCount(menuItemCount) : "Cena zatím nenalezena"}</span>
          <label>
            Datum jídelníčku pro TV
            <input
              onChange={(event) => {
                setMenuDate(event.target.value || "");
                markDraftChanged();
              }}
              type="date"
              value={menuDate}
            />
          </label>
        </div>

        {showSettings ? (
          <fieldset className="launch-settings" id="dnes-nastaveni">
            <legend className="launch-settings-head">
              <Settings size={18} aria-hidden="true" />
              <strong>Nastavení provozu</strong>
            </legend>

            <label>
              Provozovna
              <select
                onChange={(event) => {
                  setLocationId(event.target.value);
                  const firstCanteen = snapshot.canteens.find(
                    (canteen) => canteen.locationId === event.target.value
                  );
                  const firstScreen = snapshot.screens.find(
                    (screen) =>
                      screen.locationId === event.target.value && screen.canteenId === firstCanteen?.id
                  );
                  setCanteenId(firstCanteen?.id ?? "");
                  setScreenId(firstScreen?.id ?? "");
                  markDraftChanged();
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
                  const nextCanteenId = event.target.value;
                  const firstScreen = snapshot.screens.find(
                    (screen) => screen.locationId === locationId && screen.canteenId === nextCanteenId
                  );
                  setCanteenId(nextCanteenId);
                  setScreenId(firstScreen?.id ?? "");
                  markDraftChanged();
                }}
                value={canteenId}
              >
                {selectedCanteens.map((canteen) => (
                  <option key={canteen.id} value={canteen.id}>
                    {canteen.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              TV obrazovka
              <select
                onChange={(event) => {
                  setScreenId(event.target.value);
                  markDraftChanged();
                }}
                value={screenId}
              >
                {selectedScreens.length === 0 ? <option value="">Není spárovaná TV</option> : null}
                {selectedScreens.map((screen) => (
                  <option key={screen.id} value={screen.id}>
                    {screen.name} · {getScreenStatusLabel(screen.status)}
                  </option>
                ))}
              </select>
            </label>

            <label className="launch-wide">
              Vzhled pozadí
              <textarea
                onChange={(event) => {
                  setBackgroundPrompt(event.target.value);
                  markDraftChanged();
                }}
                rows={3}
                value={backgroundPrompt}
              />
            </label>
          </fieldset>
        ) : null}

        {preflightMenu ? (
          <>
            <div className={`preflight-strip ${hasBlockingIssues ? "critical" : "good"}`}>
              <strong>
                Rozpoznáno: {formatItemCount(menuItemCount)} pro {formatCzechDateLabel(menuDate)}.
              </strong>
              <span>
                {hasBlockingIssues
                  ? `Před TV opravte: ${formatBlockingSummary(missingPriceCount, missingAllergenCount)}.`
                  : "Ceny a alergeny vypadají připravené ke kontrole."}
              </span>
            </div>
            <ParsedMenuReview menu={preflightMenu} />
          </>
        ) : null}

        <div className={`next-step-card ${launchNextStep.tone}`}>
          <div>
            <p className="eyebrow">Další krok</p>
            <h3>{launchNextStep.title}</h3>
            <p>{launchNextStep.copy}</p>
          </div>
        </div>

        <div className="launch-submit-bar">
          <div className="launch-target-summary">
            <strong>Cíl:</strong>
            <span>
              {selectedLocation?.name ?? "Provozovna"} · {selectedCanteen?.name ?? "jídelna"} ·{" "}
              {selectedScreen?.name ?? "TV není vybraná"} · {formatCzechDateLabel(menuDate)}
            </span>
            <button
              className="button compact"
              aria-controls="dnes-nastaveni"
              aria-expanded={showSettings}
              onClick={() => setShowSettings((value) => !value)}
              type="button"
            >
              <Settings size={16} aria-hidden="true" />
              Změnit cíl
            </button>
          </div>

          {!canLaunch ? (
            <div className="launch-recovery-note">
              Vaše role: {roleLabel}. Denní spuštění vyžaduje vlastník/admin.
            </div>
          ) : null}

          <label className="launch-confirm">
            <input
              checked={confirmedForTv}
              disabled={
                !canLaunch ||
                !selectedScreen ||
                !isValidMenuDate ||
                !hasEnoughMenuText ||
                !hasMenuItems ||
                hasBlockingIssues
              }
              onChange={(event) => setConfirmedForTv(event.target.checked)}
              type="checkbox"
            />
            <span>
              Potvrzuji TV {selectedScreen?.name ?? "není vybraná"}, datum {formatCzechDateLabel(menuDate)} a
              všechny ceny i alergeny podle zdrojového menu.
            </span>
          </label>

          <div className="launch-actions">
            <button className="button primary" disabled={!canSubmit} type="submit">
              {submitting ? (
                <Loader2 className="spin" size={18} aria-hidden="true" />
              ) : (
                <Rocket size={18} aria-hidden="true" />
              )}
              {submitting ? "Spouštím..." : "Vygenerovat a pustit na TV"}
            </button>
          </div>
        </div>
      </form>

      {error ? (
        <div className="launch-error" role="alert">
          <strong>Vytvoření TV smyčky selhalo.</strong>
          <span>{error}</span>
        </div>
      ) : null}

      {result ? (
        <div className="launch-result" aria-live="polite" role="status">
          <div>
            <CheckCircle2 size={20} aria-hidden="true" />
            <strong>Menu je odeslané. Ověřte obrazovku v jídelně.</strong>
            <span>
              Položek: {result.itemCount} · varování: {result.warningCount} · čeká se na potvrzení TV
            </span>
          </div>
          {result.background?.signedUrl ? (
            <a href={result.background.signedUrl} rel="noreferrer" target="_blank">
              <Sparkles size={17} aria-hidden="true" />
              Pozadí
            </a>
          ) : null}
          <button className="button" onClick={copyPlayerUrl} type="button">
            <Copy size={17} aria-hidden="true" />
            Kopírovat TV odkaz
          </button>
          <a className="button primary" href={result.playerUrl} rel="noreferrer" target="_blank">
            <ExternalLink size={17} aria-hidden="true" />
            Otevřít TV
          </a>
          <div className="tv-confirmation-strip">
            TV přehrávač si novou verzi načte sám. Pokud se obrazovka nezmění, otevřete stav TV v přehledu.
          </div>
        </div>
      ) : null}
    </section>
  );
}

function formatItemCount(count: number) {
  if (count === 1) {
    return "1 položka s cenou";
  }

  if (count >= 2 && count <= 4) {
    return `${count} položky s cenou`;
  }

  return `${count} položek s cenou`;
}

function formatCzechDateLabel(isoDate: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    return "datum k ověření";
  }

  return new Intl.DateTimeFormat("cs-CZ", {
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(new Date(`${isoDate}T12:00:00`));
}

function getLaunchNextStep(input: {
  canLaunch: boolean;
  hasEnoughMenuText: boolean;
  hasMenuItems: boolean;
  hasBlockingIssues: boolean;
  missingAllergenCount: number;
  missingPriceCount: number;
  hasScreen: boolean;
  isValidMenuDate: boolean;
  confirmedForTv: boolean;
}) {
  if (!input.canLaunch) {
    return {
      tone: "critical",
      title: "Požádejte admina o odeslání",
      copy: "Tento účet může menu zkontrolovat, ale nemůže ho pustit na TV."
    };
  }

  if (!input.hasScreen) {
    return {
      tone: "critical",
      title: "Vyberte spárovanou TV",
      copy: "V nastavení cíle vyberte konkrétní TV obrazovku. Bez ní se menu nikam neodešle."
    };
  }

  if (!input.isValidMenuDate) {
    return {
      tone: "critical",
      title: "Doplňte datum",
      copy: "Datum jídelníčku musí být vyplněné před odesláním na TV."
    };
  }

  if (!input.hasEnoughMenuText) {
    return {
      tone: "warn",
      title: "Vložte dnešní jídelníček",
      copy: "Do pole vložte text menu ze stolu nebo z dokumentu."
    };
  }

  if (!input.hasMenuItems) {
    return {
      tone: "critical",
      title: "Chybí položka s cenou",
      copy: "V textu musí být aspoň jedno jídlo s cenou v Kč."
    };
  }

  if (input.hasBlockingIssues) {
    return {
      tone: "critical",
      title: "Opravte cenu nebo alergeny",
      copy: `Před TV chybí ${formatBlockingSummary(input.missingPriceCount, input.missingAllergenCount)}.`
    };
  }

  if (!input.confirmedForTv) {
    return {
      tone: "warn",
      title: "Potvrďte kontrolu",
      copy: "Zaškrtněte, že jídelníček, ceny a datum jsou zkontrolované."
    };
  }

  return {
    tone: "good",
    title: "Připraveno na TV",
    copy: "Teď můžete vygenerovat a pustit dnešní menu na TV."
  };
}

function formatBlockingSummary(missingPriceCount: number, missingAllergenCount: number) {
  const parts: string[] = [];

  if (missingPriceCount > 0) {
    parts.push(`${missingPriceCount} ${missingPriceCount === 1 ? "chybějící cena" : "chybějící ceny"}`);
  }

  if (missingAllergenCount > 0) {
    parts.push(
      `${missingAllergenCount} ${
        missingAllergenCount === 1 ? "neověřený alergen" : "neověřené alergeny"
      }`
    );
  }

  return parts.length > 0 ? parts.join(", ") : "neověřené položky";
}

function getLaunchErrorMessage(message: string) {
  if (message.toLowerCase().includes("template version payload is immutable")) {
    return "Databáze ještě používá starou verzi vytváření TV smyčky. Po nasazení nové migrace zkuste spuštění znovu.";
  }

  return message;
}

function ParsedMenuReview({ menu }: { menu: MenuExtractionResult }) {
  return (
    <div className="launch-parsed-review" aria-live="polite">
      <div className="launch-parsed-review-head">
        <strong>Zkontrolujte rozpoznaná jídla</strong>
        <span>Na TV odejde přesně tento obsah.</span>
      </div>
      <div className="launch-parsed-list">
        {menu.sections.flatMap((section) =>
          section.items.map((item) => (
            <article className="launch-parsed-item" key={item.id}>
              <div>
                <span>{section.name}</span>
                <strong>{item.name}</strong>
              </div>
              <dl>
                <div>
                  <dt>Cena</dt>
                  <dd>{formatCzk(item.prices[0]?.amount ?? null)}</dd>
                </div>
                <div>
                  <dt>Alergeny</dt>
                  <dd>
                    {item.allergens.length > 0
                      ? item.allergens.map((code) => getAllergenLabel(code)).join(", ")
                      : "K ověření"}
                  </dd>
                </div>
              </dl>
            </article>
          ))
        )}
      </div>
    </div>
  );
}

function getScreenStatusLabel(status: string) {
  if (status === "published") {
    return "aktivní";
  }

  if (status === "paired") {
    return "spárovaná";
  }

  return "není spárovaná";
}
