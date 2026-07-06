"use client";

import { useMemo, useState } from "react";
import {
  defaultTemplateManifests,
  demoDeck,
  evaluatePublishReadiness,
  formatCzk,
  getAllergenLabel,
  parsePastedMenuText,
  validateMenuForApproval,
  type ApprovalStepKey,
  type ManualApprovalState,
  type MenuExtractionResult
} from "@masico/shared";
import { CheckSquare, Download, FileText, MonitorPlay, RotateCcw, WandSparkles } from "lucide-react";
import { StatusBadge } from "./StatusBadge";

const defaultSourceText = `Polévky
Gulášová polévka 49 Kč alergeny 1, 9
Hlavní jídla
Smažený vepřový řízek, bramborový salát 159 Kč alergeny 1, 3, 7, 10
Hovězí guláš, houskový knedlík 149 Kč al. 1, 3, 7`;

export function MenuReview() {
  const [sourceText, setSourceText] = useState(defaultSourceText);
  const [menu, setMenu] = useState<MenuExtractionResult>(() => parsePastedMenuText(defaultSourceText));
  const [manualApprovals, setManualApprovals] = useState<ManualApprovalState>({});
  const issues = useMemo(() => validateMenuForApproval(menu), [menu]);
  const publishReadiness = useMemo(
    () =>
      evaluatePublishReadiness({
        menu,
        deck: demoDeck,
        templates: defaultTemplateManifests,
        exportEvidence: {
          available: true,
          artifactId: "export-demo",
          label: "Lokální demo MP4 export je dostupný pro stažení i TV přehrávač."
        },
        manualApprovals
      }),
    [manualApprovals, menu]
  );
  const blockingIssues = issues.filter((issue) => issue.severity === "error");
  const reviewWarnings = useMemo(
    () => Array.from(new Set([...menu.warnings, ...issues.map((issue) => issue.message)])),
    [issues, menu.warnings]
  );

  function parseCurrentText() {
    setMenu(parsePastedMenuText(sourceText));
    setManualApprovals({});
  }

  function resetDemo() {
    setSourceText(defaultSourceText);
    setMenu(parsePastedMenuText(defaultSourceText));
    setManualApprovals({});
  }

  function toggleApproval(key: ApprovalStepKey, approved: boolean) {
    setManualApprovals((current) => ({
      ...current,
      [key]: approved
    }));
  }

  return (
    <section className="grid">
      <div className="topbar" style={{ marginBottom: 0 }}>
        <div>
          <p className="eyebrow">Import textu · kontrola jídelníčku</p>
          <h2 className="card-title">Paste menu → strukturovaná kontrola cen a alergenů</h2>
        </div>
        <StatusBadge tone={blockingIssues.length === 0 ? "good" : "critical"}>
          {blockingIssues.length === 0
            ? "Lokální parser prošel - není schváleno"
            : `Blokuje ${blockingIssues.length} ověření`}
        </StatusBadge>
      </div>

      <div className="split">
        <form
          className="card pad import-panel"
          onSubmit={(event) => {
            event.preventDefault();
            parseCurrentText();
          }}
        >
          <label htmlFor="menu-source">Zdrojový text z denního jídelníčku</label>
          <textarea
            id="menu-source"
            onChange={(event) => setSourceText(event.target.value)}
            rows={12}
            value={sourceText}
          />
          <div className="actions">
            <button className="button primary" type="submit">
              <WandSparkles size={18} aria-hidden="true" />
              Zpracovat lokálně
            </button>
            <button className="button" onClick={resetDemo} type="button">
              <RotateCcw size={18} aria-hidden="true" />
              Vrátit ukázku
            </button>
          </div>
          <div className="source-safety-note">
            <FileText size={17} aria-hidden="true" />
            <span>
              Text se bere jako nedůvěryhodný zdroj. Parser nevymýšlí chybějící ceny ani alergeny.
            </span>
          </div>
        </form>

        <div className="card table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Sekce</th>
                <th>Jídlo</th>
                <th>Cena</th>
                <th>Alergeny</th>
                <th>Jistota</th>
                <th>Kontrola</th>
              </tr>
            </thead>
            <tbody>
              {menu.sections.length === 0 ? (
                <tr>
                  <td colSpan={6}>Zatím není rozpoznaná žádná položka.</td>
                </tr>
              ) : (
                menu.sections.flatMap((section) =>
                  section.items.map((item) => (
                    <tr key={item.id}>
                      <td>{section.name}</td>
                      <td>
                        <strong>{item.name}</strong>
                        {item.shortName && item.shortName !== item.name ? (
                          <div className="muted">TV: {item.shortName}</div>
                        ) : null}
                      </td>
                      <td className="price">{formatCzk(item.prices[0]?.amount ?? null)}</td>
                      <td>
                        <div className="chip-row">
                          {item.allergens.length > 0 ? (
                            item.allergens.map((code) => (
                              <span className="chip" key={`${item.id}-${code}`}>
                                {getAllergenLabel(code)}
                              </span>
                            ))
                          ) : (
                            <span className="chip warn-chip">K ověření</span>
                          )}
                        </div>
                      </td>
                      <td>{Math.round(item.confidence * 100)} %</td>
                      <td>
                        {item.prices[0]?.amount !== null && !item.allergensUnknown ? (
                          <StatusBadge tone="warn">Rozpoznáno - ověřit</StatusBadge>
                        ) : (
                          <StatusBadge tone="critical">Opravit</StatusBadge>
                        )}
                      </td>
                    </tr>
                  ))
                )
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid cols-3">
        <AuditSummaryCard label="Položky" value={countItems(menu)} tone="info" />
        <AuditSummaryCard label="Blokující chyby" value={blockingIssues.length} tone="critical" />
        <AuditSummaryCard label="Varování" value={reviewWarnings.length - blockingIssues.length} tone="warn" />
      </div>

      {reviewWarnings.length > 0 ? (
        <div className="card pad">
          <p className="eyebrow">Co musí člověk zkontrolovat</p>
          <ul className="review-warning-list">
            {reviewWarnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <article className="card pad approval-panel">
        <div className="topbar">
          <div>
            <p className="eyebrow">Ruční schválení</p>
            <h2 className="card-title">Gate před publikací</h2>
            <p className="muted">
              Neuloženo. Nepublikováno. Každá změna textu resetuje ruční potvrzení obsahu,
              layoutu i exportu.
            </p>
          </div>
          <StatusBadge tone={getReadinessTone(publishReadiness.status)}>
            {getReadinessLabel(publishReadiness.status)}
          </StatusBadge>
        </div>

        <div className="approval-step-list">
          {publishReadiness.steps.map((step) => (
            <div className={`approval-step ${step.status}`} key={step.key}>
              <div className="approval-step-header">
                <div>
                  <strong>{step.label}</strong>
                  <span>{step.evidence}</span>
                </div>
                <StatusBadge tone={getStepTone(step.status)}>
                  {getStepLabel(step.status)}
                </StatusBadge>
              </div>

              <label className="approval-check">
                <input
                  checked={manualApprovals[step.key] === true}
                  disabled={step.status === "blocked"}
                  onChange={(event) => toggleApproval(step.key, event.target.checked)}
                  type="checkbox"
                />
                <span>
                  Ručně potvrzuji jako role {step.requiredRole}.{" "}
                  {step.status === "blocked" ? "Nejdřív opravte blokující chyby." : null}
                </span>
              </label>

              {step.issues.length > 0 ? (
                <ul className="approval-issue-list">
                  {step.issues.map((issue) => (
                    <li key={`${step.key}-${issue.code}-${issue.message}`}>
                      <strong>{issue.severity === "error" ? "Blokuje" : "Varování"}:</strong>{" "}
                      {issue.message}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
        </div>

        <div className="approval-summary">
          <div>
            <strong>{publishReadiness.nextAction}</strong>
            <ul>
              {publishReadiness.auditTrail.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
          <div className="actions">
            <button className="button" disabled type="button">
              <CheckSquare size={18} aria-hidden="true" />
              {publishReadiness.canPublish
                ? "Publikovat - čeká na produkční RPC"
                : "Publikovat - čeká na schválení"}
            </button>
            <a className="button" href="/tv/screen-demo" rel="noreferrer" target="_blank">
              <MonitorPlay size={18} aria-hidden="true" />
              Otevřít demo přehrávač
            </a>
            <a className="button" href="/api/exports/export-demo/download">
              <Download size={18} aria-hidden="true" />
              Stáhnout demo MP4
            </a>
          </div>
        </div>
      </article>
    </section>
  );
}

function AuditSummaryCard({
  label,
  value,
  tone
}: {
  label: string;
  value: number;
  tone: "info" | "critical" | "warn";
}) {
  return (
    <article className={`card pad import-summary ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function countItems(menu: MenuExtractionResult) {
  return menu.sections.reduce((total, section) => total + section.items.length, 0);
}

function getReadinessTone(status: "blocked" | "needs_approval" | "ready") {
  if (status === "ready") {
    return "good";
  }

  return status === "blocked" ? "critical" : "warn";
}

function getReadinessLabel(status: "blocked" | "needs_approval" | "ready") {
  if (status === "ready") {
    return "Checklist splněn";
  }

  return status === "blocked" ? "Blokuje publikaci" : "Čeká ruční schválení";
}

function getStepTone(status: "blocked" | "pending" | "approved") {
  if (status === "approved") {
    return "good";
  }

  return status === "blocked" ? "critical" : "warn";
}

function getStepLabel(status: "blocked" | "pending" | "approved") {
  if (status === "approved") {
    return "Schváleno";
  }

  return status === "blocked" ? "Blokováno" : "K potvrzení";
}
