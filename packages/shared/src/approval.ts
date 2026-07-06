import type { DeckManifest, MenuExtractionResult, TemplateManifest } from "./schemas";
import {
  type ValidationIssue,
  validateDeckAgainstTemplates,
  validateMenuForApproval
} from "./validation";

export const approvalStepKeys = ["content", "layout", "export"] as const;

export type ApprovalStepKey = (typeof approvalStepKeys)[number];

export type ManualApprovalState = Partial<Record<ApprovalStepKey, boolean>>;

export type ExportEvidence = {
  available: boolean;
  label: string;
  artifactId?: string;
  checkedAt?: string;
  warnings?: string[];
};

export type ApprovalStepStatus = "blocked" | "pending" | "approved";

export type ApprovalStep = {
  key: ApprovalStepKey;
  label: string;
  requiredRole: "approver" | "publisher";
  status: ApprovalStepStatus;
  evidence: string;
  issues: ValidationIssue[];
};

export type PublishReadinessStatus = "blocked" | "needs_approval" | "ready";

export type PublishReadiness = {
  status: PublishReadinessStatus;
  canPublish: boolean;
  steps: ApprovalStep[];
  blockers: ValidationIssue[];
  pendingApprovals: ApprovalStepKey[];
  auditTrail: string[];
  nextAction: string;
};

type EvaluatePublishReadinessInput = {
  menu: MenuExtractionResult;
  deck: DeckManifest;
  templates: TemplateManifest[];
  manualApprovals?: ManualApprovalState;
  exportEvidence: ExportEvidence;
};

export function evaluatePublishReadiness({
  menu,
  deck,
  templates,
  manualApprovals = {},
  exportEvidence
}: EvaluatePublishReadinessInput): PublishReadiness {
  const menuIssues = validateMenuForApproval(menu);
  const deckIssues = validateDeckAgainstTemplates(deck, templates);
  const exportIssues = getExportIssues(exportEvidence);
  const steps: ApprovalStep[] = [
    createStep({
      key: "content",
      label: "Obsah, ceny a alergeny",
      requiredRole: "approver",
      issues: menuIssues,
      manuallyApproved: manualApprovals.content === true,
      passedEvidence: "Ceny, alergeny a datum jsou strukturované bez blokující chyby."
    }),
    createStep({
      key: "layout",
      label: "TV layout a čitelnost",
      requiredRole: "approver",
      issues: deckIssues,
      manuallyApproved: manualApprovals.layout === true,
      passedEvidence: "Deck používá známé šablony a obsah splňuje validační pravidla."
    }),
    createStep({
      key: "export",
      label: "MP4 export a fallback",
      requiredRole: "publisher",
      issues: exportIssues,
      manuallyApproved: manualApprovals.export === true,
      passedEvidence: exportEvidence.label
    })
  ];
  const blockers = steps.flatMap((step) =>
    step.issues.filter((issue) => issue.severity === "error")
  );
  const pendingApprovals = steps
    .filter((step) => step.status === "pending")
    .map((step) => step.key);
  const status: PublishReadinessStatus =
    blockers.length > 0 ? "blocked" : pendingApprovals.length > 0 ? "needs_approval" : "ready";

  return {
    status,
    canPublish: status === "ready",
    steps,
    blockers,
    pendingApprovals,
    auditTrail: steps.map(formatAuditTrailLine),
    nextAction: getNextAction(status, blockers, pendingApprovals)
  };
}

function createStep(input: {
  key: ApprovalStepKey;
  label: string;
  requiredRole: ApprovalStep["requiredRole"];
  issues: ValidationIssue[];
  manuallyApproved: boolean;
  passedEvidence: string;
}): ApprovalStep {
  const errorCount = input.issues.filter((issue) => issue.severity === "error").length;
  const status: ApprovalStepStatus =
    errorCount > 0 ? "blocked" : input.manuallyApproved ? "approved" : "pending";

  return {
    key: input.key,
    label: input.label,
    requiredRole: input.requiredRole,
    status,
    evidence:
      status === "blocked"
        ? `${errorCount} blokující ${errorCount === 1 ? "chyba" : "chyby"} před schválením.`
        : input.passedEvidence,
    issues: input.issues
  };
}

function getExportIssues(exportEvidence: ExportEvidence): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!exportEvidence.available) {
    issues.push({
      severity: "error",
      code: "missing_export",
      message: "Chybí úspěšně ověřený MP4 export pro publikaci."
    });
  }

  for (const warning of exportEvidence.warnings ?? []) {
    issues.push({
      severity: "warning",
      code: "export_warning",
      message: warning
    });
  }

  return issues;
}

function formatAuditTrailLine(step: ApprovalStep) {
  if (step.status === "approved") {
    return `${step.label}: ručně schváleno rolí ${step.requiredRole}.`;
  }

  if (step.status === "blocked") {
    return `${step.label}: blokováno validací, publish nesmí pokračovat.`;
  }

  return `${step.label}: validace prošla, čeká na ruční potvrzení.`;
}

function getNextAction(
  status: PublishReadinessStatus,
  blockers: ValidationIssue[],
  pendingApprovals: ApprovalStepKey[]
) {
  if (status === "ready") {
    return "Checklist je splněný; produkční publish mutace musí ještě zapsat audit log a přepnout screen pointer.";
  }

  if (blockers.length > 0) {
    return `Opravte blokující body: ${blockers.map((issue) => issue.message).join(" ")}`;
  }

  return `Doplňte ruční potvrzení: ${pendingApprovals.join(", ")}.`;
}
