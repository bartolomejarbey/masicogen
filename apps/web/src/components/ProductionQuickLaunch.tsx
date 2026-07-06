"use client";

import { useMemo, useState, type FormEvent } from "react";
import { CheckCircle2, Copy, ExternalLink, Loader2, Rocket, Sparkles } from "lucide-react";
import type { ProductionDashboardSnapshot } from "@/lib/studio-dashboard";
import { StatusBadge } from "./StatusBadge";

type ProductionQuickLaunchProps = {
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
  tokenPreview: string;
  expiresAt: string;
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

const defaultMenuText = `Polévky
Gulášová polévka 49 Kč alergeny 1, 9
Hlavní jídla
Smažený vepřový řízek, bramborový salát 159 Kč alergeny 1, 3, 7, 10
Hovězí guláš, houskový knedlík 149 Kč al. 1, 3, 7`;

export function ProductionQuickLaunch({ snapshot }: ProductionQuickLaunchProps) {
  const [locationId, setLocationId] = useState(snapshot.locations[0]?.id ?? "");
  const canteens = useMemo(
    () => snapshot.canteens.filter((canteen) => canteen.locationId === locationId),
    [locationId, snapshot.canteens]
  );
  const [canteenId, setCanteenId] = useState(canteens[0]?.id ?? snapshot.canteens[0]?.id ?? "");
  const [menuDate, setMenuDate] = useState(snapshot.todayIso);
  const [screenName, setScreenName] = useState("MASI-CO TV");
  const [sourceText, setSourceText] = useState(defaultMenuText);
  const [backgroundPrompt, setBackgroundPrompt] = useState(
    "Moderní food signage background pro MASI-CO, světlá plocha pro menu vlevo, kvalitní české jídlo, červený akcent, bez textu."
  );
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<LaunchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selectedCanteens = canteens.length > 0 ? canteens : snapshot.canteens;
  const canSubmit = Boolean(locationId && canteenId && sourceText.trim().length >= 10 && !submitting);

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
          screenName,
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
        throw new Error(errorMessage ?? `Spuštění selhalo (${response.status}).`);
      }

      setResult(body);
    } catch (launchError) {
      setError(launchError instanceof Error ? launchError.message : "Spuštění TV selhalo.");
    } finally {
      setSubmitting(false);
    }
  }

  async function copyPlayerUrl() {
    if (!result?.playerUrl) {
      return;
    }

    await navigator.clipboard.writeText(result.playerUrl).catch(() => undefined);
  }

  return (
    <section className="card pad launch-panel" id="dnes-spustit-tv">
      <div className="topbar">
        <div>
          <p className="eyebrow">Dnešní spuštění</p>
          <h2 className="card-title">Menu → Image 2 šablona → TV web player</h2>
        </div>
        <StatusBadge tone={result ? "good" : error ? "critical" : "warn"}>
          {result ? "Publikováno" : error ? "Chyba" : "Připraveno"}
        </StatusBadge>
      </div>

      <form className="launch-form" onSubmit={submitLaunch}>
        <label>
          Provozovna
          <select
            onChange={(event) => {
              setLocationId(event.target.value);
              const firstCanteen = snapshot.canteens.find(
                (canteen) => canteen.locationId === event.target.value
              );
              setCanteenId(firstCanteen?.id ?? "");
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
          <select onChange={(event) => setCanteenId(event.target.value)} value={canteenId}>
            {selectedCanteens.map((canteen) => (
              <option key={canteen.id} value={canteen.id}>
                {canteen.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Datum menu
          <input onChange={(event) => setMenuDate(event.target.value)} type="date" value={menuDate} />
        </label>

        <label>
          Název TV
          <input onChange={(event) => setScreenName(event.target.value)} value={screenName} />
        </label>

        <label className="launch-wide">
          Denní jídelníček
          <textarea
            onChange={(event) => setSourceText(event.target.value)}
            rows={9}
            value={sourceText}
          />
        </label>

        <label className="launch-wide">
          Image 2 background prompt
          <textarea
            onChange={(event) => setBackgroundPrompt(event.target.value)}
            rows={3}
            value={backgroundPrompt}
          />
        </label>

        <div className="launch-actions">
          <button className="button primary" disabled={!canSubmit} type="submit">
            {submitting ? (
              <Loader2 className="spin" size={18} aria-hidden="true" />
            ) : (
              <Rocket size={18} aria-hidden="true" />
            )}
            {submitting ? "Spouštím..." : "Vygenerovat a pustit TV"}
          </button>
        </div>
      </form>

      {error ? <div className="launch-error">{error}</div> : null}

      {result ? (
        <div className="launch-result">
          <div>
            <CheckCircle2 size={20} aria-hidden="true" />
            <strong>TV smyčka je publikovaná v live režimu.</strong>
            <span>
              Položek: {result.itemCount} · varování: {result.warningCount} · token:{" "}
              {result.tokenPreview}
            </span>
          </div>
          {result.background?.signedUrl ? (
            <a href={result.background.signedUrl} rel="noreferrer" target="_blank">
              <Sparkles size={17} aria-hidden="true" />
              Background
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
        </div>
      ) : null}
    </section>
  );
}
