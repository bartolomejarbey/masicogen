import {
  critiquePrompts,
  readinessFindings,
  readinessGates,
  screenshotAuditTargets,
  type ReadinessSeverity,
  type ReadinessStatus
} from "@masico/shared";
import { AlertTriangle, Camera, CheckCircle2, CircleDashed, ShieldAlert } from "lucide-react";
import { StudioShell } from "@/components/StudioShell";

export const dynamic = "force-dynamic";

const severityLabels: Record<ReadinessSeverity, string> = {
  P0: "Blokuje ostrý provoz",
  P1: "Musí se opravit před pilotem",
  P2: "Zlepšit před škálováním"
};

const statusLabels: Record<ReadinessStatus, string> = {
  open: "Otevřené",
  partial: "Částečně",
  passing: "Prochází"
};

export default function ReadinessPage() {
  const severityCounts = countBySeverity();
  const gateCounts = countByStatus(readinessGates.map((gate) => gate.status));
  const unresolvedFindings = readinessFindings.filter((finding) => finding.status !== "passing").length;

  return (
    <StudioShell activeSection="readiness">
      <div className="topbar">
        <div>
          <p className="eyebrow">Readiness audit · kritická rada · OCR checklist</p>
          <h1 className="page-title">Co ještě není dost dobré pro ostrý provoz</h1>
          <p className="page-copy">
            Tato obrazovka je interní protiváha k hezkému demu. Drží otevřené technické, vizuální
            a provozní slabiny, aby se z MASI-CO TV Studia nestal jen líbivý prototyp.
          </p>
        </div>
        <div className="readiness-score">
          <span>P0</span>
          <strong>{severityCounts.P0}</strong>
          <span>P1</span>
          <strong>{severityCounts.P1}</strong>
          <span>P2</span>
          <strong>{severityCounts.P2}</strong>
        </div>
      </div>

      <section className="readiness-hero-grid" aria-label="Souhrn readiness">
        <ReadinessMetric
          label="Neuzavřené riziko"
          value={unresolvedFindings}
          tone="bad"
        />
        <ReadinessMetric label="Částečně kryté" value={gateCounts.partial ?? 0} tone="warn" />
        <ReadinessMetric label="Procházející gate" value={gateCounts.passing ?? 0} tone="good" />
        <ReadinessMetric label="Screenshot cíle" value={screenshotAuditTargets.length} tone="info" />
      </section>

      <section className="readiness-section">
        <div className="section-heading-row">
          <div>
            <p className="eyebrow">P0 / P1 / P2</p>
            <h2 className="card-title">Otevřená kritika bez zjemnění</h2>
          </div>
          <span className="readiness-note">Řadit podle dopadu, ne podle toho, co se snadno opraví.</span>
        </div>
        <div className="finding-list">
          {readinessFindings.map((finding) => (
            <article className="card readiness-finding" data-severity={finding.severity} key={finding.id}>
              <div className="finding-title-row">
                <span className={`severity-pill ${finding.severity.toLowerCase()}`}>
                  {finding.severity}
                </span>
                <div>
                  <p className="eyebrow">{finding.category}</p>
                  <h3>{finding.title}</h3>
                  <p>{severityLabels[finding.severity]}</p>
                </div>
                <StatusDot status={finding.status} />
              </div>
              <dl className="finding-definition">
                <div>
                  <dt>Důkaz</dt>
                  <dd>{finding.evidence}</dd>
                </div>
                <div>
                  <dt>Dopad</dt>
                  <dd>{finding.impact}</dd>
                </div>
                <div>
                  <dt>Další akce</dt>
                  <dd>{finding.nextAction}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </section>

      <section className="readiness-section">
        <div className="section-heading-row">
          <div>
            <p className="eyebrow">Gates</p>
            <h2 className="card-title">Co musí být prokazatelné, ne jen slíbené</h2>
          </div>
        </div>
        <div className="gate-grid">
          {readinessGates.map((gate) => (
            <article className="card gate-card" key={gate.id}>
              <div className="gate-card-top">
                <StatusDot status={gate.status} />
                <strong>{statusLabels[gate.status]}</strong>
              </div>
              <h3>{gate.label}</h3>
              <p className="muted">{gate.evidence}</p>
              <span>{gate.owner}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="readiness-section">
        <div className="section-heading-row">
          <div>
            <p className="eyebrow">OCR / screenshot rada</p>
            <h2 className="card-title">Otázky, které se mají ptát po každé větší změně</h2>
          </div>
        </div>
        <div className="critique-grid">
          {critiquePrompts.map((prompt) => (
            <article className="card critique-card" key={prompt.id}>
              <ShieldAlert size={20} aria-hidden="true" />
              <p className="eyebrow">{prompt.round}</p>
              <h3>{prompt.question}</h3>
              <p>{prompt.whyItMatters}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="readiness-section">
        <div className="section-heading-row">
          <div>
            <p className="eyebrow">Screenshot matrix</p>
            <h2 className="card-title">Obrazovky, které musí projít očima i metrikami</h2>
          </div>
        </div>
        <div className="screenshot-target-list">
          {screenshotAuditTargets.map((target) => (
            <article className="card screenshot-target" key={target.id}>
              <div>
                <Camera size={19} aria-hidden="true" />
                <strong>{target.label}</strong>
                <span>{target.route}</span>
              </div>
              <p className="muted">
                Desktop: {target.desktopArtifact}
                <br />
                Mobil: {target.mobileArtifact}
              </p>
              <div className="audit-chip-row">
                {target.mustCheck.map((item) => (
                  <span className="chip" key={`${target.id}-${item}`}>
                    {item}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
    </StudioShell>
  );
}

function ReadinessMetric({
  label,
  value,
  tone
}: {
  label: string;
  value: number;
  tone: "bad" | "warn" | "good" | "info";
}) {
  return (
    <article className={`card readiness-metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function StatusDot({ status }: { status: ReadinessStatus }) {
  const Icon =
    status === "passing" ? CheckCircle2 : status === "partial" ? CircleDashed : AlertTriangle;

  return (
    <span className={`status-dot ${status}`} title={statusLabels[status]}>
      <Icon size={18} aria-hidden="true" />
    </span>
  );
}

function countBySeverity() {
  return readinessFindings.reduce<Record<ReadinessSeverity, number>>(
    (counts, finding) => {
      counts[finding.severity] += 1;
      return counts;
    },
    { P0: 0, P1: 0, P2: 0 }
  );
}

function countByStatus(statuses: ReadinessStatus[]) {
  return statuses.reduce<Partial<Record<ReadinessStatus, number>>>((counts, status) => {
    counts[status] = (counts[status] ?? 0) + 1;
    return counts;
  }, {});
}
