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
  const [sourceText, setSourceText] = useState("");
  const [menu, setMenu] = useState<MenuExtractionResult>(() => parsePastedMenuText(""));
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
  const itemCount = countItems(menu);
  const hasParsedItems = itemCount > 0;
  const nextStep = getMenuReviewNextStep({
    itemCount,
    blockingIssueCount: blockingIssues.length,
    warningCount: reviewWarnings.length - blockingIssues.length,
    canPublish: publishReadiness.canPublish,
    pendingStepCount: publishReadiness.steps.filter((step) => step.status !== "approved").length
  });

  function parseCurrentText() {
    setMenu(parsePastedMenuText(sourceText));
    setManualApprovals({});
  }

  function loadDemo() {
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
          <p className="eyebrow">Kontrola jídelníčku</p>
          <h2 className="card-title">Vložit dnešní jídelníček</h2>
        </div>
        <StatusBadge tone={!hasParsedItems ? "info" : blockingIssues.length === 0 ? "good" : "critical"}>
          {hasParsedItems
            ? blockingIssues.length === 0
              ? "Zkontrolováno - čeká na potvrzení"
              : `Opravit ${blockingIssues.length} položky`
            : "Čeká na vložení"}
        </StatusBadge>
      </div>

      <div className={`split ${hasParsedItems ? "" : "single"}`}>
        <form
          className="card pad import-panel"
          onSubmit={(event) => {
            event.preventDefault();
            parseCurrentText();
          }}
        >
          <label htmlFor="menu-source">Zdrojový text z denního jídelníčku</label>
          <div className="actions import-actions-top">
            <button className="button primary" disabled={sourceText.trim().length === 0} type="submit">
              <WandSparkles size={18} aria-hidden="true" />
              Zkontrolovat menu
            </button>
            <button className="button" onClick={loadDemo} type="button">
              <RotateCcw size={18} aria-hidden="true" />
              Načíst ukázku
            </button>
          </div>
          <textarea
            id="menu-source"
            onChange={(event) => {
              setSourceText(event.target.value);
              setMenu(parsePastedMenuText(""));
              setManualApprovals({});
            }}
            placeholder="Vložte sem celý text menu. Kontrola připraví náhled, na TV se nic nepošle."
            rows={12}
            value={sourceText}
          />
          <div className="actions">
            <button className="button primary" disabled={sourceText.trim().length === 0} type="submit">
              <WandSparkles size={18} aria-hidden="true" />
              Zkontrolovat menu
            </button>
            <button className="button" onClick={loadDemo} type="button">
              <RotateCcw size={18} aria-hidden="true" />
              Načíst ukázku
            </button>
          </div>
          <div className="source-safety-note">
            <FileText size={17} aria-hidden="true" />
            <span>
              Bezpečné: kontrola jen připraví náhled. Chybějící ceny ani alergeny se nevymýšlí.
            </span>
          </div>
        </form>

        {hasParsedItems ? (
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
                {menu.sections.flatMap((section) =>
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
                          <StatusBadge tone="warn">Zkontrolovat</StatusBadge>
                        ) : (
                          <StatusBadge tone="critical">Opravit</StatusBadge>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            <div className="mobile-menu-result-list">
              {menu.sections.flatMap((section) =>
                section.items.map((item) => (
                  <article className="mobile-menu-result" key={`mobile-${item.id}`}>
                    <div>
                      <span>{section.name}</span>
                      <strong>{item.name}</strong>
                      {item.shortName && item.shortName !== item.name ? (
                        <small>TV: {item.shortName}</small>
                      ) : null}
                    </div>
                    <dl>
                      <div>
                        <dt>Cena</dt>
                        <dd>{formatCzk(item.prices[0]?.amount ?? null)}</dd>
                      </div>
                      <div>
                        <dt>Alergeny</dt>
                        <dd>
                          <div className="chip-row">
                            {item.allergens.length > 0 ? (
                              item.allergens.map((code) => (
                                <span className="chip" key={`mobile-${item.id}-${code}`}>
                                  {getAllergenLabel(code)}
                                </span>
                              ))
                            ) : (
                              <span className="chip warn-chip">K ověření</span>
                            )}
                          </div>
                        </dd>
                      </div>
                      <div>
                        <dt>Kontrola</dt>
                        <dd>
                          {item.prices[0]?.amount !== null && !item.allergensUnknown ? (
                            <StatusBadge tone="warn">Zkontrolovat</StatusBadge>
                          ) : (
                            <StatusBadge tone="critical">Opravit</StatusBadge>
                          )}
                        </dd>
                      </div>
                    </dl>
                  </article>
                ))
              )}
            </div>
          </div>
        ) : null}
      </div>

      {hasParsedItems ? (
        <div className="grid cols-3">
          <AuditSummaryCard label="Položky" value={itemCount} tone="info" />
          <AuditSummaryCard label="Blokující chyby" value={blockingIssues.length} tone="critical" />
          <AuditSummaryCard label="Varování" value={reviewWarnings.length - blockingIssues.length} tone="warn" />
        </div>
      ) : null}

      {hasParsedItems && reviewWarnings.length > 0 ? (
        <div className="card pad" aria-live="polite" role="status">
          <p className="eyebrow">Co musí člověk zkontrolovat</p>
          <ul className="review-warning-list">
            {reviewWarnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <article className={`next-step-card ${nextStep.tone}`} aria-live="polite" role="status">
        <div>
          <p className="eyebrow">Další krok</p>
          <h3>{nextStep.title}</h3>
          <p>{nextStep.copy}</p>
        </div>
      </article>

      {hasParsedItems ? (
      <article className="card pad approval-panel">
          <div className="topbar">
          <div>
            <p className="eyebrow">Potvrzení</p>
            <h2 className="card-title">Před puštěním na TV</h2>
            <p className="muted">
              Každá změna textu znovu vyžaduje potvrzení obsahu, vzhledu a zálohy.
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
                  {step.label}: zkontrolováno.{" "}
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
            <strong>{formatApprovalNextAction(publishReadiness.nextAction)}</strong>
            <ul>
              {publishReadiness.auditTrail.map((line) => (
                <li key={line}>{formatAuditLine(line)}</li>
              ))}
            </ul>
          </div>
          <div className="actions">
            <button className="button" disabled type="button">
              <CheckSquare size={18} aria-hidden="true" />
              {publishReadiness.canPublish
                ? "Pustit na TV - demo režim"
                : "Pustit na TV - čeká na potvrzení"}
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
      ) : null}
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

function formatApprovalNextAction(nextAction: string) {
  if (nextAction.includes("Doplňte ruční potvrzení")) {
    return "Doplňte chybějící potvrzení před odesláním na TV.";
  }

  if (nextAction.includes("Checklist je splněný")) {
    return "Kontrola je hotová. V ostrém režimu půjde menu odeslat na TV.";
  }

  return nextAction;
}

function formatAuditLine(line: string) {
  return line
    .replace("ručně schváleno rolí approver", "ručně potvrzeno")
    .replace("ručně schváleno rolí publisher", "ručně potvrzeno")
    .replace("blokováno validací, publish nesmí pokračovat", "čeká na opravu")
    .replace("validace prošla, čeká na ruční potvrzení", "kontrola prošla, čeká na potvrzení");
}

function getMenuReviewNextStep(input: {
  itemCount: number;
  blockingIssueCount: number;
  warningCount: number;
  canPublish: boolean;
  pendingStepCount: number;
}) {
  if (input.itemCount === 0) {
    return {
      tone: "warn",
      title: "Vložte jídelníček",
      copy: "Zatím není co kontrolovat. Vložte text menu nebo načtěte ukázku."
    };
  }

  if (input.blockingIssueCount > 0) {
    return {
      tone: "critical",
      title: "Opravte položky v menu",
      copy: `Blokující chyby: ${input.blockingIssueCount}. Po opravě znovu spusťte kontrolu menu.`
    };
  }

  if (input.pendingStepCount > 0) {
    return {
      tone: "warn",
      title: "Doplňte potvrzení",
      copy: `Menu má ${input.itemCount} položky. Chybí potvrdit ${input.pendingStepCount} kontroly před TV.`
    };
  }

  return {
    tone: input.warningCount > 0 ? "warn" : "good",
    title: input.canPublish ? "Připraveno k odeslání na TV" : "Kontrola je hotová",
    copy: `${input.blockingIssueCount} blokujících chyb, ${input.warningCount} varování.`
  };
}
