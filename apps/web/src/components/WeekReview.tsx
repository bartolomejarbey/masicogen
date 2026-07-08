"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarOff,
  Check,
  CircleCheck,
  CircleDashed,
  FileText,
  Loader2,
  Pencil,
  TriangleAlert,
  Upload
} from "lucide-react";

export type WeekReviewDayState = "empty" | "holiday" | "review" | "ready";

export type WeekReviewDay = {
  date: string;
  state: WeekReviewDayState;
  holidayLabel: string | null;
  menuVersionId: string | null;
  /** true = menu přečetl systém z lístku (extraction_model openai-vision-week). */
  fromAutopilot: boolean;
  dishPreview: string[];
  itemCount: number;
};

type WeekReviewProps = {
  weekStart: string;
  days: WeekReviewDay[];
  locationId: string | null;
  canteenId: string | null;
  canImport: boolean;
  canApprove: boolean;
  sourcePhoto: { url: string; isPdf: boolean } | null;
};

type ApproveIssue = { code: string; message: string };

type ImportSummary = {
  importedCount: number;
  holidayCount: number;
  emptyCount: number;
  enqueuedPhotos: number;
  warnings: string[];
};

const supportedUploadTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

const stateCopy: Record<
  WeekReviewDayState,
  { label: string; hint: string }
> = {
  empty: { label: "Prázdný", hint: "Menu pro tento den zatím není." },
  holiday: { label: "Svátek", hint: "TV ten den ukáže sváteční oznámení." },
  review: { label: "Ke kontrole", hint: "Zkontrolujte ceny a alergeny, pak den schvalte." },
  ready: { label: "Připravený", hint: "V den D se na TV pustí sám." }
};

/**
 * Týdenní přehled: nahoře nahrání lístku (fotka/PDF), pod ním 5 karet PO–PÁ
 * vedle zdrojové fotky. Detail a úpravy = existující /den/[datum]; „Schválit
 * den“ volá stejný backend jako denní launch (rozhodnutí 14 blueprintu).
 */
export function WeekReview({
  weekStart,
  days,
  locationId,
  canteenId,
  canImport,
  canApprove,
  sourcePhoto
}: WeekReviewProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [importing, setImporting] = useState(false);
  const [importStep, setImportStep] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);

  const [approvingDate, setApprovingDate] = useState<string | null>(null);
  const [dayErrors, setDayErrors] = useState<Record<string, string>>({});
  const [dayIssues, setDayIssues] = useState<Record<string, ApproveIssue[]>>({});

  async function importWeekFile(file: File) {
    if (!locationId || !canteenId) {
      setImportError("Chybí údaje jídelny — obnovte stránku a zkuste to znovu.");
      return;
    }

    if (!supportedUploadTypes.includes(file.type)) {
      setImportError("Tento typ souboru neumíme přečíst. Nahrajte fotku (JPG, PNG) nebo PDF.");
      return;
    }

    setImporting(true);
    setImportError(null);
    setImportSummary(null);

    try {
      setImportStep("Nahrávám lístek…");
      const intentResponse = await fetch("/api/uploads/intent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          purpose: "menu_source",
          fileName: file.name,
          mimeType: file.type
        })
      });
      const intent = (await intentResponse.json().catch(() => null)) as
        | { bucket?: string; path?: string; token?: string; error?: string }
        | null;

      if (!intentResponse.ok || !intent?.path || !intent.token) {
        throw new Error(intent?.error ?? "Přípravu nahrání se nepodařilo dokončit.");
      }

      const { createBrowserSupabaseClient } = await import("@/lib/supabase/client");
      const supabase = createBrowserSupabaseClient();
      const upload = await supabase.storage
        .from(intent.bucket ?? "source-uploads")
        .uploadToSignedUrl(intent.path, intent.token, file, { contentType: file.type });

      if (upload.error) {
        throw new Error(`Nahrání lístku selhalo: ${upload.error.message}`);
      }

      setImportStep("Čtu jídelníček z lístku — může to trvat až minutu…");
      const importResponse = await fetch("/api/menus/import-week", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          locationId,
          canteenId,
          weekStart,
          path: intent.path,
          mimeType: file.type
        })
      });
      const body = (await importResponse.json().catch(() => null)) as
        | {
            ok?: boolean;
            days?: Array<{ status: string; warnings?: string[] }>;
            enqueuedPhotos?: number;
            error?: string;
          }
        | null;

      if (!importResponse.ok || !body?.ok) {
        throw new Error(body?.error ?? "Import týdne selhal. Zkuste to prosím znovu.");
      }

      const importedDays = body.days ?? [];
      setImportSummary({
        importedCount: importedDays.filter((day) => day.status === "imported").length,
        holidayCount: importedDays.filter((day) => day.status === "holiday").length,
        emptyCount: importedDays.filter((day) => day.status === "empty").length,
        enqueuedPhotos: body.enqueuedPhotos ?? 0,
        warnings: importedDays.flatMap((day) => day.warnings ?? [])
      });
      router.refresh();
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Import týdne selhal.");
    } finally {
      setImporting(false);
      setImportStep(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  async function approveDay(day: WeekReviewDay) {
    if (!day.menuVersionId || !locationId || !canteenId) {
      return;
    }

    setApprovingDate(day.date);
    setDayErrors((previous) => ({ ...previous, [day.date]: "" }));
    setDayIssues((previous) => ({ ...previous, [day.date]: [] }));

    try {
      const response = await fetch("/api/menus/week/approve-day", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          menuVersionId: day.menuVersionId,
          menuDate: day.date,
          locationId,
          canteenId
        })
      });
      const body = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string; issues?: ApproveIssue[] }
        | null;

      if (!response.ok || !body?.ok) {
        setDayErrors((previous) => ({
          ...previous,
          [day.date]: body?.error ?? "Schválení dne selhalo. Zkuste to prosím znovu."
        }));
        setDayIssues((previous) => ({ ...previous, [day.date]: body?.issues ?? [] }));
        return;
      }

      router.refresh();
    } catch {
      setDayErrors((previous) => ({
        ...previous,
        [day.date]: "Schválení dne selhalo. Zkontrolujte připojení a zkuste to znovu."
      }));
    } finally {
      setApprovingDate(null);
    }
  }

  return (
    <div className="week-review">
      <header className="week-review-head">
        <p className="eyebrow">Týdenní jídelníček</p>
        <h1>Týden od {formatCzechDateLong(weekStart)}</h1>
        <p>
          Nahrajte fotku nebo PDF týdenního lístku. Systém připraví všechny dny — vy je jen
          zkontrolujete a schválíte.
        </p>
      </header>

      {canImport ? (
        <section className="week-review-upload" aria-label="Nahrání týdenního lístku">
          <input
            accept={supportedUploadTypes.join(",")}
            className="visually-hidden-input"
            disabled={importing}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void importWeekFile(file);
              }
            }}
            ref={fileInputRef}
            type="file"
          />
          <button
            className="button primary week-review-upload-button"
            disabled={importing}
            onClick={() => fileInputRef.current?.click()}
            type="button"
          >
            {importing ? (
              <Loader2 className="spin" size={22} aria-hidden="true" />
            ) : (
              <Upload size={22} aria-hidden="true" />
            )}
            Nahrát týdenní lístek (fotka/PDF)
          </button>
          <p className="week-review-upload-hint">
            Vyfoťte celý lístek zpříma a při dobrém světle — čtení je pak spolehlivější.
          </p>
          {importStep ? (
            <p aria-live="polite" className="week-review-progress">
              <Loader2 className="spin" size={18} aria-hidden="true" />
              {importStep}
            </p>
          ) : null}
        </section>
      ) : (
        <p className="week-review-note">
          Nahrávání lístku je dostupné jen přihlášené obsluze s příslušným oprávněním.
        </p>
      )}

      {importError ? (
        <p className="week-review-banner error" role="alert">
          <TriangleAlert size={20} aria-hidden="true" />
          {importError}
        </p>
      ) : null}

      {importSummary ? (
        <div className="week-review-banner success" role="status">
          <Check size={20} aria-hidden="true" />
          <div>
            <strong>
              Lístek je načtený: {formatDayCount(importSummary.importedCount)} ke kontrole
              {importSummary.holidayCount > 0
                ? `, ${formatDayCount(importSummary.holidayCount)} se svátkem`
                : ""}
              {importSummary.emptyCount > 0
                ? `, ${formatDayCount(importSummary.emptyCount)} bez menu`
                : ""}
              .
            </strong>
            {importSummary.warnings.length > 0 ? (
              <ul>
                {importSummary.warnings.slice(0, 6).map((warning, index) => (
                  <li key={index}>{warning}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className={`week-review-layout ${sourcePhoto ? "with-photo" : ""}`}>
        {sourcePhoto ? (
          <aside className="week-review-source" aria-label="Nahraný lístek">
            <h2>Nahraný lístek</h2>
            {sourcePhoto.isPdf ? (
              <a className="button week-review-source-link" href={sourcePhoto.url} rel="noreferrer" target="_blank">
                <FileText size={20} aria-hidden="true" />
                Otevřít lístek (PDF)
              </a>
            ) : (
              <a href={sourcePhoto.url} rel="noreferrer" target="_blank">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img alt="Fotka nahraného týdenního lístku" src={sourcePhoto.url} />
              </a>
            )}
            <p>Porovnejte ceny a alergeny na obrazovce s tímto lístkem.</p>
          </aside>
        ) : null}

        <section className="week-review-days" aria-label="Dny týdne">
          {days.map((day) => {
            const copy = stateCopy[day.state];
            const issues = dayIssues[day.date] ?? [];
            const dayError = dayErrors[day.date];

            return (
              <article className={`week-review-day ${day.state}`} key={day.date}>
                <header className="week-review-day-head">
                  <div>
                    <h2>{formatWeekdayName(day.date)}</h2>
                    <p>{formatCzechDateLong(day.date)}</p>
                  </div>
                  <span className={`week-review-day-state ${day.state}`}>
                    <StateIcon state={day.state} />
                    {copy.label}
                  </span>
                </header>

                {day.state === "holiday" && day.holidayLabel ? (
                  <p className="week-review-day-holiday">{day.holidayLabel}</p>
                ) : null}

                {day.dishPreview.length > 0 ? (
                  <ul className="week-review-day-dishes">
                    {day.dishPreview.map((dish) => (
                      <li key={dish}>{dish}</li>
                    ))}
                    {day.itemCount > day.dishPreview.length ? (
                      <li className="more">… a dalších {day.itemCount - day.dishPreview.length}</li>
                    ) : null}
                  </ul>
                ) : (
                  <p className="week-review-day-hint">{copy.hint}</p>
                )}

                {day.fromAutopilot && day.state === "review" ? (
                  <p className="week-review-day-autopilot">
                    <TriangleAlert size={18} aria-hidden="true" />
                    Menu přečetl systém z lístku — zkontrolujte ceny a alergeny.
                  </p>
                ) : null}

                {dayError ? (
                  <p className="week-review-banner error" role="alert">
                    <TriangleAlert size={18} aria-hidden="true" />
                    {dayError}
                  </p>
                ) : null}

                {issues.length > 0 ? (
                  <ul className="week-review-day-issues">
                    {issues.slice(0, 6).map((issue, index) => (
                      <li key={`${issue.code}-${index}`}>{issue.message}</li>
                    ))}
                  </ul>
                ) : null}

                <div className="week-review-day-actions">
                  <a className="button week-review-action" href={`/den/${day.date}`}>
                    <Pencil size={20} aria-hidden="true" />
                    Otevřít den
                  </a>
                  {day.state === "review" && day.menuVersionId ? (
                    <button
                      className="button primary week-review-action"
                      disabled={!canApprove || approvingDate !== null}
                      onClick={() => void approveDay(day)}
                      type="button"
                    >
                      {approvingDate === day.date ? (
                        <Loader2 className="spin" size={20} aria-hidden="true" />
                      ) : (
                        <CircleCheck size={20} aria-hidden="true" />
                      )}
                      Schválit den
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </section>
      </div>
    </div>
  );
}

function StateIcon({ state }: { state: WeekReviewDayState }) {
  if (state === "ready") {
    return <CircleCheck size={18} aria-hidden="true" />;
  }
  if (state === "review") {
    return <Pencil size={18} aria-hidden="true" />;
  }
  if (state === "holiday") {
    return <CalendarOff size={18} aria-hidden="true" />;
  }
  return <CircleDashed size={18} aria-hidden="true" />;
}

function formatWeekdayName(isoDate: string) {
  const formatted = new Intl.DateTimeFormat("cs-CZ", { weekday: "long" }).format(
    new Date(`${isoDate}T12:00:00`)
  );
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function formatCzechDateLong(isoDate: string) {
  return new Intl.DateTimeFormat("cs-CZ", {
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(new Date(`${isoDate}T12:00:00`));
}

function formatDayCount(count: number) {
  if (count === 1) {
    return "1 den";
  }
  if (count >= 2 && count <= 4) {
    return `${count} dny`;
  }
  return `${count} dní`;
}
