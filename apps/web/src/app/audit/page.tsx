import {
  visualAuditPresentations,
  visualAuditTemplates,
  type VisualAuditPresentation,
  type VisualAuditTemplate
} from "@masico/shared";
import { StudioShell } from "@/components/StudioShell";

export const dynamic = "force-dynamic";

export default function VisualAuditPage() {
  const presentationAverageBefore = Math.round(
    visualAuditPresentations.reduce((total, item) => total + item.scoreBefore, 0) /
      visualAuditPresentations.length
  );
  const presentationAverageAfter = Math.round(
    visualAuditPresentations.reduce((total, item) => total + item.scoreAfter, 0) /
      visualAuditPresentations.length
  );

  return (
    <StudioShell activeSection="audit">
      <div className="topbar">
        <div>
          <p className="eyebrow">Vizuální audit · 10 prezentací · 10 šablon</p>
          <h1 className="page-title">Kritická rada nad TV výstupy</h1>
          <p className="page-copy">
            Fiktivní, ale provozně realistické scénáře pro MASI-CO TV Studio. Každý náhled má
            vlastní vizuální kritiku a konkrétní změny, které by zvedly čitelnost, bezpečnost faktů
            a důvěru obsluhy.
          </p>
        </div>
        <div className="audit-score-card">
          <small>Čitelnost · fakta · layout</small>
          <span>Před kritikou</span>
          <strong>{presentationAverageBefore}</strong>
          <span>Po úpravě</span>
          <strong>{presentationAverageAfter}</strong>
        </div>
      </div>

      <section className="demo-banner" aria-label="Auditní režim">
        <strong>Fiktivní auditní data</strong>
        <span>
          Tyto prezentace nejsou publikované menu. Slouží jako designový test pro kontrast,
          hustotu textu, safe zónu, alergeny, ceny, promo sdělení a krizové změny nabídky.
        </span>
      </section>

      <nav className="audit-toolbar" aria-label="Sekce vizuálního auditu">
        <a href="#prezentace">10 prezentací</a>
        <a href="#sablony">10 šablon</a>
        <a href="/readiness">Readiness P0/P1</a>
      </nav>

      <section className="audit-section" id="prezentace">
        <div className="topbar">
          <div>
            <p className="eyebrow">10 fiktivních prezentací</p>
            <h2 className="card-title">Co by běželo na TV a proč to ještě zlepšit</h2>
          </div>
        </div>
        <div className="audit-grid">
          {visualAuditPresentations.map((presentation) => (
            <PresentationAuditCard key={presentation.id} presentation={presentation} />
          ))}
        </div>
      </section>

      <section className="audit-section" id="sablony">
        <div className="topbar">
          <div>
            <p className="eyebrow">10 šablon</p>
            <h2 className="card-title">Koncepce šablon, rizika a validační pravidla</h2>
          </div>
        </div>
        <div className="template-audit-grid">
          {visualAuditTemplates.map((template) => (
            <TemplateAuditCard key={template.id} template={template} />
          ))}
        </div>
      </section>
    </StudioShell>
  );
}

function PresentationAuditCard({
  presentation
}: {
  presentation: VisualAuditPresentation;
}) {
  return (
    <article className="card audit-card" data-audit-kind="presentation">
      <TvAuditPreview
        accent={presentation.accent}
        background={presentation.background}
        headline={presentation.headline}
        rows={presentation.rows}
      />
      <div className="audit-card-body">
        <div className="audit-card-heading">
          <div>
            <p className="eyebrow">{presentation.template}</p>
            <h3>{presentation.name}</h3>
          </div>
          <span className="audit-score">
            {presentation.scoreBefore} → {presentation.scoreAfter}
          </span>
        </div>
        <p className="muted">
          {presentation.location} · {presentation.scenario}
        </p>
        <AuditTextBlock title="Kritika" items={presentation.critique} tone="bad" />
        <AuditTextBlock title="Zlepšení" items={presentation.improvements} tone="good" />
      </div>
    </article>
  );
}

function TemplateAuditCard({ template }: { template: VisualAuditTemplate }) {
  return (
    <article className="card audit-card template-audit-card" data-audit-kind="template">
      <TemplatePreview template={template} />
      <div className="audit-card-body">
        <div className="audit-card-heading">
          <div>
            <p className="eyebrow">{template.layout}</p>
            <h3>{template.name}</h3>
          </div>
        </div>
        <p className="muted">
          <strong>{template.useCase}</strong>
          <br />
          {template.visualIdea}
        </p>
        <AuditTextBlock title="Kritika" items={template.critique} tone="bad" />
        <AuditTextBlock title="Zlepšení" items={template.improvements} tone="good" />
        <div className="audit-chip-row">
          {template.validationFocus.map((item) => (
            <span className="chip" key={`${template.id}-${item}`}>
              {item}
            </span>
          ))}
        </div>
      </div>
    </article>
  );
}

function TvAuditPreview({
  accent,
  background,
  headline,
  rows
}: {
  accent: string;
  background: string;
  headline: string;
  rows: VisualAuditPresentation["rows"];
}) {
  return (
    <div className="tv-audit-preview" style={{ background }}>
      <div className="tv-audit-safe">
        <div className="tv-audit-date" style={{ color: accent }}>
          Pondělí 6. července
        </div>
        <div className="tv-audit-headline">{headline}</div>
        <div className="tv-audit-rows">
          {rows.map((row) => (
        <div className="tv-audit-row" key={`${headline}-${row.label}`}>
          <div>
            <strong>{row.label}</strong>
            <span>{row.note}</span>
          </div>
          {row.price ? <b style={{ color: accent }}>{row.price}</b> : null}
          {row.label.length > 28 ? <em>Dlouhý název: zkontrolovat overflow</em> : null}
        </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TemplatePreview({ template }: { template: VisualAuditTemplate }) {
  return (
    <div className={`template-preview ${template.layout}`} style={{ background: template.background }}>
      <div className="template-preview-panel" style={{ borderColor: template.accent }}>
        <span style={{ backgroundColor: template.accent }}>{template.layout}</span>
        <strong>{template.name}</strong>
        <p>{template.useCase}</p>
      </div>
    </div>
  );
}

function AuditTextBlock({
  title,
  items,
  tone
}: {
  title: string;
  items: string[];
  tone: "bad" | "good";
}) {
  return (
    <div className={`audit-text-block ${tone}`}>
      <strong>{title}</strong>
      <ul>
        {items.map((item) => (
          <li key={`${title}-${item}`}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
